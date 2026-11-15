"""S-4 investigation: read actual source pixels over ROI-B (+300 m margin) from the three DEMs and both orthos' transforms.

Writes only pipeline/cache/s4_roib.npz (git-ignored). Usage: uv run python pipeline/probes/s4/fetch_roib.py
"""
import json, math, time
from pathlib import Path
import numpy as np
import rasterio
from rasterio.warp import transform_bounds
from rasterio.windows import Window, from_bounds

REPO = Path(__file__).resolve().parents[3]
CTX = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/"
HI = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/"
SRC = {
    "jpl_dem": CTX + "ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif",
    "trn_dtm": CTX + "JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif",
    "hirise_dtm": HI + "JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif",
    "ctx_ortho": CTX + "ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXortho_mosaic_5m.tif",
}
idx = json.loads((REPO / "web/public/data/index.json").read_bytes())["roi_b"]
t = json.loads((REPO / "web/public/data" / idx["path"].removeprefix("data/") / "terrain.json").read_bytes())
ctx_crs = f"+proj=eqc +lat_ts={t['lat_ts_deg']} +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +R={t['radius_m']} +units=m +no_defs"
M = 300.0
box = (t["x0"] - M, t["y0"] - t["ny"] * t["dy_proj"] - M, t["x0"] + t["nx"] * t["dx_proj"] + M, t["y0"] + M)
out = {"roi_b_meta": np.array(json.dumps(t)), "ctx_crs": np.array(ctx_crs)}
env = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MULTIRANGE="YES", CPL_VSIL_CURL_CHUNK_SIZE=4194304)
with rasterio.Env(**env):
    for k, url in SRC.items():
        t0 = time.time()
        with rasterio.open("/vsicurl/" + url) as s:
            b = transform_bounds(ctx_crs, s.crs, *box, densify_pts=64)
            w = from_bounds(*b, s.transform)
            c0, r0 = math.floor(w.col_off), math.floor(w.row_off)
            win = Window(c0, r0, math.ceil(w.col_off + w.width) - c0, math.ceil(w.row_off + w.height) - r0)
            a = s.read(1, window=win)
            out[k] = a
            out[k + "_transform"] = np.array(tuple(s.window_transform(win))[:6])
            out[k + "_crs"] = np.array(s.crs.to_proj4())
            out[k + "_nodata"] = np.array(np.nan if s.nodata is None else s.nodata)
            out[k + "_area_or_point"] = np.array(s.tags().get("AREA_OR_POINT", "?"))
            out[k + "_full_transform"] = np.array(tuple(s.transform)[:6])
            print(k, a.shape, a.dtype, f"{time.time() - t0:.0f}s", s.tags().get("AREA_OR_POINT"), tuple(s.transform)[:6], flush=True)
p = REPO / "pipeline/cache/s4_roib.npz"
np.savez(p, **out)
print("saved", p)
