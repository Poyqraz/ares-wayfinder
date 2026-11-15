"""Figure: slope (deg) of the ROI-B steep cluster in the JPL CTX DEM, USGS TRN DTM and HiRISE (20 m area mean, and 2 m),
same extent, north up, with the >15 deg cluster centroid marked. Usage: uv run python pipeline/probes/s4/named_feature_figure.py <out.png>"""
import math, sys
from pathlib import Path
import numpy as np
from affine import Affine
from PIL import Image, ImageDraw
from rasterio.warp import Resampling, reproject

REPO = Path(__file__).resolve().parents[3]
c = dict(np.load(REPO / "pipeline/cache/s4_roib.npz", allow_pickle=False))
crs = str(c["ctx_crs"]); jt = Affine(*c["jpl_dem_transform"])
R, k = 3396190.0, math.cos(math.radians(18.4663))
E0, N0 = R * k * math.radians(77.4232), R * math.radians(18.4657)
HALF = 500.0


def grid(step):
    n = int(2 * HALF / step)
    return Affine(step, 0, E0 - HALF, 0, -step, N0 + HALF), (n, n)


def warp(key, step, rs):
    a = c[key].astype(np.float64); a[a < -1e30] = np.nan
    t, sh = grid(step); o = np.full(sh, np.nan)
    reproject(a, o, src_transform=Affine(*c[key + "_transform"]), src_crs=str(c[key + "_crs"]), dst_transform=t, dst_crs=crs, resampling=rs, src_nodata=np.nan, dst_nodata=np.nan)
    return o


def slope(z, step):
    gy, gx = np.gradient(z, step, step * math.cos(math.radians(18.4657)) / k)
    return np.degrees(np.arctan(np.hypot(gx, gy)))


panels = [("JPL CTX DEM 20 m", slope(warp("jpl_dem", 20, Resampling.nearest), 20)),
          ("USGS TRN CTX DTM 20 m", slope(warp("trn_dtm", 20, Resampling.bilinear), 20)),
          ("HiRISE DTM, 20 m area mean", slope(warp("hirise_dtm", 20, Resampling.average), 20)),
          ("HiRISE DTM 2 m area mean", slope(warp("hirise_dtm", 2, Resampling.average), 2))]
S = 300
out = Image.new("RGB", (4 * (S + 10) + 10, S + 40), (18, 14, 12)); d = ImageDraw.Draw(out)
for i, (title, s) in enumerate(panels):
    img = Image.fromarray((np.clip(np.nan_to_num(s) / 35, 0, 1) * 255).astype(np.uint8)).resize((S, S), Image.NEAREST)
    x = 10 + i * (S + 10); out.paste(img.convert("RGB"), (x, 28)); d.text((x, 8), title, fill=(255, 200, 150))
    m = s > 15
    if m.any():
        rr, cc = np.nonzero(m); w = s[m]
        cy, cx = (rr * w).sum() / w.sum(), (cc * w).sum() / w.sum()
        px, py = x + (cx + 0.5) / s.shape[1] * S, 28 + (cy + 0.5) / s.shape[0] * S
        d.ellipse((px - 5, py - 5, px + 5, py + 5), outline=(255, 154, 66), width=2)
    d.line((x + S / 2, 28, x + S / 2, 28 + S), fill=(80, 160, 200))  # reference: box centre lines
    d.line((x, 28 + S / 2, x + S, 28 + S / 2), fill=(80, 160, 200))
out.save(sys.argv[1])
