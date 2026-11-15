"""S-4 support: horizontal offset between the CTX DEM and the HiRISE DTM on ROI-A (read-only, offline).

Shift the HiRISE 2 m grid by (dx, dy) in 2 m steps, block-average to the CTX 20 m cells, and compute the
Pearson r of plane-detrended heights over interior cells. The peak gives where HiRISE terrain best
matches CTX terrain. Usage: uv run python pipeline/probes/hirise/s4_dem_offset.py
"""
import json
from pathlib import Path

import numpy as np

D = Path(__file__).resolve().parents[3] / "web" / "public" / "data"
t = json.loads((D / "roi_a" / "fc22a0c8a91f" / "terrain.json").read_bytes())
m = json.loads((D / "hirise" / "roi_a" / "e88cfab318e6" / "manifest.json").read_bytes())
g = m["grids"]["dtm_2m"]
hi = np.frombuffer((D / "hirise" / "roi_a" / "e88cfab318e6" / g["file"]).read_bytes(), "<f4").reshape(g["ny"], g["nx"]).astype(np.float64)
ctx = np.fromfile(D / "roi_a" / "fc22a0c8a91f" / "dem.f32.bin", "<f4").reshape(t["ny"], t["nx"]).astype(np.float64)
B = 3  # interior border in CTX cells (60 m) so every shift stays inside the HiRISE grid
c = ctx[B:-B, B:-B]


def detrend(z):
    yy, xx = np.mgrid[:z.shape[0], :z.shape[1]]
    A = np.c_[np.ones(z.size), xx.ravel(), yy.ravel()]
    return z - (A @ np.linalg.lstsq(A, z.ravel(), rcond=None)[0]).reshape(z.shape)


cd = detrend(c)
S = 20  # +/- 20 steps of 2 m = +/- 40 m
grid = np.zeros((2 * S + 1, 2 * S + 1))
for sy in range(-S, S + 1):          # +sy: sample HiRISE further SOUTH
    for sx in range(-S, S + 1):      # +sx: sample HiRISE further EAST
        r0, c0 = B * 10 + sy, B * 10 + sx
        win = hi[r0:r0 + c.shape[0] * 10, c0:c0 + c.shape[1] * 10]
        h20 = win.reshape(c.shape[0], 10, c.shape[1], 10).mean(axis=(1, 3))
        a, b = detrend(h20), cd
        grid[sy + S, sx + S] = (a * b).sum() / np.sqrt((a * a).sum() * (b * b).sum())
iy, ix = np.unravel_index(np.argmax(grid), grid.shape)


def sub(v):
    a, b0, cc = v
    d = a - 2 * b0 + cc
    return 0.0 if d == 0 else 0.5 * (a - cc) / d


fx = ix - S + (sub(grid[iy, ix - 1:ix + 2]) if 0 < ix < 2 * S else 0)
fy = iy - S + (sub(grid[iy - 1:iy + 2, ix]) if 0 < iy < 2 * S else 0)
# If CTX cell content best matches HiRISE sampled +sx east, the same terrain sits sx*2 m further EAST in HiRISE than in CTX.
half = grid >= grid.max() - 0.005
ys, xs = np.nonzero(half)
print(json.dumps({
    "peak_r": round(float(grid.max()), 4), "r_at_zero_shift": round(float(grid[S, S]), 4),
    "hirise_minus_ctxdem_offset_m": {"east": round(float(fx * 2), 2), "north": round(float(-fy * 2), 2)},
    "peak_on_search_border": bool(ix in (0, 2 * S) or iy in (0, 2 * S)),
    "region_within_0.005_of_peak_m": {"east": [int((xs.min() - S) * 2), int((xs.max() - S) * 2)], "north": [int(-(ys.max() - S) * 2), int(-(ys.min() - S) * 2)]},
    "cells": int(c.size),
}, indent=1))
