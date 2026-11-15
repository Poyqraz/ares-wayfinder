"""M0-A gates G1 (geometry) and G2 (pixels), docs/decisions/M0A-terrain-gate.md.

Reads only headers and one windowed block per official raster (HTTP range reads). Endpoints and the area box
come from committed ARES-1 files (catalog 572fba1ce61f, ares1/docs/dem_coverage.json); nothing is hard-coded.
No routing, no bundle, nothing written under web/.
Usage (from pipeline/): uv run python m0a_validate.py  -> analysis/m0a/validation/g1_g2.json
"""
import datetime
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.warp import transform as wtransform
from rasterio.windows import Window

import m0a_area as area
from roi import NODATA_SOURCE, ground_dx, horn_slope_deg, validity, window_from_proj_bounds

REPO = Path(__file__).resolve().parent.parent
CTX = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/"
HI = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/"
DEMS = {
    "ctx_dem_20m": CTX + "ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif",
    "trn_ctx_dtm_20m": CTX + "JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif",
    "hirise_dtm_1m": HI + "JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif",
}
ORTHO = ("hirise_ortho_25cm", HI + "JEZ_hirise_soc_007_orthoMosaic_25cm_Ortho_blend120.tif")
ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MULTIRANGE="YES")
CORRIDOR_HALF_WIDTH_M = 20.0  # one CTX cell either side of the straight line
MIN_VALID = 0.98


def endpoints():
    idx = json.loads((REPO / "ares1" / "bundle" / "index.json").read_bytes())["catalog"]
    cat = json.loads((REPO / idx["path"] / "catalog.json").read_bytes())
    m0 = next(w for w in cat["reference_waypoints"] if w["id"] == "waypoint:M0")["position"]
    sk = next(o for o in cat["outcrops"] if o["id"] == "outcrop:skinner_ridge")["spatial"]["positions"][0]
    ends = {
        "start_M0": {"lat": m0["lat_deg"], "lon": m0["lon_deg_east"], "semantics": m0["semantics"]},
        "goal_A": {"lat": sk["lat_deg"], "lon": sk["lon_deg_east"], "semantics": sk["semantics"]},
    }
    if area.WIDE:  # mission B: the rover position during the Mageik sampling activity at Amalik
        b = area.amalik(cat)
        ends["goal_B"] = {"lat": b["lat_deg"], "lon": b["lon_deg_east"], "semantics": b["semantics"]}
    return idx["version"], ends


def corridor_mask(shape, a_rc, b_rc, half_width_cells_x, half_width_cells_y):
    """Cells whose centre lies within the given half width (in cells per axis) of segment a-b (row, col)."""
    rows, cols = np.mgrid[0:shape[0], 0:shape[1]]
    # work in metric-like units: scale axes so the half width is 1 in both
    y, x = (rows + 0.5) / half_width_cells_y, (cols + 0.5) / half_width_cells_x
    ay, ax = (a_rc[0] + 0.5) / half_width_cells_y, (a_rc[1] + 0.5) / half_width_cells_x
    by, bx = (b_rc[0] + 0.5) / half_width_cells_y, (b_rc[1] + 0.5) / half_width_cells_x
    vy, vx = by - ay, bx - ax
    t = np.clip(((y - ay) * vy + (x - ax) * vx) / max(vy * vy + vx * vx, 1e-12), 0, 1)
    return np.hypot(y - (ay + t * vy), x - (ax + t * vx)) <= 1.0


def verdict(window_inside, valid_fraction, endpoints_valid, corridor_valid, roundtrip_m):
    problems = []
    if not window_inside:
        problems.append("window not inside raster")
    if roundtrip_m >= 1e-6:
        problems.append(f"endpoint roundtrip {roundtrip_m:.2e} m")
    if valid_fraction < MIN_VALID:
        problems.append(f"valid fraction {valid_fraction:.4f} < {MIN_VALID}")
    if not endpoints_valid:
        problems.append("an endpoint is not on a valid cell")
    if not corridor_valid:
        problems.append("straight corridor contains NoData")
    return ("PASS" if not problems else "FAIL"), problems


def header(src):
    p = src.crs.to_dict()
    return {
        "size": [src.width, src.height], "dtype": src.dtypes[0], "nodata": src.nodata,
        "crs_proj4": src.crs.to_proj4(), "proj": p.get("proj"), "R_m": p.get("R") or p.get("a"), "lat_ts": p.get("lat_ts"),
        "lat_0": p.get("lat_0"), "lon_0": p.get("lon_0"), "transform": list(src.transform)[:6],
        "area_or_point": src.tags().get("AREA_OR_POINT"), "overviews": src.overviews(1),
    }


def probe_dem(src, box, ends):
    h = header(src)
    R = h["R_m"]
    geo = CRS.from_proj4(f"+proj=longlat +R={R} +no_defs")
    xs, ys = wtransform(geo, src.crs, [box["lon_min"], box["lon_max"]], [box["lat_min"], box["lat_max"]])
    col0, col1, row0, row1, x0, y0 = window_from_proj_bounds(src.transform, min(xs), max(xs), min(ys), max(ys))
    nx, ny = col1 - col0, row1 - row0
    inside = col0 >= 1 and row0 >= 1 and col1 + 1 <= src.width and row1 + 1 <= src.height  # halo must fit too
    z = src.read(1, window=Window(col0 - 1, row0 - 1, nx + 2, ny + 2), boundless=True, fill_value=np.nan).astype(np.float64)
    bad = ~np.isfinite(z) | (z < -1e30)
    if src.nodata is not None:
        bad |= z == np.float64(np.float32(src.nodata))
    z[bad] = np.nan
    dx, dy = src.transform.a, -src.transform.e
    lat_c = (box["lat_min"] + box["lat_max"]) / 2
    assert h["proj"] == "eqc", h["crs_proj4"]  # ground_dx is only valid for equirectangular grids
    dx_g = ground_dx(dx, lat_c, h["lat_ts"] or 0.0)
    slope = horn_slope_deg(z, dx_g, dy)
    dem = z[1:-1, 1:-1]
    v = validity(dem, slope)
    pts, cells = {}, {}
    for name, e in ends.items():
        (x,), (y,) = wtransform(geo, src.crs, [e["lon"]], [e["lat"]])
        (lon2,), (lat2,) = wtransform(src.crs, geo, [x], [y])
        rt = math.hypot((lon2 - e["lon"]) * math.pi / 180 * R * math.cos(math.radians(e["lat"])), (lat2 - e["lat"]) * math.pi / 180 * R)
        c, r = math.floor((x - x0) / dx), math.floor((y0 - y) / dy)
        ok = 0 <= r < ny and 0 <= c < nx
        cells[name] = (r, c)
        pts[name] = {"row": r, "col": c, "inside": ok, "validity": int(v[r, c]) if ok else None,
                     "h_m": round(float(dem[r, c]), 3) if ok and np.isfinite(dem[r, c]) else None, "roundtrip_m": rt}
    corr = np.zeros(dem.shape, dtype=bool)  # the straight corridor of every route pair of this area
    for a, b, *_ in area.ROUTES:
        corr |= corridor_mask(dem.shape, cells[a], cells[b], CORRIDOR_HALF_WIDTH_M / dx_g, CORRIDOR_HALF_WIDTH_M / dy)
    finite_slope = slope[np.isfinite(slope)]
    valid_fraction = float((v != NODATA_SOURCE).mean())
    endpoints_valid = all(p["inside"] and p["validity"] != NODATA_SOURCE for p in pts.values())
    corridor_valid = bool((v[corr] != NODATA_SOURCE).all())
    roundtrip = max(p["roundtrip_m"] for p in pts.values())
    status, problems = verdict(inside, valid_fraction, endpoints_valid, corridor_valid, roundtrip)
    return {
        "header": h,
        "window": {"col0": col0, "col1": col1, "row0": row0, "row1": row1, "nx": nx, "ny": ny, "x0": x0, "y0": y0, "inside_with_halo": inside},
        "spacing_m": {"dx_proj": dx, "dy_proj": dy, "dx_ground": dx_g, "dy_ground": dy, "lat_center": lat_c,
                      "dx_ground_over_proj": dx_g / dx},
        "valid_fraction": round(valid_fraction, 6),
        "validity_counts": {str(k): int((v == k).sum()) for k in range(4)},
        "elev_m": {"min": round(float(np.nanmin(dem)), 3), "max": round(float(np.nanmax(dem)), 3)} if np.isfinite(dem).any() else None,
        "slope_deg_horn": {"p50": round(float(np.percentile(finite_slope, 50)), 2), "p95": round(float(np.percentile(finite_slope, 95)), 2),
                           "max": round(float(finite_slope.max()), 2),
                           "share_above_24_2": round(float((finite_slope > 24.2).mean()), 5)} if finite_slope.size else None,
        "endpoints": pts,
        "corridor": {"half_width_m": CORRIDOR_HALF_WIDTH_M, "cells": int(corr.sum()), "all_valid": corridor_valid,
                     "slope_deg_max": round(float(np.nanmax(slope[corr])), 2) if np.isfinite(slope[corr]).any() else None},
        "gate": status, "problems": problems,
    }


def probe_ortho(src, box):
    h = header(src)
    geo = CRS.from_proj4(f"+proj=longlat +R={h['R_m']} +no_defs")
    xs, ys = wtransform(geo, src.crs, [box["lon_min"], box["lon_max"]], [box["lat_min"], box["lat_max"]])
    col0, col1, row0, row1, _, _ = window_from_proj_bounds(src.transform, min(xs), max(xs), min(ys), max(ys))
    inside = col0 >= 0 and row0 >= 0 and col1 <= src.width and row1 <= src.height
    step = 8  # 25 cm -> 2 m preview grid; enough to find NoData areas without a 20 MB read
    a = src.read(1, window=Window(col0, row0, col1 - col0, row1 - row0), out_shape=((row1 - row0) // step, (col1 - col0) // step))
    empty = (a == src.nodata) if src.nodata is not None else (a == 0)
    return {"header": h, "window_inside": inside, "preview_step": step,
            "empty_fraction": round(float(empty.mean()), 6), "empty_rule": "nodata tag" if src.nodata is not None else "value 0 (no nodata tag)"}


def main():
    version, ends = endpoints()
    box = area.box()
    out = {"generated_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
           "catalog_version": version, "box": box, "endpoints": ends, "dems": {}, "ortho": {}}
    with rasterio.Env(**ENV):
        for name, url in DEMS.items():
            with rasterio.open("/vsicurl/" + url) as src:
                out["dems"][name] = {"url": url, **probe_dem(src, box, ends)}
        with rasterio.open("/vsicurl/" + ORTHO[1]) as src:
            out["ortho"][ORTHO[0]] = {"url": ORTHO[1], **probe_ortho(src, box)}
    out["g1_g2"] = "PASS" if all(d["gate"] == "PASS" for d in out["dems"].values()) and all(o["window_inside"] for o in out["ortho"].values()) else "FAIL"
    dest = area.ANALYSIS / "validation"
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "g1_g2.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(json.dumps({k: {"gate": d["gate"], "problems": d["problems"]} for k, d in out["dems"].items()}, indent=1), out["g1_g2"])


if __name__ == "__main__":
    main()
