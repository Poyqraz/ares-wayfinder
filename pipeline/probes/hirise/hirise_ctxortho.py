import json, math, sys
import numpy as np, rasterio
from rasterio.windows import Window
from rasterio.warp import reproject, Resampling
from affine import Affine
from scipy.ndimage import uniform_filter
D = sys.argv[1]
CTXO = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXortho_mosaic_5m.tif"
BUN = r"C:/Users/cancor/Desktop/Repos/ares-wayfinder-wt-claude/web/public/data/roi_a/fc22a0c8a91f/"
meta = json.load(open(BUN + "terrain.json"))
img = np.load(f"{D}/ortho_roi.npy"); oj = json.load(open(f"{D}/ortho_roi.json")); ot = Affine(*oj["transform"])
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"), rasterio.open("/vsicurl/" + CTXO) as s:
    x0, y0 = meta["x0"], meta["y0"]; x1, y1 = x0 + meta["nx"] * 20, y0 - meta["ny"] * 20
    c0, r0 = ~s.transform * (x0, y0); c1, r1 = ~s.transform * (x1, y1)
    win = Window(math.floor(c0), math.floor(r0), math.ceil(c1) - math.floor(c0), math.ceil(r1) - math.floor(r0))
    ctx = s.read(1, window=win).astype(np.float64); ct = s.window_transform(win); ccrs = s.crs
hi = np.zeros(ctx.shape, np.float32)
reproject(img.astype(np.float32), hi, src_transform=ot, src_crs=oj["crs"], dst_transform=ct, dst_crs=ccrs, resampling=Resampling.average, src_nodata=0, dst_nodata=0)
hi = hi.astype(np.float64)
def hp(x): return x - uniform_filter(x, 15)
def ncc(a, b):
    a = a - a.mean(); b = b - b.mean(); return float((a * b).sum() / math.sqrt((a * a).sum() * (b * b).sum()))
A, Bm = hp(ctx), hp(hi); H, W = A.shape; S = 8; m = 12
g = np.zeros((2 * S + 1, 2 * S + 1))
for sy in range(-S, S + 1):
    for sx in range(-S, S + 1):
        g[sy + S, sx + S] = ncc(Bm[m + sy:H - m + sy, m + sx:W - m + sx], A[m:H - m, m:W - m])
iy, ix = np.unravel_index(np.argmax(g), g.shape)
def sub(v_m, v0, v_p): d = v_m - 2 * v0 + v_p; return 0.0 if d == 0 else 0.5 * (v_m - v_p) / d
fx = ix - S + (sub(g[iy, ix - 1], g[iy, ix], g[iy, ix + 1]) if 0 < ix < 2 * S else 0)
fy = iy - S + (sub(g[iy - 1, ix], g[iy, ix], g[iy + 1, ix]) if 0 < iy < 2 * S else 0)
print("CTX ortho window", ctx.shape, "px size", ct.a, "| HiRISE ortho averaged onto the CTX 5 m grid")
print("peak NCC", round(float(g[iy, ix]), 3), "at shift (px) x=%.2f y=%.2f" % (fx, fy), "-> ground ~ E %.1f m, S %.1f m (x scaled by cos ratio ~1.0)" % (fx * ct.a, fy * 5.0))
print("NCC at zero", round(float(g[S, S]), 3), "| grid median", round(float(np.median(g)), 3), "| 2nd-best outside 1 px:", round(float(np.sort(g[np.abs(np.subtract.outer(np.arange(2*S+1), iy))[:, None].repeat(2*S+1,1) + np.abs(np.subtract.outer(np.arange(2*S+1), ix))[None, :].repeat(2*S+1,0) > 1])[-1]), 3))
