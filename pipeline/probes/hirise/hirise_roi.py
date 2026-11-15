"""Read-only feasibility probe: ROI-A windows from the USGS Mars 2020 TRN HiRISE DTM + ortho. Writes only to the scratch dir."""
import json, math, time, sys
import numpy as np, rasterio
from rasterio.windows import Window, from_bounds
def snap(w):
    c0=math.floor(w.col_off); r0=math.floor(w.row_off)
    return Window(c0, r0, math.ceil(w.col_off+w.width)-c0, math.ceil(w.row_off+w.height)-r0)
from rasterio.warp import transform as wtransform
OUT = sys.argv[1]
B = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/"
DTM = B + "JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif"
ORT = B + "JEZ_hirise_soc_007_orthoMosaic_25cm_Ortho_blend120.tif"
BUN = r"C:/Users/cancor/Desktop/Repos/ares-wayfinder-wt-claude/web/public/data/roi_a/fc22a0c8a91f/"
GEO = "+proj=longlat +R=3396190 +no_defs"
meta = json.load(open(BUN + "terrain.json")); pois = json.load(open(BUN + "pois.json"))
nx, ny, x0, y0, d = meta["nx"], meta["ny"], meta["x0"], meta["y0"], meta["dx_proj"]
ctx = np.fromfile(BUN + "dem.f32.bin", dtype="<f4").reshape(ny, nx)
R, k = 3396190.0, math.cos(math.radians(meta["lat_ts_deg"]))
# exact ROI-A extent = CTX grid extent, converted to lon/lat
lon0, lon1 = math.degrees(x0 / (R * k)), math.degrees((x0 + nx * d) / (R * k))
lat1, lat0 = math.degrees(y0 / R), math.degrees((y0 - ny * d) / R)
env = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MULTIRANGE="YES", CPL_VSIL_CURL_CHUNK_SIZE=4194304)
res = {"roi_geo": [lat0, lat1, lon0, lon1]}
with rasterio.Env(**env):
    with rasterio.open("/vsicurl/" + DTM) as s:
        xs, ys = wtransform(GEO, s.crs, [lon0, lon1], [lat0, lat1])
        win = snap(from_bounds(min(xs), min(ys), max(xs), max(ys), s.transform))
        win = Window(win.col_off - 2, win.row_off - 2, win.width + 4, win.height + 4)  # 2 px halo
        t0 = time.time(); z = s.read(1, window=win).astype(np.float64); dt = time.time() - t0
        wt = s.window_transform(win); nod = s.nodata
        res["dtm"] = {"window": [int(win.col_off), int(win.row_off), int(win.width), int(win.height)], "read_s": round(dt, 1),
                      "rows_bytes_fetched_MB": round(win.height * s.width * 4 / 1e6, 1)}
    valid = np.isfinite(z) & (z > -1e30)
    z[~valid] = np.nan
    inner = valid[2:-2, 2:-2]
    res["dtm"].update(valid_fraction=float(inner.mean()), n_invalid=int((~inner).sum()), h_min=float(np.nanmin(z)), h_max=float(np.nanmax(z)))
    np.save(f"{OUT}/dtm_roi.npy", z.astype(np.float32)); json.dump({"transform": list(wt)[:6], "crs": "eqc lat_ts=0 R=3396190"}, open(f"{OUT}/dtm_roi.json", "w"))
    # POI validity at 1 m (3x3 around the POI pixel)
    pv = {}
    for p in pois:
        X, Y = wtransform(GEO, "+proj=eqc +lat_ts=0 +lon_0=0 +R=3396190 +units=m", [p["geo"]["lon"]], [p["geo"]["lat"]])
        c, r = ~wt * (X[0], Y[0]); c, r = int(c), int(r)
        blk = z[r - 1:r + 2, c - 1:c + 2]
        pv[p["id"]] = {"valid_3x3": bool(np.isfinite(blk).all()), "h": float(z[r, c]) if np.isfinite(z[r, c]) else None}
    res["poi"] = pv
    # aggregate HiRISE 1 m pixels into each CTX 20 m cell (exact footprint by pixel-centre lon/lat)
    H, W = z.shape
    cc, rr = np.meshgrid(np.arange(W) + 0.5, np.arange(H) + 0.5)
    X = wt.c + cc * wt.a; Y = wt.f + rr * wt.e
    lon = np.degrees(X / R); lat = np.degrees(Y / R)
    col = np.floor((R * k * np.radians(lon) - x0) / d).astype(int); row = np.floor((y0 - R * np.radians(lat)) / d).astype(int)
    ok = valid & (col >= 0) & (col < nx) & (row >= 0) & (row < ny)
    idx = row[ok] * nx + col[ok]
    s_ = np.bincount(idx, z[ok], nx * ny); n_ = np.bincount(idx, None, nx * ny)
    s2 = np.bincount(idx, z[ok] ** 2, nx * ny)
    hm = np.where(n_ > 0, s_ / np.maximum(n_, 1), np.nan).reshape(ny, nx)
    hsd = np.sqrt(np.maximum(np.where(n_ > 0, s2 / np.maximum(n_, 1), np.nan).reshape(ny, nx) - hm ** 2, 0))
    diff = ctx - hm
    dd = diff[np.isfinite(diff)]
    res["vs_ctx"] = {"cells": int(dd.size), "px_per_cell_median": float(np.median(n_[n_ > 0])),
                     "ctx_minus_hirise_median": float(np.median(dd)), "mean": float(dd.mean()), "std": float(dd.std()),
                     "p01": float(np.percentile(dd, 1)), "p99": float(np.percentile(dd, 99)), "abs_max": float(np.abs(dd).max()),
                     "subcell_relief_sd_median": float(np.nanmedian(hsd)), "subcell_relief_sd_p99": float(np.nanpercentile(hsd, 99))}
    np.save(f"{OUT}/ctx_minus_hirise.npy", diff.astype(np.float32))
    # 1 m slope (Horn, ground metres; x ground spacing = 1 m * cos(lat) because lat_ts=0)
    latc = math.radians((lat0 + lat1) / 2); dxg, dyg = 1.0 * math.cos(latc), 1.0
    zp = z
    gx = ((zp[:-2, 2:] + 2 * zp[1:-1, 2:] + zp[2:, 2:]) - (zp[:-2, :-2] + 2 * zp[1:-1, :-2] + zp[2:, :-2])) / (8 * dxg)
    gy = ((zp[2:, :-2] + 2 * zp[2:, 1:-1] + zp[2:, 2:]) - (zp[:-2, :-2] + 2 * zp[:-2, 1:-1] + zp[:-2, 2:])) / (8 * dyg)
    sl = np.degrees(np.arctan(np.hypot(gx, gy)))
    res["slope_1m"] = {"p50": float(np.nanpercentile(sl, 50)), "p95": float(np.nanpercentile(sl, 95)), "p99": float(np.nanpercentile(sl, 99)), "max": float(np.nanmax(sl)),
                       "frac_gt_15": float(np.nanmean(sl > 15)), "frac_gt_25": float(np.nanmean(sl > 25)), "x_ground_m": dxg}
    np.save(f"{OUT}/slope_1m.npy", sl.astype(np.float32))
    # ortho soc_007 (tiled, orthographic): read the ROI window
    with rasterio.open("/vsicurl/" + ORT) as o:
        lons = [lon0, lon1, lon0, lon1, (lon0 + lon1) / 2]; lats = [lat0, lat0, lat1, lat1, lat0]
        ox, oy = wtransform(GEO, o.crs, lons, lats)
        ow = snap(from_bounds(min(ox), min(oy), max(ox), max(oy), o.transform))
        t0 = time.time(); img = o.read(1, window=ow); dt = time.time() - t0
        res["ortho"] = {"window": [int(ow.col_off), int(ow.row_off), int(ow.width), int(ow.height)], "read_s": round(dt, 1),
                        "uncompressed_MB": round(img.nbytes / 1e6, 1), "nodata_fraction": float((img == 0).mean())}
        json.dump({"transform": list(o.window_transform(ow))[:6], "crs": o.crs.to_proj4()}, open(f"{OUT}/ortho_roi.json", "w"))
        np.save(f"{OUT}/ortho_roi.npy", img)
print(json.dumps(res, indent=1))
