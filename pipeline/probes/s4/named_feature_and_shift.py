"""S-4: (1) a named control feature (ROI-B steep cluster near 18.4657 N, 77.4232 E) located independently in each DEM;
(2) export ROI-A DEMs shifted by one 20 m cell N/S/E/W from the JPL source window (for the routing-sensitivity test),
and slope differences caused by the shift. Read-only; writes only to the given scratch dir.
Usage: uv run python pipeline/probes/s4/named_feature_and_shift.py <scratch_dir>
"""
import json, math, sys
from pathlib import Path
import numpy as np
from affine import Affine
from rasterio.warp import Resampling, reproject
from scipy.ndimage import label

OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
REPO = Path(__file__).resolve().parents[3]
c = dict(np.load(REPO / "pipeline/cache/s4_roib.npz", allow_pickle=False))
ctx_crs = str(c["ctx_crs"]); jt = Affine(*c["jpl_dem_transform"])
jpl = c["jpl_dem"].astype(np.float64); jpl[jpl < -1e30] = np.nan
R, LATTS = 3396190.0, 18.4663
k = math.cos(math.radians(LATTS))


def onto(key, rs):
    a = c[key].astype(np.float64); a[a < -1e30] = np.nan
    o = np.full(jpl.shape, np.nan)
    reproject(a, o, src_transform=Affine(*c[key + "_transform"]), src_crs=str(c[key + "_crs"]), dst_transform=jt, dst_crs=ctx_crs, resampling=rs, src_nodata=np.nan, dst_nodata=np.nan)
    return o


def slope(z, dxg=20.0 * math.cos(math.radians(18.44)) / k, dyg=20.0):
    p = np.pad(z, 1, mode="edge")
    gx = ((p[:-2, 2:] + 2 * p[1:-1, 2:] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[1:-1, :-2] + p[2:, :-2])) / (8 * dxg)
    gy = ((p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[:-2, 1:-1] + p[:-2, 2:])) / (8 * dyg)
    return np.degrees(np.arctan(np.hypot(gx, gy)))


dems = {"jpl": jpl, "trn": onto("trn_dtm", Resampling.bilinear), "hirise": onto("hirise_dtm", Resampling.average)}
# (1) named feature: steepest connected cluster within 400 m of 18.4657 N, 77.4232 E
E0, N0 = R * k * math.radians(77.4232), R * math.radians(18.4657)
cc0, rr0 = ~jt * (E0, N0)
res = {"named_feature": {"approx_location": "18.4657 N, 77.4232 E (ROI-B steep cluster found at T04)", "threshold_deg": 15}}
for name, z in dems.items():
    s = slope(z)
    win = np.zeros_like(s, bool)
    rr, cc = np.mgrid[:s.shape[0], :s.shape[1]]
    win[np.hypot(rr - rr0, cc - cc0) < 20] = True  # 400 m radius
    lab, n = label((s > 15) & win)
    if n == 0:
        res["named_feature"][name] = None; continue
    sizes = np.bincount(lab.ravel())[1:]; big = np.argmax(sizes) + 1
    m = lab == big; w = s[m]
    r_c, c_c = (rr[m] * w).sum() / w.sum(), (cc[m] * w).sum() / w.sum()
    E, N = jt * (c_c + 0.5, r_c + 0.5)
    res["named_feature"][name] = {"cells": int(m.sum()), "max_slope_deg": round(float(s[m].max()), 1), "centroid_E": round(E, 1), "centroid_N": round(N, 1)}
f = res["named_feature"]
if f.get("jpl") and f.get("hirise") and f.get("trn"):
    for a, b in (("jpl", "hirise"), ("trn", "hirise"), ("jpl", "trn")):
        res["named_feature"][f"{b}_minus_{a}_m"] = {"east": round(f[b]["centroid_E"] - f[a]["centroid_E"], 1), "north": round(f[b]["centroid_N"] - f[a]["centroid_N"], 1)}
# (2) ROI-A shifted DEMs from the JPL window (same native grid)
t = json.loads((REPO / "web/public/data/roi_a/fc22a0c8a91f/terrain.json").read_bytes())
co, ro = round((t["x0"] - jt.c) / 20), round((jt.f - t["y0"]) / 20)
base = jpl[ro:ro + t["ny"], co:co + t["nx"]]
bundle = np.fromfile(REPO / "web/public/data/roi_a/fc22a0c8a91f/dem.f32.bin", "<f4").reshape(t["ny"], t["nx"])
res["roi_a_window_equals_bundle"] = bool(np.allclose(base, bundle, atol=1e-4))
# "terrain_north": the true terrain lies one cell north of where the CTX DEM puts it -> sample the DEM one row south
for name, (dr, dc) in {"terrain_north": (1, 0), "terrain_south": (-1, 0), "terrain_east": (0, -1), "terrain_west": (0, 1)}.items():
    sh = jpl[ro + dr:ro + dr + t["ny"], co + dc:co + dc + t["nx"]].astype("<f4")
    sh.tofile(OUT / f"roi_a_dem_{name}.f32.bin")
    d = np.abs(slope(sh.astype(np.float64)) - slope(base))
    res.setdefault("slope_change_deg_roi_a", {})[name] = {"median": round(float(np.median(d)), 2), "p95": round(float(np.percentile(d, 95)), 2), "max": round(float(d.max()), 2)}
    dh = np.abs(sh - base)
    res.setdefault("height_change_m_roi_a", {})[name] = {"median": round(float(np.median(dh)), 2), "p95": round(float(np.percentile(dh, 95)), 2), "max": round(float(dh.max()), 2)}
print(json.dumps(res, indent=1))
