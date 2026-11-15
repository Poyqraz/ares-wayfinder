"""T03: read one ROI from the CTX DEM/ortho over HTTP, write the validation report and G1 overlay.

Usage: uv run python t03_validate.py [roi_a|roi_b]
Outputs: science/roi_validation_<roi>.md, science/g1_overlay_<roi>.png, pipeline/cache/<roi>.npz
"""
import datetime
import math
import sys
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from PIL import Image, ImageDraw
from rasterio.crs import CRS
from rasterio.warp import Resampling, reproject
from rasterio.warp import transform as gdal_transform
from rasterio.windows import Window

from roi import NODATA_SOURCE, VALID, VALID_SLOPE_UNDEFINED, ground_dx, horn_slope_deg, validity, window_from_proj_bounds

BASE = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/"
DEM_URL = BASE + "ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif"
ORTHO_URL = BASE + "ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXortho_mosaic_5m.tif"
TRN_URL = BASE + "JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif"

ROIS = {
    "roi_a": {"lat": (18.422, 18.452), "lon": (77.436, 77.462)},
    "roi_b": {"lat": (18.420, 18.470), "lon": (77.420, 77.490)},
}
# UNVERIFIED until science task S2 checks them against primary sources.
MARKERS = {
    "Landing": (18.44463, 77.45088),
    "Roubion": (18.42769, 77.45165),
    "Rochette": (18.43074, 77.44437),
    "Sid": (18.44386, 77.45242),
}
REPO = Path(__file__).resolve().parent.parent
UP = 4  # overlay grid: 5 m cells, 4 per 20 m DEM cell


def hillshade(dem, dx, dy, az_deg=315.0, alt_deg=45.0):
    """Display-only Lambert hillshade in [0, 1]; NaN -> 0."""
    dzdn, dzde = np.gradient(dem, -dy, dx)  # row index increases southward
    n = np.stack([-dzde, -dzdn, np.ones_like(dem)])
    n /= np.linalg.norm(n, axis=0)
    az, alt = math.radians(az_deg), math.radians(alt_deg)
    light = np.array([math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt)])
    return np.nan_to_num(np.clip(np.tensordot(light, n, axes=1), 0, 1))


def stretch(a):
    lo, hi = np.nanpercentile(a, [2, 98])
    return np.clip((a - lo) / max(hi - lo, 1e-9) * 255, 0, 255)


def main(roi_id):
    box = ROIS[roi_id]
    stamp = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"), rasterio.open("/vsicurl/" + DEM_URL) as dem_ds:
        p = dem_ds.crs.to_dict()
        R = p.get("R") or p.get("a")
        lat_ts = p.get("lat_ts", 0.0)
        assert R and dem_ds.tags().get("AREA_OR_POINT") == "Area", (p, dem_ds.tags())
        geo = CRS.from_proj4(f"+proj=longlat +R={R} +no_defs")
        xs, ys = gdal_transform(geo, dem_ds.crs, list(box["lon"]), list(box["lat"]))
        col0, col1, row0, row1, x0, y0 = window_from_proj_bounds(dem_ds.transform, min(xs), max(xs), min(ys), max(ys))
        nx, ny = col1 - col0, row1 - row0
        dx, dy = dem_ds.transform.a, -dem_ds.transform.e
        z = dem_ds.read(1, window=Window(col0 - 1, row0 - 1, nx + 2, ny + 2))
        nodata = np.float32(dem_ds.nodata)
        z = np.where((z == nodata) | ~np.isfinite(z), np.nan, z).astype(np.float64)
        dem_crs = dem_ds.crs

    lat_c = math.degrees((y0 - ny * dy / 2) / R)
    dx_g, dy_g = ground_dx(dx, lat_c, lat_ts), dy
    slope = horn_slope_deg(z, dx_g, dy_g)
    dem = z[1:-1, 1:-1]
    v = validity(dem, slope)
    grid_t = Affine(dx, 0, x0, 0, -dy, y0)

    # Markers: which grid cell, its validity and elevation.
    mlats, mlons = [m[0] for m in MARKERS.values()], [m[1] for m in MARKERS.values()]
    mx, my = gdal_transform(geo, dem_crs, mlons, mlats)
    markers = []
    for name, x, y, la, lo in zip(MARKERS, mx, my, mlats, mlons):
        c, r = ~grid_t @ (x, y)
        ci, ri = math.floor(c), math.floor(r)
        inside = 0 <= ri < ny and 0 <= ci < nx
        markers.append({
            "name": name, "lat": la, "lon": lo, "row": ri, "col": ci, "inside": inside,
            "validity": int(v[ri, ci]) if inside else None,
            "h": float(dem[ri, ci]) if inside else None, "x": x, "y": y,
        })

    # S-5 cross-check: TRN DTM (independent product, lat_ts=0) at the same points.
    trn_note = ""
    try:
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"), rasterio.open("/vsicurl/" + TRN_URL) as trn:
            tx, ty = gdal_transform(geo, trn.crs, mlons, mlats)
            for m, val in zip(markers, trn.sample(zip(tx, ty), indexes=1)):
                tv = float(val[0])
                m["h_trn"] = None if (trn.nodata is not None and tv == trn.nodata) or not math.isfinite(tv) else tv
    except Exception as exc:  # report, do not hide: the cross-check is optional evidence
        trn_note = f"TRN cross-check not available: {type(exc).__name__}: {exc}"

    # Ortho resampled onto a 5 m grid aligned with the DEM window (display + G1 check only).
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"), rasterio.open("/vsicurl/" + ORTHO_URL) as o:
        ortho_crs_same = o.crs.to_dict() == dem_crs.to_dict()  # WKT names differ; parameters must not
        left, top = x0 - 60, y0 + 60
        right, bottom = x0 + nx * dx + 60, y0 - ny * dy - 60
        ow = o.window(left, bottom, right, top).round_offsets().round_lengths()
        src = o.read(1, window=ow).astype(np.float32)
        src_t = o.window_transform(ow)
        ortho_crs = o.crs
    ortho = np.full((ny * UP, nx * UP), np.nan, dtype=np.float32)
    reproject(src, ortho, src_transform=src_t, src_crs=ortho_crs, dst_transform=Affine(dx / UP, 0, x0, 0, -dy / UP, y0),
              dst_crs=dem_crs, resampling=Resampling.bilinear, dst_nodata=np.nan)

    out_dir = REPO / "science"
    out_dir.mkdir(exist_ok=True)
    cache = Path(__file__).parent / "cache"
    cache.mkdir(exist_ok=True)
    np.savez_compressed(cache / f"{roi_id}.npz", dem=dem, slope=slope, validity=v, ortho_5m=ortho,
                        dem_halo=z, meta=np.array([x0, y0, dx, dy, dx_g, dy_g, R, lat_ts, col0, row0]))

    png = write_overlay(out_dir / f"g1_overlay_{roi_id}.png", ortho, hillshade(dem, dx_g, dy_g), markers, grid_t, roi_id)
    write_report(out_dir / f"roi_validation_{roi_id}.md", locals())
    print(f"done: {png}")


def write_overlay(path, ortho, hs, markers, grid_t, roi_id):
    o = stretch(ortho)
    h = np.kron(hs, np.ones((UP, UP))) * 255
    blend = 0.5 * np.nan_to_num(o) + 0.5 * h
    panels = [np.nan_to_num(o), h, blend]
    scale = 2
    hgt, wid = o.shape
    canvas = Image.new("RGB", (3 * wid * scale + 40, hgt * scale + 70), "black")
    d = ImageDraw.Draw(canvas)
    titles = ["CTX ortho 5 m (resampled)", "Hillshade from CTX DEM 20 m", "50/50 blend (look for ghosting)"]
    for k, (panel, title) in enumerate(zip(panels, titles)):
        img = Image.fromarray(panel.astype(np.uint8)).resize((wid * scale, hgt * scale), Image.Resampling.NEAREST).convert("RGB")
        ox = 10 + k * (wid * scale + 10)
        canvas.paste(img, (ox, 40))
        d.text((ox, 22), title, fill="white")
        for m in markers:
            if not m["inside"]:
                continue
            c, r = ~grid_t @ (m["x"], m["y"])
            px, py = ox + c * UP * scale, 40 + r * UP * scale
            d.line([(px - 6, py), (px + 6, py)], fill="red", width=2)
            d.line([(px, py - 6), (px, py + 6)], fill="red", width=2)
            d.text((px + 7, py - 12), m["name"], fill="yellow")
        d.text((ox + wid * scale - 16, 46), "N", fill="cyan")
        d.line([(ox + wid * scale - 12, 74), (ox + wid * scale - 12, 58)], fill="cyan", width=2)
        bar = 500 / (20 / UP) * scale  # 500 m in canvas pixels
        d.line([(ox + 6, 40 + hgt * scale - 10), (ox + 6 + bar, 40 + hgt * scale - 10)], fill="white", width=3)
        d.text((ox + 6, 40 + hgt * scale - 26), "500 m", fill="white")
    d.text((10, 4), f"G1 overlay {roi_id} - markers UNVERIFIED (S2) - NASA/JPL/USGS CTX data", fill="white")
    canvas.save(path)
    return path


def write_report(path, L):
    dem, slope, v, markers = L["dem"], L["slope"], L["v"], L["markers"]
    total = v.size
    routable = int(np.isin(v, [VALID, VALID_SLOPE_UNDEFINED]).sum())
    nod = int((v == NODATA_SOURCE).sum())
    pct = np.nanpercentile(slope, [50, 90, 99]) if np.isfinite(slope).any() else [math.nan] * 3
    s3 = routable / total >= 0.98 and all(m["inside"] and m["validity"] in (VALID, VALID_SLOPE_UNDEFINED) for m in markers)
    rows = "\n".join(
        f"| {m['name']} | {m['lat']:.5f} | {m['lon']:.5f} | {m['row']} | {m['col']} | {m['inside']} | {m['validity']} | "
        f"{'' if m['h'] is None else f'{m['h']:.1f}'} | {'' if m.get('h_trn') is None else f'{m['h_trn']:.1f}'} |"
        for m in markers
    )
    text = f"""# ROI validation — {L['roi_id']} (generated by pipeline/t03_validate.py)

Generated: {L['stamp']} UTC. Numbers below come from real pixel reads; re-run the script to refresh.

## Source and window

- DEM: `{DEM_URL}`
- Ortho: `{ORTHO_URL}` (same CRS as DEM: {L['ortho_crs_same']})
- CRS: Equirectangular sphere R = {L['R']} m, lat_ts = {L['lat_ts']}°, pixel-is-area
- ROI box: lat {L['box']['lat']}, lon {L['box']['lon']} (planetocentric, east-positive)
- Window (contract rounding): cols {L['col0']}–{L['col1']} (excl.), rows {L['row0']}–{L['row1']} (excl.) → nx = {L['nx']}, ny = {L['ny']}
- x0 = {L['x0']}, y0 = {L['y0']}, dx_proj = {L['dx']}, dy_proj = {L['dy']}
- Window centre latitude {L['lat_c']:.5f}° → dx_ground_m = {L['dx_g']:.6f}, dy_ground_m = {L['dy_g']}

## S-3 coverage

| Metric | Value |
|---|---|
| Cells | {total} |
| Routable (validity 0 or 3) | {routable} ({routable / total:.2%}) |
| NODATA_SOURCE | {nod} |
| VALID_SLOPE_UNDEFINED | {int((v == VALID_SLOPE_UNDEFINED).sum())} |

## S-5 elevation and slope (descriptive, not hazard)

| Metric | Value |
|---|---|
| Elevation min / median / max (m) | {np.nanmin(dem):.1f} / {np.nanmedian(dem):.1f} / {np.nanmax(dem):.1f} |
| Slope p50 / p90 / p99 / max (deg) | {pct[0]:.2f} / {pct[1]:.2f} / {pct[2]:.2f} / {np.nanmax(slope):.2f} |
| Cells with slope > 15° / 20° / 25° | {int((slope > 15).sum())} / {int((slope > 20).sum())} / {int((slope > 25).sum())} |

Vertical reference is **not stated** in the DEM metadata. The TRN DTM column below is an independent
CTX product tied to MOLA topography; a consistent offset suggests a shared areoid-type reference,
but this is evidence, not proof.

## Markers (coordinates UNVERIFIED until S2)

| Name | Lat | Lon | Row | Col | Inside | Validity | h DEM (m) | h TRN (m) |
|---|---|---|---|---|---|---|---|---|
{rows}

{L['trn_note']}

## Sign-off (G1)

- [{'x' if s3 else ' '}] S-3 automatic: routable ≥ 98 % and every marker cell routable → **{'PASS' if s3 else 'FAIL'}**
- [ ] S-4 human: `g1_overlay_{L['roi_id']}.png` — at least 3 features line up within 1 DEM cell (20 m), no ghosting
- [ ] S-5 human: elevation and slope values plausible; DEM vs TRN offset noted
- [ ] S-6 human: source, mission and instrument labels correct
"""
    path.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "roi_a")
