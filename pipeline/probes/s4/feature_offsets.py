"""S-4: feature-based horizontal offsets between the JPL CTX DEM, the USGS TRN CTX DTM and the HiRISE DTM (ROI-B + margin).

Each DEM is put on the native JPL CTX 20 m grid (HiRISE by area averaging of real 1 m pixels; TRN 20 m -> 20 m
bilinear because it is in a lat_ts=0 grid). Features = local extrema of a band-pass (difference of Gaussians,
sigma 1 and 3 cells) detected independently in each DEM, refined to sub-cell by a quadratic fit, matched by
mutual nearest neighbour of the same sign within R. Read-only; uses pipeline/cache/s4_roib.npz.
Usage: uv run python pipeline/probes/s4/feature_offsets.py
"""
import json
from pathlib import Path

import numpy as np
from affine import Affine
from rasterio.warp import Resampling, reproject
from scipy.ndimage import gaussian_filter, maximum_filter, minimum_filter
from scipy.spatial import cKDTree

REPO = Path(__file__).resolve().parents[3]
c = dict(np.load(REPO / "pipeline/cache/s4_roib.npz", allow_pickle=False))
ctx_crs = str(c["ctx_crs"])
jpl = c["jpl_dem"].astype(np.float64)
jt = Affine(*c["jpl_dem_transform"])
nod = float(c["jpl_dem_nodata"])
jpl[(jpl < -1e30) | (jpl == nod)] = np.nan


def onto_jpl(key, resampling):
    a = c[key].astype(np.float64)
    nd = float(c[key + "_nodata"])
    a[(a < -1e30) | (a == nd)] = np.nan
    out = np.full(jpl.shape, np.nan)
    reproject(a, out, src_transform=Affine(*c[key + "_transform"]), src_crs=str(c[key + "_crs"]),
              dst_transform=jt, dst_crs=ctx_crs, resampling=resampling, src_nodata=np.nan, dst_nodata=np.nan)
    return out


hi = onto_jpl("hirise_dtm", Resampling.average)
trn = onto_jpl("trn_dtm", Resampling.bilinear)
valid = np.isfinite(jpl) & np.isfinite(hi) & np.isfinite(trn)
rows, cols = np.nonzero(valid)
r0, r1, c0, c1 = rows.min() + 4, rows.max() - 4, cols.min() + 4, cols.max() - 4  # common valid interior


def features(z, q=70):
    z = z[r0:r1 + 1, c0:c1 + 1]
    zf = np.where(np.isfinite(z), z, np.nanmean(z))
    dog = gaussian_filter(zf, 1.0) - gaussian_filter(zf, 3.0)
    thr = np.percentile(np.abs(dog), q)
    out = []
    for sign, filt in ((1, maximum_filter), (-1, minimum_filter)):
        ext = (dog == filt(dog, size=5)) & (np.abs(dog) > thr)
        for r, cc in zip(*np.nonzero(ext)):
            if 1 <= r < dog.shape[0] - 1 and 1 <= cc < dog.shape[1] - 1:
                v = dog[r - 1:r + 2, cc - 1:cc + 2]
                dx = 0.5 * (v[1, 0] - v[1, 2]) / (v[1, 0] - 2 * v[1, 1] + v[1, 2]) if (v[1, 0] - 2 * v[1, 1] + v[1, 2]) != 0 else 0
                dy = 0.5 * (v[0, 1] - v[2, 1]) / (v[0, 1] - 2 * v[1, 1] + v[2, 1]) if (v[0, 1] - 2 * v[1, 1] + v[2, 1]) != 0 else 0
                if abs(dx) <= 1 and abs(dy) <= 1:
                    out.append((sign, (cc + dx) * 20.0, -(r + dy) * 20.0))  # metres: x east, y north
    return np.array(out)


def match(a, b, R):
    vecs = []
    for s in (1, -1):
        A, B = a[a[:, 0] == s][:, 1:], b[b[:, 0] == s][:, 1:]
        if len(A) == 0 or len(B) == 0:
            continue
        ta, tb = cKDTree(A), cKDTree(B)
        d, j = tb.query(A, distance_upper_bound=R)
        for i, (di, ji) in enumerate(zip(d, j)):
            if np.isfinite(di) and ta.query(B[ji])[1] == i:  # mutual nearest neighbour
                vecs.append(B[ji] - A[i])
    return np.array(vecs)


def stats(v, rng):
    if len(v) == 0:
        return {"n": 0}
    med = np.median(v, axis=0)
    boot = np.array([np.median(v[rng.integers(0, len(v), len(v))], axis=0) for _ in range(2000)])
    lo, hi_ = np.percentile(boot, [2.5, 97.5], axis=0)
    return {"n": int(len(v)), "median_east_m": round(float(med[0]), 1), "median_north_m": round(float(med[1]), 1),
            "ci95_east_m": [round(float(lo[0]), 1), round(float(hi_[0]), 1)], "ci95_north_m": [round(float(lo[1]), 1), round(float(hi_[1]), 1)],
            "mad_east_m": round(float(np.median(np.abs(v[:, 0] - med[0]))), 1), "mad_north_m": round(float(np.median(np.abs(v[:, 1] - med[1]))), 1)}


rng = np.random.default_rng(0)
F = {"jpl": features(jpl), "trn": features(trn), "hirise": features(hi)}
res = {"common_interior_cells": [int(r1 - r0 + 1), int(c1 - c0 + 1)], "features": {k: int(len(v)) for k, v in F.items()},
       "sign": "offset = (second DEM feature position) - (first DEM feature position); +east, +north"}
for R in (60.0, 100.0):
    for a, b in (("jpl", "hirise"), ("trn", "hirise"), ("jpl", "trn")):
        res[f"{b}_minus_{a}_R{int(R)}"] = stats(match(F[a], F[b], R), rng)
# robustness: north and south halves separately (R=60)
H = -(r1 - r0) * 20.0 / 2
for name, sel in (("north_half", lambda f: f[f[:, 2] > H]), ("south_half", lambda f: f[f[:, 2] <= H])):
    res[f"hirise_minus_jpl_{name}"] = stats(match(sel(F["jpl"]), sel(F["hirise"]), 60.0), rng)
# null test: random relabelling of HiRISE feature positions (shifted copies) should not produce a coherent offset
shifted = F["hirise"].copy()
shifted[:, 2] -= 40.0
res["control_hirise_shifted_40m_south_minus_jpl_R100"] = stats(match(F["jpl"], shifted, 100.0), rng)
print(json.dumps(res, indent=1))
