"""Regional orbital basemap (offline asset) from the controlled USGS CTX Jezero orthomosaic, with checks.

Source: JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif (USGS Astrogeology Mars 2020 TRN products;
the same controlled mosaic served by NASA Mars Trek). No WMTS: everything is read from the GeoTIFF header and
pixels, so no TileMatrix, orientation or offset is assumed.
Outputs (analysis/regional/<version>/, not under web/ until an integration RC is approved):
  science_6m.jpg   native 6 m pixels over the science region (ROI-A, ROI-B, M0, A, B), north up
  jezero_48m.jpg   whole mosaic from the file's own 8x overview
  regional.json    grid, CRS, pixel convention, stretch, NoData coverage, feature pixel positions, registration check
Usage (from pipeline/): uv run python regional_basemap.py
"""
import hashlib
import json
import math
import shutil
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from PIL import Image
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.warp import reproject, transform_bounds
from rasterio.warp import transform as wtransform
from rasterio.windows import Window

import registration_check as reg
from m0a_validate import CTX, ENV, ORTHO
from roi import window_from_proj_bounds

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "analysis" / "regional"
URL = CTX + "JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif"
REGION = {"lat_min": 18.40, "lat_max": 18.52, "lon_min": 77.28, "lon_max": 77.51}  # science region with margin
ROIS = {"roi_a": {"lat": (18.422, 18.452), "lon": (77.436, 77.462)}, "roi_b": {"lat": (18.420, 18.470), "lon": (77.420, 77.490)}}
CHECK_BOXES = {"m0_a": None, "b_spot": None}  # filled from ares1/docs/dem_coverage.json


def stretch_params(a):
    v = a[a > 0]
    lo, hi = np.percentile(v, [1, 99])
    return float(lo), float(hi)


def to_u8(a, lo, hi):
    out = np.clip((a.astype(np.float64) - lo) / max(hi - lo, 1e-9) * 255, 0, 255)
    out[a == 0] = 0
    return out.astype(np.uint8)


def registration(src, box, geo):
    """NCC shift of the CTX 6 m ortho vs the HiRISE ortho averaged to the same 6 m grid (feature in CTX minus HiRISE)."""
    xs, ys = wtransform(geo, src.crs, [box["lon_min"], box["lon_max"]], [box["lat_min"], box["lat_max"]])
    c0, c1, r0, r1, x0, y0 = window_from_proj_bounds(src.transform, min(xs), max(xs), min(ys), max(ys))
    ctx = src.read(1, window=Window(c0, r0, c1 - c0, r1 - r0)).astype(np.float64)
    dst_t = Affine(src.transform.a, 0, x0, 0, src.transform.e, y0)
    hi = np.full(ctx.shape, np.nan)
    with rasterio.open("/vsicurl/" + ORTHO[1]) as o:
        w = o.window(*transform_bounds(src.crs, o.crs, x0 - 30, y0 + (r1 - r0) * src.transform.e - 30, x0 + (c1 - c0) * src.transform.a + 30, y0 + 30, densify_pts=64))
        w = w.round_offsets().round_lengths()
        a = o.read(1, window=w).astype(np.float32)
        a[a == 0] = np.nan
        reproject(a, hi, src_transform=o.window_transform(w), src_crs=o.crs, dst_transform=dst_t, dst_crs=src.crs,
                  resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan)
    if not (np.isfinite(hi).all() and (ctx > 0).all()):
        return {"status": "NOT_TESTED", "reason": "HiRISE or CTX has no data in part of this box",
                "hirise_valid_share": round(float(np.isfinite(hi).mean()), 4)}
    a_hp, b_hp = reg.highpass(ctx, 0.0), reg.highpass(hi, 0.0)
    M = reg.MAXS
    p = reg.peak(reg.surface(a_hp, b_hp, M, ctx.shape[0] - M, M, ctx.shape[1] - M))
    lat_c = (box["lat_min"] + box["lat_max"]) / 2
    gx = math.cos(math.radians(lat_c))  # ground metres per projected metre in x (lat_ts 0)
    return {"status": "MEASURED", "grid_px_m": src.transform.a, "size_px": list(ctx.shape),
            "shift_east_m": round(p["sx"] * src.transform.a * gx, 1), "shift_north_m": round(-p["sy"] * src.transform.a, 1),
            "ncc": round(p["ncc"], 3), "sharpness": round(p["sharp"], 3), "peak_on_search_edge": bool(p["edge"]),
            "search_radius_m": M * src.transform.a, "convention": "position of a feature in CTX minus its position in HiRISE"}


def main():
    cov = json.loads((REPO / "ares1" / "docs" / "dem_coverage.json").read_bytes())["areas"]
    CHECK_BOXES["m0_a"], CHECK_BOXES["b_spot"] = cov["m0_to_a"], cov["b_spot"]
    cat_idx = json.loads((REPO / "ares1" / "bundle" / "index.json").read_bytes())["catalog"]
    cat = json.loads((REPO / cat_idx["path"] / "catalog.json").read_bytes())
    m0a = json.loads((REPO / "analysis" / "m0a" / "bundle" / "index.json").read_bytes())["m0a"]
    m0a_meta = json.loads((REPO / m0a["path"] / "terrain.json").read_bytes())
    tmp = OUT / "_staging"
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    with rasterio.Env(**ENV), rasterio.open("/vsicurl/" + URL) as src:
        p = src.crs.to_dict()
        assert p.get("proj") == "eqc" and src.tags().get("AREA_OR_POINT") == "Area" and src.transform.b == 0 and src.transform.d == 0
        assert src.transform.a > 0 and src.transform.e < 0, "north-up grid expected (row 0 = north)"
        R = p["R"]
        geo = CRS.from_proj4(f"+proj=longlat +R={R} +no_defs")
        xs, ys = wtransform(geo, src.crs, [REGION["lon_min"], REGION["lon_max"]], [REGION["lat_min"], REGION["lat_max"]])
        c0, c1, r0, r1, x0, y0 = window_from_proj_bounds(src.transform, min(xs), max(xs), min(ys), max(ys))
        assert c0 >= 0 and r0 >= 0 and c1 <= src.width and r1 <= src.height, "science region must lie inside the mosaic"
        sci = src.read(1, window=Window(c0, r0, c1 - c0, r1 - r0))
        lo, hi = stretch_params(sci)
        Image.fromarray(to_u8(sci, lo, hi)).save(tmp / "science_6m.jpg", quality=88)
        f = 8
        ov = src.read(1, out_shape=(src.height // f, src.width // f), resampling=Resampling.average)
        Image.fromarray(to_u8(ov, *stretch_params(ov))).save(tmp / "jezero_48m.jpg", quality=88)
        dx, dy = src.transform.a, -src.transform.e

        def pix(lat, lon):
            (x,), (y,) = wtransform(geo, src.crs, [lon], [lat])
            return {"x_px": round((x - x0) / dx, 3), "y_px": round((y0 - y) / dy, 3)}  # pixel-edge coordinates, 0 = west/north edge

        features = {}
        for w in cat["reference_waypoints"]:
            features[w["id"]] = {"kind": "approximate rover waypoint (not a sample/tube point)", "lat": w["position"]["lat_deg"],
                                 "lon": w["position"]["lon_deg_east"], **pix(w["position"]["lat_deg"], w["position"]["lon_deg_east"])}
        for rid, b in ROIS.items():
            features[rid] = {"kind": "existing CTX 20 m engineering ROI (requested box)", "box": b,
                             "nw": pix(b["lat"][1], b["lon"][0]), "se": pix(b["lat"][0], b["lon"][1])}
        bg = m0a_meta["bounds_geo"]
        features["m0a_analysis"] = {"kind": f"M0-A HiRISE 2 m prototype analysis grid {m0a['dataset_version']}", "bounds_geo": bg,
                                    "nw": pix(bg["lat_max"], bg["lon_min"]), "se": pix(bg["lat_min"], bg["lon_max"])}
        checks = {k: registration(src, b, geo) for k, b in CHECK_BOXES.items()}
        meta = {
            "schema": "ares-regional-basemap/1", "role": "REAL OBSERVED imagery, display only (no terrain or hazard information)",
            "source": {"id": "ctx_ortho_6m_controlled", "url": URL, "product": "JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0",
                       "agency": "USGS Astrogeology / NASA (Mars 2020 TRN controlled CTX mosaic; also served by NASA Mars Trek)",
                       "mission": "MRO", "instrument": "CTX", "native_pixel_m": dx, "size_px": [src.width, src.height], "nodata": src.nodata},
            "crs_proj4": src.crs.to_proj4(), "pixel_convention": "PixelIsArea; x0/y0 = north-west corner of pixel (0,0); row 0 = north; columns increase east",
            "assets": {
                "science_6m.jpg": {"x0": x0, "y0": y0, "dx": dx, "dy": dy, "nx": c1 - c0, "ny": r1 - r0, "source_window": {"col0": c0, "row0": r0},
                                   "bounds_geo_requested": REGION, "nodata_share": round(float((sci == 0).mean()), 6),
                                   "stretch": {"method": "linear 1-99 % of valid pixels", "lo_dn": lo, "hi_dn": hi}},
                "jezero_48m.jpg": {"x0": src.transform.c, "y0": src.transform.f, "dx": dx * src.width / (src.width // f), "dy": dy * src.height / (src.height // f),
                                   "nx": src.width // f, "ny": src.height // f, "nodata_share": round(float((ov == 0).mean()), 6),
                                   "note": "average of 8x8 source pixels (rounded grid); context only"},
            },
            "features_px_in_science_6m": features,
            "registration_vs_hirise_ortho": checks,
            "limits": ["6 m imagery does not show rocks or hazards; it is a basemap only.",
                       "Catalog positions are in the HiRISE/PLACES frame; see registration_vs_hirise_ortho before trusting sub-50 m placement on CTX.",
                       "Contrast stretched for display; DN are not radiance."],
        }
    files = sorted(p.name for p in tmp.iterdir())
    manifest = [{"file": f, "sha256": hashlib.sha256((tmp / f).read_bytes()).hexdigest()} for f in files]
    mb = json.dumps(manifest, indent=1).encode()
    (tmp / "manifest.json").write_bytes(mb)
    ver = hashlib.sha256(mb).hexdigest()[:12]
    meta["version"] = ver
    (tmp / "regional.json").write_bytes(json.dumps(meta, indent=1).encode())
    out = OUT / ver
    shutil.rmtree(out, ignore_errors=True)
    tmp.rename(out)
    (OUT / "index.json").write_bytes(json.dumps({"regional": {"version": ver, "path": f"analysis/regional/{ver}/",
                                                              "regional_json_sha256": hashlib.sha256((out / "regional.json").read_bytes()).hexdigest()}}, indent=1).encode())
    print(ver, json.dumps({"science": meta["assets"]["science_6m.jpg"]["nx"], "ny": meta["assets"]["science_6m.jpg"]["ny"],
                           "nodata": meta["assets"]["science_6m.jpg"]["nodata_share"], "registration": checks}, indent=1))


if __name__ == "__main__":
    main()
