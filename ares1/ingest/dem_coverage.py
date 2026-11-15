"""ARES-1: DEM coverage feasibility for a potential M0-to-A local routing area (and a B spot check).

Reads actual source pixels (HTTP range reads) from the official DEMs and reports, per area:
valid-pixel fraction, elevation range, slope statistics and whether every catalog point falls on valid
pixels. It also checks which per-stereo-pair HiRISE DTM covers each point (the CR pair has documented
quality issues). No routing is done and no terrain bundle is built.
Usage: uv run python ares1/ingest/dem_coverage.py   -> ares1/docs/dem_coverage.json
"""
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.warp import transform as wtransform
from rasterio.windows import Window, from_bounds

A1 = Path(__file__).resolve().parents[1]
CTX = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/"
HI = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/"
DEMS = {
    "jpl_ctx_dem_20m": CTX + "ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif",
    "usgs_trn_ctx_dtm_20m": CTX + "JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif",
    "usgs_hirise_dtm_1m": HI + "JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif",
}
PAIRS = ["C", "E", "N", "W", "DL", "CR_NORTH", "CR_SOUTH"]
GEO = "+proj=longlat +R=3396190 +no_defs"
ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MULTIRANGE="YES", CPL_VSIL_CURL_CHUNK_SIZE=4194304)
MARGIN_DEG = 0.0030  # ~178 m in latitude around the points


def catalog_points():
    idx = json.loads((A1 / "bundle" / "index.json").read_bytes())["catalog"]
    cat = json.loads((A1.parent / idx["path"] / "catalog.json").read_bytes())
    pts = {}
    for w in cat["reference_waypoints"]:
        pts[w["id"]] = (w["position"]["lat_deg"], w["position"]["lon_deg_east"], w["mission"])
    for d in cat["depot_drop_events"]:
        pts[d["id"]] = (d["rover_position"]["lat_deg"], d["rover_position"]["lon_deg_east"], "M0")
    for s in cat["samples"]:
        rp = s["sampling_event"]["rover_position"]
        if rp and s["sample_designation"] in ("M2020-00490-11", "M2020-00495-12", "M2020-00509-14", "M2020-00516-15", "M2020-01215-28"):
            pts[s["id"]] = (rp["lat_deg"], rp["lon_deg_east"], "B" if s["sample_designation"].endswith("-28") else "A")
    return idx["version"], pts


def area_box(pts, missions):
    lats = [p[0] for p in pts.values() if p[2] in missions]
    lons = [p[1] for p in pts.values() if p[2] in missions]
    return (min(lons) - MARGIN_DEG, min(lats) - MARGIN_DEG, max(lons) + MARGIN_DEG, max(lats) + MARGIN_DEG)


def read_box(src, box):
    xs, ys = wtransform(GEO, src.crs, [box[0], box[2], box[0], box[2]], [box[1], box[1], box[3], box[3]])
    w = from_bounds(min(xs), min(ys), max(xs), max(ys), src.transform)
    c0, r0 = math.floor(w.col_off), math.floor(w.row_off)
    win = Window(c0, r0, math.ceil(w.col_off + w.width) - c0, math.ceil(w.row_off + w.height) - r0)
    inside = 0 <= win.col_off and 0 <= win.row_off and win.col_off + win.width <= src.width and win.row_off + win.height <= src.height
    a = src.read(1, window=win, boundless=True, fill_value=np.nan).astype(np.float64)
    nod = src.nodata
    a[(a < -1e30) | (a == nod) if nod is not None else (a < -1e30)] = np.nan
    return a, src.window_transform(win), inside


def slope_deg(z, t, lat_c, crs):
    dx_proj, dy = abs(t.a), abs(t.e)
    lat_ts = (crs.to_dict().get("lat_ts") or 0.0)
    dx = dx_proj * math.cos(math.radians(lat_c)) / math.cos(math.radians(lat_ts))  # ground metres east-west
    gy, gx = np.gradient(z, dy, dx)
    return np.degrees(np.arctan(np.hypot(gx, gy)))


def main():
    version, pts = catalog_points()
    areas = {"m0_to_a": area_box(pts, {"M0", "A"}), "b_spot": area_box(pts, {"B"})}
    report = {"catalog_version": version, "areas": {k: {"lon_min": b[0], "lat_min": b[1], "lon_max": b[2], "lat_max": b[3]} for k, b in areas.items()},
              "existing_bundles": {"ctx_roi_a_lon": [77.4357, 77.4620], "ctx_roi_b_lon": [77.4200, 77.4900],
                                   "verdict": "M0 (lon 77.4078-77.4086), A (77.4059-77.4062) and B (77.3051) lie west of both ROI-A and ROI-B: the current terrain bundles cannot be used."},
              "dems": {}, "hirise_pairs": {}}
    with rasterio.Env(**ENV):
        for name, url in DEMS.items():
            with rasterio.open("/vsicurl/" + url) as src:
                for area, box in areas.items():
                    z, t, inside = read_box(src, box)
                    lat_c = (box[1] + box[3]) / 2
                    s = slope_deg(z, t, lat_c, src.crs)
                    valid = np.isfinite(z)
                    on_valid = {}
                    for pid, (lat, lon, m) in pts.items():
                        if (m in ("M0", "A")) != (area == "m0_to_a"):
                            continue
                        x, y = wtransform(GEO, src.crs, [lon], [lat])
                        c, r = ~t * (x[0], y[0])
                        c, r = int(c), int(r)
                        on_valid[pid] = bool(0 <= r < z.shape[0] and 0 <= c < z.shape[1] and np.isfinite(z[r, c]))
                    report["dems"].setdefault(name, {})[area] = {
                        "url": url, "crs": src.crs.to_proj4(), "pixel_m_proj": [abs(t.a), abs(t.e)], "window_shape": list(z.shape), "window_inside_raster": inside,
                        "valid_fraction": round(float(valid.mean()), 6), "elev_min_m": round(float(np.nanmin(z)), 2) if valid.any() else None,
                        "elev_max_m": round(float(np.nanmax(z)), 2) if valid.any() else None,
                        "slope_deg_p50": round(float(np.nanpercentile(s, 50)), 2) if valid.any() else None,
                        "slope_deg_p95": round(float(np.nanpercentile(s, 95)), 2) if valid.any() else None,
                        "slope_deg_max": round(float(np.nanmax(s)), 2) if valid.any() else None,
                        "points_on_valid_pixels": on_valid, "all_points_valid": all(on_valid.values()),
                    }
        for pair in PAIRS:
            url = HI + f"DTM_MOLAtopography_DeltaGeoid_Jezero_{pair}_Edited_affine_1m_Eqc_latTs0_lon0.tif"
            with rasterio.open("/vsicurl/" + url) as src:
                hits = {}
                for pid, (lat, lon, m) in pts.items():
                    if not pid.startswith(("waypoint:", "sample:")):
                        continue
                    x, y = wtransform(GEO, src.crs, [lon], [lat])
                    r, c = src.index(x[0], y[0])
                    if 0 <= r < src.height and 0 <= c < src.width:
                        v = src.read(1, window=Window(c, r, 1, 1))[0, 0]
                        hits[pid] = bool(v > -1e30 and (src.nodata is None or v != src.nodata))
                    else:
                        hits[pid] = False
                report["hirise_pairs"][pair] = {"url": url, "covers_with_valid_data": sorted(k for k, v in hits.items() if v)}
    report["notes"] = [
        "Valid fraction and slopes are computed on each DEM's native grid; ground spacing corrects lat_ts=0 grids by cos(lat).",
        "Point checks use rover positions/waypoints, not exact rock or tube points.",
        "USGS metadata: the CR (crater rim, far-western) HiRISE stereo pair has uncompensated y-parallax; use with caution.",
        "This is a coverage feasibility check only. No route was computed; the CTX ROI-A/ROI-B bundles were not used.",
    ]
    (A1 / "docs" / "dem_coverage.json").write_bytes(json.dumps(report, indent=1).encode("utf-8"))
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
