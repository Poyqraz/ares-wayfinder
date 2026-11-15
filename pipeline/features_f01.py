"""F01 three-raster verification (western delta fan front / Hawksbill Gap) + terrain-feature evidence layer F01-F03.

Science plan: team document ARES1_ARAZI_BILIMSEL_DOGRULAMA.md v0.9 (approved as a PLAN). This script does the raster part
for F01 only; F02/F03 keep their literature evidence and PENDING raster measurements.
Rasters (explicit source selection, all eqc lat_ts 0 lon_0 0, R 3 396 190 m, read by HTTP range):
  CTX-2020    JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif            (imagery, 6 m)
  DEM-2020    JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_..._blend40 (elevation, 1 m -> 2 m analysis cells)
  HIRISE-2020 JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif   (imagery; NOT the soc_007 display product)
Boundary: an ALGORITHMIC break-in-slope candidate (crest/foot where the transect slope drops below a threshold), not a
hand-digitised geological contact. It needs geology review before any status beyond automated measurement.
Never used for routing; validated_for_human_eva is always false.
Usage (from pipeline/): uv run python features_f01.py  -> analysis/features/<version>/
"""
import csv
import datetime
import hashlib
import io
import json
import math
import shutil
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from PIL import Image, ImageDraw
from rasterio.warp import Resampling, reproject, transform_bounds
from rasterio.windows import Window
from scipy import ndimage

import registration_check as reg
from m0a_g3g4 import PAIR_URL, read_float
from m0a_validate import CTX, ENV, HI
from roi import ground_dx, horn_slope_deg
from t03_validate import hillshade

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "analysis" / "features"
R = 3396190.0
SRC = {
    "CTX-2020": {"url": CTX + "JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif", "doi": "10.5066/P9GV1ND3", "role": "imagery (context)"},
    "DEM-2020": {"url": HI + "JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif", "doi": "10.5066/P9REJ9JN", "role": "elevation"},
    "HIRISE-2020": {"url": HI + "JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif", "doi": "10.5066/P9QJDP48", "role": "imagery (detail)"},
}
DOI_NOTE = "DOI as given in the team document v0.9; product file names and headers verified here, DOI landing pages not resolved offline."
ANCHORS = {  # verified against ares1/sources/raw/nasa_mmgis/M20_waypoints.json (exact match)
    "F01": {"lat": 18.45869497, "lon": 77.40595178, "sol": 501, "rmc": "26_1154"},
    "F02": {"lat": 18.48292946, "lon": 77.36900835, "sol": 770, "rmc": "39_650"},
    "F03": {"lat": 18.49748444, "lon": 77.30519089, "sol": 1210, "rmc": "56_0"},
}
HALF_M = 350.0  # F01 working-window half size (team plan); a window, not the feature extent
THETA = (8.0, 10.0, 12.0)  # crest/foot picking thresholds (deg); 10 is nominal
BASE_M = (6.0, 10.0, 20.0)  # profile-slope baselines (m); 10 is nominal


def verify_anchors():
    w = json.loads((REPO / "ares1" / "sources" / "raw" / "nasa_mmgis" / "M20_waypoints.json").read_bytes())
    out = {}
    for fid, a in ANCHORS.items():
        hit = [f for f in w["features"] if f["properties"].get("sol") == a["sol"] and f["properties"].get("RMC") == a["rmc"]]
        lon, lat = hit[0]["geometry"]["coordinates"][:2]
        assert abs(lat - a["lat"]) < 1e-9 and abs(lon - a["lon"]) < 1e-9, fid
        out[fid] = True
    return out


def header(src):
    p = src.crs.to_dict()
    assert p.get("proj") == "eqc" and p.get("lat_ts", 0) == 0 and p.get("lon_0", 0) == 0 and p.get("R") == R, src.crs.to_proj4()
    assert src.tags().get("AREA_OR_POINT") == "Area" and src.transform.b == 0 and src.transform.d == 0 and src.transform.e < 0
    return {"size": [src.width, src.height], "dtype": src.dtypes[0], "nodata": src.nodata, "crs": src.crs.to_proj4(),
            "transform": list(src.transform)[:6], "pixel_is": "Area"}


def block_mean(a, k):
    h, w = a.shape
    return a[: h // k * k, : w // k * k].reshape(h // k, k, w // k, k).mean(axis=(1, 3))


def arr_hash(a):
    return hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest()


def main():
    anchors_ok = verify_anchors()
    a = ANCHORS["F01"]
    Ea, Na = R * math.radians(a["lon"]), R * math.radians(a["lat"])
    kx = ground_dx(1.0, a["lat"], 0.0)  # ground metres per projected metre east-west (lat_ts 0)
    qa = {"feature_id": "F01",
          "anchors_verified_in_mmgis": anchors_ok, "sources": {}, "window": {}, "registration": {}, "measurements": {}, "uncertainty": {}}
    with rasterio.Env(**ENV):
        # --- DEM: 1 m window aligned to its own pixels, 2 m cells (2x2 mean), 1-cell halo for Horn slope
        with rasterio.open("/vsicurl/" + SRC["DEM-2020"]["url"]) as d:
            qa["sources"]["DEM-2020"] = {**SRC["DEM-2020"], "header": header(d)}
            X0, Y0 = d.transform.c, d.transform.f
            c0 = math.floor(Ea - HALF_M / kx - X0); c0 -= c0 % 2
            r0 = math.floor(Y0 - (Na + HALF_M)); r0 -= r0 % 2
            ncol = math.ceil(2 * HALF_M / kx); ncol += ncol % 2
            nrow = math.ceil(2 * HALF_M); nrow += nrow % 2
            raw = read_float(d, Window(c0 - 2, r0 - 2, ncol + 4, nrow + 4))
        x0, y0 = X0 + c0, Y0 - r0
        z2 = block_mean(raw, 2)
        dem = z2[1:-1, 1:-1]
        ny, nx = dem.shape
        dxg, dyg = 2.0 * kx, 2.0
        slope = horn_slope_deg(z2, dxg, dyg)
        qa["window"] = {"crs": "eqc lat_ts 0 lon_0 0 R 3396190 (all three products)", "x0": x0, "y0": y0, "cell_proj_m": 2.0,
                        "cell_ground_m": [dxg, dyg], "nx": nx, "ny": ny, "half_size_ground_m": HALF_M,
                        "dem_source_window_px": {"col0": c0, "row0": r0, "cols": ncol, "rows": nrow}}
        qa["sources"]["DEM-2020"].update({"window_nodata_share": round(float(np.isnan(raw).mean()), 6), "window_sha256": arr_hash(raw)})
        # --- independent stereo pairs on the same 2 m grid (relative vertical uncertainty)
        dst_t = Affine(2.0, 0, x0, 0, -2.0, y0)
        crs = "+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs"
        pairs = {}
        for pair in ("C", "W", "DL"):
            with rasterio.open("/vsicurl/" + PAIR_URL.format(pair)) as s:
                w = s.window(*transform_bounds(crs, s.crs, x0 - 4, y0 - ny * 2 - 4, x0 + nx * 2 + 4, y0 + 4, densify_pts=32)).round_offsets().round_lengths()
                g = np.full((ny, nx), np.nan)
                reproject(read_float(s, w), g, src_transform=s.window_transform(w), src_crs=s.crs, dst_transform=dst_t, dst_crs=crs,
                          resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan)
                pairs[pair] = g
        mosaic_pair = {p: round(float((np.abs(dem - g) < 1e-3).mean()), 4) for p, g in pairs.items()}
        # --- HiRISE soc_006 ortho: pixel-aligned with the DTM (same origin, 0.25 m) -> 1 m panel by 4x4 mean
        with rasterio.open("/vsicurl/" + SRC["HIRISE-2020"]["url"]) as h:
            qa["sources"]["HIRISE-2020"] = {**SRC["HIRISE-2020"], "header": header(h)}
            assert h.transform.c == X0 and h.transform.f == Y0 and h.transform.a == 0.25, "expected pixel alignment with the DTM"
            hr = h.read(1, window=Window(c0 * 4, r0 * 4, nx * 8, ny * 8)).astype(np.float64)
        qa["sources"]["HIRISE-2020"].update({"window_nodata_share": round(float((hr == 0).mean()), 6), "window_sha256": arr_hash(hr)})
        hr[hr == 0] = np.nan
        hi1 = block_mean(hr, 4)  # 1 m panel grid
        # --- CTX 6 m: native window for registration; resampled to the 1 m panel grid for display only
        with rasterio.open("/vsicurl/" + SRC["CTX-2020"]["url"]) as c:
            qa["sources"]["CTX-2020"] = {**SRC["CTX-2020"], "header": header(c)}
            cw = c.window(x0 - 30, y0 - ny * 2 - 30, x0 + nx * 2 + 30, y0 + 30).round_offsets().round_lengths()
            craw = c.read(1, window=cw).astype(np.float64)
            ct = c.window_transform(cw)
        qa["sources"]["CTX-2020"].update({"window_nodata_share": round(float((craw == 0).mean()), 6), "window_sha256": arr_hash(craw)})
        ctx1 = np.full(hi1.shape, np.nan)
        reproject(np.where(craw == 0, np.nan, craw), ctx1, src_transform=ct, src_crs=crs, dst_transform=Affine(1.0, 0, x0, 0, -1.0, y0),
                  dst_crs=crs, resampling=Resampling.bilinear, src_nodata=np.nan, dst_nodata=np.nan)

    # --- registration checks (NCC, existing method): HiRISE vs CTX on 6 m, DTM hillshade vs HiRISE on 2 m
    def ncc_shift(ref, mov, px_e, px_n):
        a_hp, b_hp = reg.highpass(ref, 0.0), reg.highpass(mov, 0.0)
        M = reg.MAXS
        p = reg.peak(reg.surface(a_hp, b_hp, M, ref.shape[0] - M, M, ref.shape[1] - M))
        return {"east_m": round(p["sx"] * px_e, 2), "north_m": round(-p["sy"] * px_n, 2), "ncc": round(p["ncc"], 3),
                "sharpness": round(p["sharp"], 3), "peak_on_search_edge": bool(p["edge"])}
    hi6 = np.full((ny // 3, nx // 3), np.nan)
    reproject(hi1, hi6, src_transform=Affine(1.0, 0, x0, 0, -1.0, y0), src_crs=crs, dst_transform=Affine(6.0, 0, x0, 0, -6.0, y0), dst_crs=crs,
              resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan)
    ctx6 = np.full(hi6.shape, np.nan)
    reproject(np.where(craw == 0, np.nan, craw), ctx6, src_transform=ct, src_crs=crs, dst_transform=Affine(6.0, 0, x0, 0, -6.0, y0), dst_crs=crs,
              resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan)
    qa["registration"]["ctx_vs_hirise_6m"] = {**ncc_shift(ctx6, hi6, 6 * kx, 6), "convention": "feature in CTX minus in HiRISE"}
    hi2 = block_mean(hi1, 2)
    az_best = max(((az, alt) for az in range(0, 360, 15) for alt in (30, 45, 60)),
                  key=lambda t: reg.ncc(reg.highpass(hi2, 1.0), reg.highpass(hillshade(dem, dxg, dyg, *t), 0)))
    qa["registration"]["dtm_hillshade_vs_hirise_2m"] = {**ncc_shift(reg.highpass(hi2, 1.0), hillshade(dem, dxg, dyg, *az_best), dxg, dyg),
                                                        "sun_az_alt_deg": list(az_best), "convention": "feature in HiRISE minus in DTM"}

    # --- dominant downslope direction of the steep band (ground frame, unit vector)
    sm = ndimage.gaussian_filter(dem, 2.5)
    gy, gx = np.gradient(sm, -dyg, dxg)  # dz/dN (rows run south), dz/dE
    steep = slope > 15
    vec = np.stack([-gx[steep], -gy[steep]], axis=1)
    vec /= np.linalg.norm(vec, axis=1, keepdims=True)
    u = vec.mean(axis=0); u /= np.linalg.norm(u)  # downslope (E, N)
    v = np.array([-u[1], u[0]])  # along strike

    def sample(z, pts_en):  # bilinear at ground offsets from the anchor
        E = Ea + pts_en[:, 0] / kx
        N = Na + pts_en[:, 1]
        cols, rows = (E - x0) / 2.0 - 0.5, (y0 - N) / 2.0 - 0.5
        return ndimage.map_coordinates(z, [rows, cols], order=1, cval=np.nan)

    def pick(prof_s, h, theta, base):
        half = int(round(base / 2))
        g = np.full_like(h, np.nan)
        g[half:-half] = (h[2 * half:] - h[:-2 * half]) / (2 * half)  # dh/ds along downslope s (1 m step)
        steepd = np.degrees(np.arctan(np.maximum(0, -g)))
        core = np.where(np.abs(prof_s) <= 150, steepd, np.nan)
        if not np.isfinite(core).any():
            return None
        k = int(np.nanargmax(core))
        if core[k] < theta + 2:
            return None
        i = k
        while i > 0 and np.isfinite(steepd[i]) and steepd[i] >= theta:
            i -= 1
        j = k
        while j < len(h) - 1 and np.isfinite(steepd[j]) and steepd[j] >= theta:
            j += 1
        if not (np.isfinite(steepd[i]) and np.isfinite(steepd[j])) or steepd[i] >= theta or steepd[j] >= theta:
            return None
        return {"crest_s": float(prof_s[i]), "foot_s": float(prof_s[j]), "steepest_s": float(prof_s[k]), "steepest_deg": float(core[k])}

    s = np.arange(-200.0, 200.5, 1.0)
    def transect(offset, z=dem, theta=10.0, base=10.0):
        pts = (offset * v)[None, :] + s[:, None] * u[None, :]
        h = sample(z, pts)
        return pts, h, pick(s, h, theta, base)

    def measure(h, p, z_slope=slope, pts=None):
        ic, jf = int(round(p["crest_s"] + 200)), int(round(p["foot_s"] + 200))
        dz, dd = float(h[ic] - h[jf]), float(p["foot_s"] - p["crest_s"])
        out = {"crest_elev_m": float(h[ic]), "foot_elev_m": float(h[jf]), "delta_z_m": dz, "horizontal_span_m": dd,
               "mean_transect_slope_deg": math.degrees(math.atan2(dz, dd))}
        if pts is not None:  # Horn cell slopes within 10 m of the crest-foot segment
            seg = pts[ic:jf + 1]
            rows, cols = np.mgrid[0:ny, 0:nx]
            cE = (x0 + (cols + 0.5) * 2.0 - Ea) * kx
            cN = y0 - (rows + 0.5) * 2.0 - Na
            dmin = np.full((ny, nx), np.inf)
            for q in seg[::2]:
                dmin = np.minimum(dmin, np.hypot(cE - q[0], cN - q[1]))
            vals = z_slope[(dmin <= 10.0) & np.isfinite(z_slope)]
            out.update({"local_slope_cells": int(vals.size), "local_slope_mean_deg": float(vals.mean()), "local_slope_p50_deg": float(np.percentile(vals, 50)),
                        "local_slope_p95_deg": float(np.percentile(vals, 95)), "local_slope_max_deg": float(vals.max())})
        return out

    pts0, h0, p0 = transect(0.0)
    if p0 is None:
        raise SystemExit("F01: no break in slope crosses the anchor transect; nothing is measured (no fallback).")
    nominal = measure(h0, p0, pts=pts0)
    lines = {"crest": [], "foot": []}
    for off in np.arange(-300.0, 300.1, 25.0):
        pts, h, p = transect(off, theta=10.0)
        if p is not None and np.isfinite(h).all():
            for key in ("crest", "foot"):
                q = (off * v) + p[f"{key}_s"] * u
                lines[key].append([float(q[0]), float(q[1])])
    # uncertainty components, each from a computation (none assumed)
    thr = {f"theta_{t:g}deg": measure(h0, pk) for t in THETA if (pk := pick(s, h0, t, 10.0))}
    base = {f"baseline_{b:g}m": measure(h0, pk) for b in BASE_M if (pk := pick(s, h0, 10.0, b))}
    dems = {}
    for name, z in pairs.items():
        _, hp, pp = transect(0.0, z=z)
        if pp:
            zs = np.pad(z, 1, mode="edge")
            dems[f"pair_{name}"] = measure(hp, pp, z_slope=horn_slope_deg(zs, dxg, dyg), pts=pts0)
    def spread(group, key):
        vals = [m[key] for m in group.values() if key in m]
        return [round(min(vals), 2), round(max(vals), 2)] if vals else None
    keys = ("delta_z_m", "horizontal_span_m", "mean_transect_slope_deg", "local_slope_p95_deg")
    qa["measurements"] = {
        "method": ("Transect through the F01 rover anchor along the dominant downslope direction of cells steeper than 15 deg "
                   f"(unit vector E {u[0]:.4f}, N {u[1]:.4f}); profile sampled bilinearly every 1 m on the 2 m HiRISE DTM cells; crest and foot "
                   "= where the profile slope (10 m baseline) falls below 10 deg on either side of the steepest point; "
                   "local slope = Horn 3x3 cell slopes within 10 m of the crest-foot segment."),
        "nominal": {k: round(v_, 3) if isinstance(v_, float) else v_ for k, v_ in nominal.items()},
        "picks": {k: round(v_, 2) for k, v_ in p0.items()},
    }
    grade_noise_deg = math.degrees(math.atan(0.048))
    qa["uncertainty"] = {
        "source_resolution": {"DEM-2020": "1 m posting (2 m analysis cells); effective resolution several metres", "CTX-2020": "6 m",
                              "HIRISE-2020": "0.25 m (1 m panel)"},
        "picking_threshold_range": {k: spread(thr, k) for k in keys if k != "local_slope_p95_deg"},
        "profile_baseline_range": {k: spread(base, k) for k in keys if k != "local_slope_p95_deg"},
        "independent_stereo_dem_range": {k: spread(dems, k) for k in keys},
        "mosaic_equals_pair_share": mosaic_pair,
        "vertical": ("Relative: independent stereo pairs give the delta_z range above (constant pair offsets up to 2.4 m cancel in delta_z). "
                     f"Per-2 m-edge grade noise from M0-A pair comparison <= 0.048 (~{grade_noise_deg:.1f} deg). Absolute vertical datum UNVERIFIED."),
        "registration": "See registration: HiRISE vs CTX and DTM hillshade vs HiRISE shifts; these move the boundary in the imagery panels, not the DEM measurements.",
        "interpretation": ("The crest/foot line is an algorithmic break-in-slope candidate on a multi-part delta front; a geologist may place the "
                           "fan-front contact differently. Image correlation does not certify the geology."),
    }
    qa["status"] = {"three_raster_validation": "AUTOMATED_MEASUREMENT_PENDING_REVIEW", "qa_status": "LITERATURE_CONFIRMED",
                    "next_required": "THREE_LAYER_VISUALLY_CONFIRMED by the geology reviewer (team plan step 10)",
                    "reviewer": None, "validated_for_human_eva": False, "used_in_routing": False}
    qa["doi_note"] = DOI_NOTE

    tmp = OUT / "_staging"
    shutil.rmtree(tmp, ignore_errors=True)
    (tmp / "F01").mkdir(parents=True)
    to_geo = lambda q: {"lat": math.degrees((Na + q[1]) / R), "lon": math.degrees((Ea + q[0] / kx) / R)}  # noqa: E731
    geom = {"type": "FeatureCollection", "crs_note": "Mars: planetocentric latitude, east-positive longitude, sphere R 3396190 m (not WGS84)",
            "features": [
                {"id": "F01-anchor", "kind": "rover_anchor", "point": to_geo((0.0, 0.0)), "source": f"NASA MMGIS sol {a['sol']} RMC {a['rmc']}"},
                {"id": "F01-crest", "kind": "algorithmic_break_in_slope_crest", "line": [to_geo(q) for q in lines["crest"]], "status": "candidate, pending review"},
                {"id": "F01-foot", "kind": "algorithmic_break_in_slope_foot", "line": [to_geo(q) for q in lines["foot"]], "status": "candidate, pending review"},
                {"id": "F01-transect", "kind": "measurement_transect", "line": [to_geo(pts0[int(round(p0['crest_s'] + 200))]), to_geo(pts0[int(round(p0['foot_s'] + 200))])]},
            ]}
    (tmp / "F01" / "F01_geometry.json").write_bytes(json.dumps(geom, indent=1).encode())
    buf = io.StringIO()
    wr = csv.writer(buf, lineterminator="\n")
    wr.writerow(["s_m_downslope", "dE_ground_m", "dN_ground_m", "lat", "lon", "h_mosaic_m", "h_pair_C_m", "h_pair_W_m", "h_pair_DL_m"])
    hp = {k: sample(z, pts0) for k, z in pairs.items()}
    for i, si in enumerate(s):
        g_ = to_geo(pts0[i])
        wr.writerow([f"{si:.1f}", f"{pts0[i][0]:.3f}", f"{pts0[i][1]:.3f}", f"{g_['lat']:.8f}", f"{g_['lon']:.8f}", f"{h0[i]:.3f}",
                     *(f"{hp[k][i]:.3f}" for k in ("C", "W", "DL"))])
    (tmp / "F01" / "F01_profile.csv").write_bytes(buf.getvalue().encode())
    panel(tmp / "F01" / "F01_panel.png", ctx1, dem, hi1, dxg, dyg, kx, x0, y0, Ea, Na, lines, pts0, p0)
    profile_png(tmp / "F01" / "F01_profile.png", s, h0, hp, p0)
    (tmp / "F01" / "F01_qa.json").write_bytes(json.dumps(qa, indent=1).encode())
    write_layer(tmp, qa)
    files = sorted(str(p.relative_to(tmp)).replace("\\", "/") for p in tmp.rglob("*") if p.is_file())
    manifest = [{"file": f, "sha256": hashlib.sha256((tmp / f).read_bytes()).hexdigest()} for f in files]
    mb = json.dumps(manifest, indent=1).encode()
    (tmp / "manifest.json").write_bytes(mb)
    ver = hashlib.sha256(mb).hexdigest()[:12]
    out = OUT / ver
    shutil.rmtree(out, ignore_errors=True)
    tmp.rename(out)
    built = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")  # outside the hashed files: rebuilds stay byte-identical
    (OUT / "index.json").write_bytes(json.dumps({"terrain_features": {"version": ver, "path": f"analysis/features/{ver}/", "built_utc": built}}, indent=1).encode())
    print(ver, json.dumps({"nominal": qa["measurements"]["nominal"], "uncertainty": {k: qa["uncertainty"][k] for k in ("picking_threshold_range", "independent_stereo_dem_range")},
                           "registration": qa["registration"], "mosaic_pair": mosaic_pair}, indent=1))


def panel(path, ctx1, dem, hi1, dxg, dyg, kx, x0, y0, Ea, Na, lines, pts0, p0):
    """Four co-registered panels on the same 1 m grid, shown at ground aspect: CTX | hillshade 315/45 | hillshade 90/45 | HiRISE."""
    def u8(a):
        lo, hi = np.nanpercentile(a, [1, 99])
        return np.nan_to_num(np.clip((a - lo) / max(hi - lo, 1e-9) * 255, 0, 255)).astype(np.uint8)
    hs = lambda az: np.kron(hillshade(dem, dxg, dyg, az, 45) * 255, np.ones((2, 2))).astype(np.uint8)  # noqa: E731
    imgs = [("CTX-2020 soc_008 6 m (resampled for display)", u8(ctx1)), ("DEM-2020 hillshade az 315 / alt 45", hs(315)),
            ("DEM-2020 hillshade az 90 / alt 45", hs(90)), ("HIRISE-2020 soc_006 first, 1 m", u8(hi1))]
    H, W = imgs[1][1].shape
    Wg = int(round(W * kx))
    px = lambda q: ((Ea + q[0] / kx - x0) * kx * Wg / (W * kx), (y0 - (Na + q[1])))  # noqa: E731  ground-aspect pixel
    tiles = []
    for title, a in imgs:
        im = Image.fromarray(a[:H, :W]).resize((Wg, H), Image.Resampling.BILINEAR).convert("RGB")
        d = ImageDraw.Draw(im)
        for key, col in (("crest", (255, 220, 0)), ("foot", (0, 230, 255))):
            if len(lines[key]) > 1:
                d.line([px(q) for q in lines[key]], fill=col, width=3)
        ic, jf = int(round(p0["crest_s"] + 200)), int(round(p0["foot_s"] + 200))
        d.line([px(pts0[ic]), px(pts0[jf])], fill=(255, 60, 60), width=3)
        cx, cy = px((0.0, 0.0))
        d.line([(cx - 9, cy), (cx + 9, cy)], fill=(255, 255, 255), width=2)
        d.line([(cx, cy - 9), (cx, cy + 9)], fill=(255, 255, 255), width=2)
        d.rectangle((0, 0, Wg, 18), fill=(0, 0, 0))
        d.text((6, 3), title, fill=(255, 255, 255))
        d.line([(20, H - 20), (120, H - 20)], fill=(255, 255, 255), width=4)  # 100 ground metres (1 px = 1 m at ground aspect)
        d.text((20, H - 38), "100 m", fill=(255, 255, 255))
        d.polygon([(Wg - 24, 40), (Wg - 32, 60), (Wg - 16, 60)], fill=(255, 255, 255))
        d.text((Wg - 28, 22), "N", fill=(255, 255, 255))
        tiles.append(im)
    out = Image.new("RGB", (2 * Wg + 6, 2 * H + 40), (10, 10, 10))
    for i, t in enumerate(tiles):
        out.paste(t, ((i % 2) * (Wg + 6), 40 + (i // 2) * (H + 6)))
    d = ImageDraw.Draw(out)
    d.text((8, 6), "F01 western delta fan front / Hawksbill Gap - same window, eqc lat_ts 0, north up, ground aspect. White +: sol 501 rover anchor (NOT the feature centre).", fill=(255, 255, 255))
    d.text((8, 22), "Yellow: algorithmic crest, cyan: algorithmic foot (break-in-slope candidates, pending geology review). Red: measurement transect. Not a hazard map.", fill=(255, 255, 255))
    out.save(path)


def profile_png(path, s, h0, hp, p0):
    W, H, L, B = 900, 380, 70, 40
    ok = np.isfinite(h0)
    lo, hi = float(np.nanmin(h0)) - 2, float(np.nanmax(h0)) + 2
    X = lambda v: L + (v - s[0]) / (s[-1] - s[0]) * (W - L - 20)  # noqa: E731
    Y = lambda v: H - B - (v - lo) / (hi - lo) * (H - B - 30)  # noqa: E731
    im = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(im)
    d.line([(L, H - B), (W - 20, H - B)], fill=(0, 0, 0)); d.line([(L, 30), (L, H - B)], fill=(0, 0, 0))
    for name, z, col in (("pair C", hp["C"], (180, 180, 180)), ("pair W", hp["W"], (140, 190, 140)), ("pair DL", hp["DL"], (190, 140, 140)), ("mosaic", h0, (0, 0, 0))):
        pts = [(X(si), Y(zi)) for si, zi in zip(s, z) if np.isfinite(zi)]
        d.line(pts, fill=col, width=2 if name == "mosaic" else 1)
    for key, col in (("crest_s", (200, 160, 0)), ("foot_s", (0, 150, 200))):
        d.line([(X(p0[key]), 30), (X(p0[key]), H - B)], fill=col)
    for t in range(int(s[0]), int(s[-1]) + 1, 50):
        d.text((X(t) - 10, H - B + 6), str(t), fill=(0, 0, 0))
    for t in np.linspace(lo, hi, 5):
        d.text((4, Y(t) - 6), f"{t:.0f}", fill=(0, 0, 0))
    d.text((L, 8), "F01 transect: elevation (m, DEM-2020; datum UNVERIFIED) vs distance downslope from the rover anchor (m). Lines: crest / foot picks.", fill=(0, 0, 0))
    im.save(path)


def write_layer(tmp, qa):
    lit = "team document ARES1_ARAZI_BILIMSEL_DOGRULAMA.md v0.9 (cited; not retrieved by this pipeline)"
    common = {"data_products": list(SRC), "validated_for_human_eva": False, "used_in_routing": False, "hazard_type": None}
    feats = [
        {"feature_id": "F01", "name": "Western delta fan front / Hawksbill Gap", "related_missions": ["A", "M0"],
         "anchor": {**{k: ANCHORS["F01"][k] for k in ("lat", "lon", "sol", "rmc")}, "source_type": "rover_waypoint", "source": "NASA MMGIS M20_waypoints.json",
                    "is_feature_centre": False},
         "observation": "fan-front scarp between delta deposits and the crater floor (published naming: Kathir et al., NTRS 20250004753, Fig. 1)",
         "published_reference": {"source_url": "https://ntrs.nasa.gov/api/citations/20250004753/downloads/AGU_FINAL_FloatsPaper_Kathir%20et%20al_May2024.pdf", "via": lit},
         "geometry": "F01/F01_geometry.json", "geometry_status": "ALGORITHMIC_CANDIDATE_PENDING_REVIEW", "transect": "F01/F01_profile.csv",
         "measurements": qa["measurements"]["nominal"], "uncertainty": "F01/F01_qa.json#uncertainty", "evidence_image": "F01/F01_panel.png",
         "three_raster_validation": qa["status"]["three_raster_validation"], "evidence_level": "HIGH_FOR_EXISTENCE_MEDIUM_FOR_LOCAL_GEOMETRY",
         "qa_status": "LITERATURE_CONFIRMED", **common},
        {"feature_id": "F02", "name": "Belva crater", "related_missions": [],
         "anchor": {**{k: ANCHORS["F02"][k] for k in ("lat", "lon", "sol", "rmc")}, "source_type": "rover_waypoint", "source": "NASA MMGIS M20_waypoints.json",
                    "is_feature_centre": False},
         "observation": "impact crater; NASA reports an approximate 0.9 km diameter",
         "published_reference": {"approx_diameter_m": 900, "uncertainty_m": None, "source_url": "https://science.nasa.gov/resource/perseverance-takes-in-view-at-belva-crater/", "via": lit},
         "geometry": None, "geometry_status": "NOT_TRACED", "transect": None,
         "measurements": {"crater_diameter_m": None, "crater_depth_m": None, "slope_p95_deg": None}, "uncertainty": None, "evidence_image": None,
         "three_raster_validation": "PENDING", "evidence_level": "HIGH_FOR_EXISTENCE_LOW_FOR_LOCAL_GEOMETRY", "qa_status": "LITERATURE_CONFIRMED", **common},
        {"feature_id": "F03", "name": "Neretva Vallis northern channel margin / Bright Angel", "related_missions": ["B"],
         "anchor": {**{k: ANCHORS["F03"][k] for k in ("lat", "lon", "sol", "rmc")}, "source_type": "rover_waypoint", "source": "NASA MMGIS M20_waypoints.json",
                    "is_feature_centre": False},
         "observation": "valley shaped by an ancient river; Bright Angel outcrops at the northern channel margin; a local inner channel ~50-80 m wide, 2-3 m deep (applies to that inner channel only)",
         "published_reference": {"source_urls": ["https://www.nature.com/articles/s41586-025-09413-0", "https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2025JE009420",
                                                 "https://www.nasa.gov/missions/mars-2020-perseverance/perseverance-rover/nasas-perseverance-fords-an-ancient-river-to-reach-science-target/"], "via": lit},
         "geometry": None, "geometry_status": "NOT_TRACED", "transect": None,
         "measurements": {"channel_width_m": None, "bank_to_floor_relief_m": None, "slope_p95_deg": None}, "uncertainty": None, "evidence_image": None,
         "three_raster_validation": "PENDING", "evidence_level": "HIGH_FOR_EXISTENCE_LOW_FOR_LOCAL_GEOMETRY", "qa_status": "LITERATURE_CONFIRMED",
         "notes": ["B lies in the HiRISE CR_SOUTH stereo pair area (USGS: uncompensated y-parallax) - check before any DEM measurement."], **common},
    ]
    layer = {"schema": "ares-terrain-feature/1", "frozen_inputs_untouched": ["ares1 catalog 572fba1ce61f", "M0-A bundle f8de9017164a", "ROI-A bundles"],
             "status_ladder": ["LITERATURE_CONFIRMED", "RASTERS_DOWNLOADED", "THREE_LAYER_VISUALLY_CONFIRMED", "MEASURED_WITH_UNCERTAINTY", "QA_APPROVED", "UI_VERIFIED"],
             "features": feats}
    (tmp / "terrain_features.json").write_bytes(json.dumps(layer, indent=1).encode())
    (tmp / "scientific_sources.json").write_bytes(json.dumps({k: {**v, "doi_note": DOI_NOTE, "header": qa["sources"][k]["header"]} for k, v in SRC.items()}, indent=1).encode())


if __name__ == "__main__":
    main()
