"""S-4 support: which DEM is shifted? Compare the USGS CTX TRN/LVS DTM (the reference HiRISE was tied to)
with (a) the JPL CTX DEM in our bundle and (b) the HiRISE 2 m display DTM. Analysis only (read-only).

The TRN DTM (20 m, eqc lat_ts=0) is warped bilinearly onto a 2 m grid in the CTX projection purely to
measure offsets with the same shift search as s4_dem_offset.py; nothing is written to any bundle.
Usage: uv run python pipeline/probes/hirise/s4_trn_offset.py   (network: reads a small TRN window)
"""
import json
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from rasterio.warp import Resampling, reproject, transform_bounds
from rasterio.windows import from_bounds

D = Path(__file__).resolve().parents[3] / "web" / "public" / "data"
TRN = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif"
t = json.loads((D / "roi_a" / "fc22a0c8a91f" / "terrain.json").read_bytes())
m = json.loads((D / "hirise" / "roi_a" / "e88cfab318e6" / "manifest.json").read_bytes())
g = m["grids"]["dtm_2m"]
hi = np.frombuffer((D / "hirise" / "roi_a" / "e88cfab318e6" / g["file"]).read_bytes(), "<f4").reshape(g["ny"], g["nx"]).astype(np.float64)
ctx = np.fromfile(D / "roi_a" / "fc22a0c8a91f" / "dem.f32.bin", "<f4").reshape(t["ny"], t["nx"]).astype(np.float64)
crs = m["crs"]
x0, y0 = t["x0"], t["y0"]
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"), rasterio.open("/vsicurl/" + TRN) as s:
    b = transform_bounds(crs, s.crs, x0 - 200, y0 - 1800 - 200, x0 + 1480 + 200, y0 + 200, densify_pts=32)
    w = from_bounds(*b, s.transform).round_offsets().round_lengths()
    src = s.read(1, window=w, masked=True).filled(np.nan).astype(np.float64)
    st, scrs = s.window_transform(w), s.crs
trn2 = np.full(hi.shape, np.nan)
reproject(src, trn2, src_transform=st, src_crs=scrs, dst_transform=Affine(2, 0, x0, 0, -2, y0), dst_crs=crs,
          resampling=Resampling.bilinear, src_nodata=np.nan, dst_nodata=np.nan)


def detrend(z):
    yy, xx = np.mgrid[:z.shape[0], :z.shape[1]]
    A = np.c_[np.ones(z.size), xx.ravel(), yy.ravel()]
    return z - (A @ np.linalg.lstsq(A, z.ravel(), rcond=None)[0]).reshape(z.shape)


def highpass(z, k=5):
    from scipy.ndimage import uniform_filter
    return z - uniform_filter(z, k, mode="nearest")


def search(moving2m, ref20, prep=None):
    """Shift the 2 m 'moving' grid, average to 20 m, correlate (detrended) with the 20 m reference."""
    B, S = 3, 20
    prep = prep or detrend
    c = prep(ref20[B:-B, B:-B])
    gr = np.zeros((2 * S + 1, 2 * S + 1))
    for sy in range(-S, S + 1):
        for sx in range(-S, S + 1):
            win = moving2m[B * 10 + sy:B * 10 + sy + c.shape[0] * 10, B * 10 + sx:B * 10 + sx + c.shape[1] * 10]
            a = prep(win.reshape(c.shape[0], 10, c.shape[1], 10).mean(axis=(1, 3)))
            gr[sy + S, sx + S] = (a * c).sum() / np.sqrt((a * a).sum() * (c * c).sum())
    iy, ix = np.unravel_index(np.argmax(gr), gr.shape)
    return {"peak_r": round(float(gr.max()), 4), "r_zero": round(float(gr[S, S]), 4),
            "moving_minus_ref_offset_m": {"east": int((ix - S) * 2), "north": int(-(iy - S) * 2)},
            "on_border": bool(ix in (0, 2 * S) or iy in (0, 2 * S))}


trn20 = trn2.reshape(t["ny"], 10, t["nx"], 10).mean(axis=(1, 3))
print(json.dumps({
    "trn_valid_fraction": float(np.isfinite(trn2).mean()),
    "HiRISE_vs_TRN": search(hi, trn20),         # expected ~0: HiRISE was tied to the LVS/TRN CTX DTM
    "JPL_CTX_vs_TRN": search(np.repeat(np.repeat(ctx, 10, 0), 10, 1), trn20),  # JPL DEM cells replicated to 2 m only to reuse the shift search
    "HiRISE_vs_JPL_CTX": search(hi, ctx),
    "highpass_5cell": {
        "HiRISE_vs_TRN": search(hi, trn20, highpass),
        "JPL_CTX_vs_TRN": search(np.repeat(np.repeat(ctx, 10, 0), 10, 1), trn20, highpass),
        "HiRISE_vs_JPL_CTX": search(hi, ctx, highpass),
    },
}, indent=1))
