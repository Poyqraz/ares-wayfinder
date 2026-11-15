import json, math, sys
import numpy as np, rasterio
from rasterio.warp import reproject, Resampling
from affine import Affine
from PIL import Image
D = sys.argv[1]
z = np.load(f"{D}/dtm_roi.npy").astype(np.float64); zt = Affine(*json.load(open(f"{D}/dtm_roi.json"))["transform"])
img = np.load(f"{D}/ortho_roi.npy"); oj = json.load(open(f"{D}/ortho_roi.json")); ot = Affine(*oj["transform"])
DCRS = "+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +R=3396190 +units=m +no_defs"
o1 = np.zeros(z.shape, np.float32)
reproject(img.astype(np.float32), o1, src_transform=ot, src_crs=oj["crs"], dst_transform=zt, dst_crs=DCRS, resampling=Resampling.average, src_nodata=0, dst_nodata=0)
dx = math.cos(math.radians(18.437)); dy = 1.0
def hill(zz, az, el):
    gy, gx = np.gradient(zz, dy, dx)
    slope = np.arctan(np.hypot(gx, gy)); aspect = np.arctan2(-gx, gy)
    a = math.radians(360 - az + 90); e = math.radians(el)
    return np.sin(e) * np.cos(slope) + np.cos(e) * np.sin(slope) * np.cos(a - aspect)
def ncc(a, b):
    m = np.isfinite(a) & np.isfinite(b) & (b > 0)
    a = a[m] - a[m].mean(); b = b[m] - b[m].mean(); return float((a * b).sum() / math.sqrt((a * a).sum() * (b * b).sum()))
# high-pass both (remove albedo/large-scale), crop interior
def hp(x, k=25):
    from scipy.ndimage import uniform_filter
    return x - uniform_filter(x, k)
c = slice(20, -20)
best = None
for az in range(0, 360, 15):
    for el in (30, 45, 60):
        h = hp(hill(z, az, el))[c, c]; v = ncc(h, hp(o1.astype(np.float64))[c, c])
        if best is None or v > best[0]: best = (v, az, el)
print("best illumination NCC (high-passed hillshade vs ortho at 1 m):", [round(best[0], 3), best[1], best[2]])
h = hp(hill(z, best[1], best[2])); o = hp(o1.astype(np.float64))
S = 8; grid = np.full((2 * S + 1, 2 * S + 1), np.nan)
H, W = z.shape
for sy in range(-S, S + 1):
    for sx in range(-S, S + 1):
        a = h[30 + sy:H - 30 + sy, 30 + sx:W - 30 + sx]; b = o[30:H - 30, 30:W - 30]
        grid[sy + S, sx + S] = ncc(a, b)
iy, ix = np.unravel_index(np.nanargmax(grid), grid.shape)
print("DTM-vs-ortho shift search (1 m px, +x east, +y south): best (dx,dy) =", (ix - S, iy - S), "NCC", round(float(grid[iy, ix]), 3), "| NCC at (0,0):", round(float(grid[S, S]), 3), "| median of grid:", round(float(np.nanmedian(grid)), 3))
# HiRISE vs CTX DEM horizontal offset via elevation matching (shift HiRISE sample positions, aggregate to CTX cells)
BUN = str(__import__("pathlib").Path(__file__).resolve().parents[3] / "web/public/data/roi_a/fc22a0c8a91f") + "/"
meta = json.load(open(BUN + "terrain.json")); nx, ny, x0, y0, d = meta["nx"], meta["ny"], meta["x0"], meta["y0"], meta["dx_proj"]
ctx = np.fromfile(BUN + "dem.f32.bin", dtype="<f4").reshape(ny, nx).astype(np.float64)
R = 3396190.0; k = math.cos(math.radians(meta["lat_ts_deg"]))
cc, rr = np.meshgrid(np.arange(W) + 0.5, np.arange(H) + 0.5)
X = zt.c + cc * zt.a; Y = zt.f + rr * zt.e
lonr = X / R; latr = Y / R
valid = np.isfinite(z)
res = []
for sx in range(-40, 41, 4):          # ground metres east
    for sy in range(-40, 41, 4):      # ground metres north
        col = np.floor((R * k * (lonr + sx / (R * math.cos(math.radians(18.437)))) - x0) / d).astype(int)
        row = np.floor((y0 - R * (latr + sy / R)) / d).astype(int)
        ok = valid & (col >= 0) & (col < nx) & (row >= 0) & (row < ny)
        idx = row[ok] * nx + col[ok]
        s_ = np.bincount(idx, z[ok], nx * ny); n_ = np.bincount(idx, None, nx * ny)
        full = n_ >= 380
        diff = ctx.ravel()[full] - s_[full] / n_[full]
        res.append((float(np.std(diff)), sx, sy, float(np.median(diff)), int(full.sum())))
res.sort()
print("CTX-vs-HiRISE DEM horizontal shift (ground m, HiRISE moved by +E,+N), best 3 by residual std:", [tuple(round(v, 3) if isinstance(v, float) else v for v in r) for r in res[:3]])
zero = [r for r in res if r[1] == 0 and r[2] == 0][0]; print("  at zero shift: std", round(zero[0], 3), "median", round(zero[3], 3))
# visual: side-by-side crop around Landing
Hs = (hill(z, best[1], best[2]) * 255).clip(0, 255).astype(np.uint8)
Image.fromarray(np.hstack([Hs, (o1 / max(o1.max(), 1) * 255).astype(np.uint8)])).resize((W // 2 * 2 // 2, H // 2)).save(f"{D}/coreg_pair.jpg", quality=70)
