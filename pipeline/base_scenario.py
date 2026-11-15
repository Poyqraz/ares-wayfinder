"""ARES-1 hypothetical landing zone, main base and camps: candidate comparison from verified terrain bundles.

Inputs (committed, hash-checked bundles; no network): regional relief 40 m (analysis/regional_dem, DISPLAY-grade:
effective resolution ~100 m, vertical reference UNVERIFIED) and the M0-A HiRISE 2 m analysis grid.
This is a transparent scenario choice, not a landing-site certification: slope at 40 m says nothing about rocks,
dust, bearing strength, plume effects or radiation. NASA has not evaluated or approved any of these points.
Selection rules (fixed in this file before running):
  BASE   flattest 60 m-radius patch (lowest p95 Horn slope, 2 m HiRISE) inside the M0-A grid, >= 40 m from the grid
         edge and >= 120 m from every depot drop rover position (keep habitat traffic off the sample depot).
  LZ     lowest p95 slope (40 m regional grid) over 400 m-radius discs whose centre is 1.0-2.5 km from the base
         (assumed lander/habitat separation), compared with named reference candidates.
  CAMPS  A: flattest 30 m patch within 150 m of the A waypoint (2 m grid). B: flattest 300 m disc within 1 km of
         the B waypoint (40 m grid) - PROVISIONAL, no detailed terrain at B.
Usage (from pipeline/): uv run python base_scenario.py -> analysis/base/<version>/base_scenario.json
"""
import hashlib
import json
import math
import shutil
from pathlib import Path

import numpy as np
from scipy import ndimage

from roi import horn_slope_deg

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "analysis" / "base"
R = 3396190.0


def load(index, key):
    e = json.loads((REPO / index).read_bytes())[key]
    b = REPO / e["path"]
    for m in json.loads((b / "manifest.json").read_bytes()):
        assert hashlib.sha256((b / m["file"]).read_bytes()).hexdigest() == m["sha256"], m["file"]
    meta = json.loads((b / "terrain.json").read_bytes())
    dem = np.fromfile(b / "dem.f32.bin", dtype="<f4").reshape(meta["ny"], meta["nx"]).astype(np.float64)
    slope = horn_slope_deg(np.pad(dem, 1, mode="edge"), meta["dx_ground_m"], meta["dy_ground_m"])
    return meta, dem, slope


def en(meta, lat, lon):  # ground offsets (m) from the grid's NW corner; eqc lat_ts 0
    E, N = R * math.radians(lon), R * math.radians(lat)
    return (E - meta["x0"]) * meta["dx_ground_m"] / meta["dx_proj"], meta["y0"] - N


def geo(meta, x, y):
    E = meta["x0"] + x * meta["dx_proj"] / meta["dx_ground_m"]
    return {"lat": round(math.degrees((meta["y0"] - y) / R), 6), "lon": round(math.degrees(E / R), 6)}


def disc_stats(meta, dem, slope, x, y, radius):
    rows, cols = np.mgrid[0:meta["ny"], 0:meta["nx"]]
    cx, cy = (cols + 0.5) * meta["dx_ground_m"], (rows + 0.5) * meta["dy_ground_m"]
    m = np.hypot(cx - x, cy - y) <= radius
    s, h = slope[m], dem[m]
    return {"cells": int(m.sum()), "slope_p50_deg": round(float(np.percentile(s, 50)), 2), "slope_p95_deg": round(float(np.percentile(s, 95)), 2),
            "slope_max_deg": round(float(s.max()), 2), "relief_m": round(float(h.max() - h.min()), 1), "elev_mean_m": round(float(h.mean()), 1)}


def p95_field(meta, slope, radius):
    """p95 slope in a disc around every cell (percentile filter with a circular footprint)."""
    ry, rx = int(round(radius / meta["dy_ground_m"])), int(round(radius / meta["dx_ground_m"]))
    yy, xx = np.mgrid[-ry:ry + 1, -rx:rx + 1]
    fp = np.hypot(xx * meta["dx_ground_m"], yy * meta["dy_ground_m"]) <= radius
    return ndimage.percentile_filter(slope, 95, footprint=fp, mode="constant", cval=np.nan), max(ry, rx)


def dist(a, b):
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b["lon"] - a["lon"]) / 2) ** 2
    return round(2 * R * math.asin(math.sqrt(h)))


def best(meta, field, margin, mask):
    f = np.where(mask, field, np.nan)
    f[:margin, :] = f[-margin:, :] = np.nan
    f[:, :margin] = f[:, -margin:] = np.nan
    r, c = np.unravel_index(np.nanargmin(f), f.shape)
    return (c + 0.5) * meta["dx_ground_m"], (r + 0.5) * meta["dy_ground_m"], float(f[r, c])


def main():
    reg_meta, reg_dem, reg_slope = load("analysis/regional_dem/index.json", "regional_dem")
    m0a_meta, m0a_dem, m0a_slope = load("analysis/m0a/bundle/index.json", "m0a")
    cat_idx = json.loads((REPO / "ares1/bundle/index.json").read_bytes())["catalog"]
    cat = json.loads((REPO / cat_idx["path"] / "catalog.json").read_bytes())
    wp = {w["id"][-2:].strip(":"): {"lat": w["position"]["lat_deg"], "lon": w["position"]["lon_deg_east"]} for w in cat["reference_waypoints"]}
    drops = [{"lat": d["rover_position"]["lat_deg"], "lon": d["rover_position"]["lon_deg_east"]} for d in cat["depot_drop_events"]]
    targets = {"M0": wp["M0"], "A": wp["A"], "B": wp["B"]}

    # --- BASE inside the M0-A HiRISE grid
    f60, mg = p95_field(m0a_meta, m0a_slope, 60.0)
    rows, cols = np.mgrid[0:m0a_meta["ny"], 0:m0a_meta["nx"]]
    cx, cy = (cols + 0.5) * m0a_meta["dx_ground_m"], (rows + 0.5) * m0a_meta["dy_ground_m"]
    far = np.ones(f60.shape, bool)
    for d in drops:
        x, y = en(m0a_meta, d["lat"], d["lon"])
        far &= np.hypot(cx - x, cy - y) >= 120.0
    edge = int(round(40.0 / m0a_meta["dy_ground_m"])) + mg
    bx, by, _ = best(m0a_meta, f60, edge, far)
    base = {**geo(m0a_meta, bx, by), "grid": "m0a", "radius_m": 60, **disc_stats(m0a_meta, m0a_dem, m0a_slope, bx, by, 60.0)}
    # --- CAMP A near the A waypoint (2 m grid)
    f30, mg30 = p95_field(m0a_meta, m0a_slope, 30.0)
    ax, ay = en(m0a_meta, wp["A"]["lat"], wp["A"]["lon"])
    cax, cay, _ = best(m0a_meta, f30, mg30 + 5, np.hypot(cx - ax, cy - ay) <= 150.0)
    camp_a = {**geo(m0a_meta, cax, cay), "grid": "m0a", "radius_m": 30, **disc_stats(m0a_meta, m0a_dem, m0a_slope, cax, cay, 30.0)}

    # --- regional 40 m grid: landing zone search and named candidates
    f400, mgr = p95_field(reg_meta, reg_slope, 400.0)
    rr, rc = np.mgrid[0:reg_meta["ny"], 0:reg_meta["nx"]]
    gx, gy = (rc + 0.5) * reg_meta["dx_ground_m"], (rr + 0.5) * reg_meta["dy_ground_m"]
    bxr, byr = en(reg_meta, base["lat"], base["lon"])
    ring = (np.hypot(gx - bxr, gy - byr) >= 1000.0) & (np.hypot(gx - bxr, gy - byr) <= 2500.0)
    lx, ly, _ = best(reg_meta, f400, mgr, ring)

    def cand(cid, name, lat, lon, note):
        x, y = en(reg_meta, lat, lon)
        p = {"lat": lat, "lon": lon}
        return {"id": cid, "name": name, **p, "note": note, "radius_m": 400, **disc_stats(reg_meta, reg_dem, reg_slope, x, y, 400.0),
                "distance_m": {k: dist(p, t) for k, t in targets.items()}, "distance_to_base_m": dist(p, base)}
    lzg = geo(reg_meta, lx, ly)
    candidates = [
        cand("LZ-1", "Crater floor near Three Forks (flattest disc 1.0-2.5 km from the base)", lzg["lat"], lzg["lon"], "selected by the rule in this file"),
        cand("LZ-2", "Octavia E. Butler landing site (Perseverance, 2021)", 18.44463, 77.45088, "historical robotic landing point; NTRS 20210024644 coordinate as used in ROI-A"),
        cand("LZ-3", "Three Forks depot area", wp["M0"]["lat"], wp["M0"]["lon"], "the sample depot itself; excluded as a landing zone to protect the tubes"),
        cand("LZ-4", "Delta top near Belva crater (F02 anchor)", 18.48292946, 77.36900835, "on the fan, next to an impact crater"),
        cand("LZ-5", "Neretva Vallis near Bright Angel (B waypoint)", wp["B"]["lat"], wp["B"]["lon"], "inlet valley floor; HiRISE CR_SOUTH parallax caveat"),
    ]
    # --- CAMP B (provisional, 40 m grid)
    f300, mg3 = p95_field(reg_meta, reg_slope, 300.0)
    bwx, bwy = en(reg_meta, wp["B"]["lat"], wp["B"]["lon"])
    cbx, cby, _ = best(reg_meta, f300, mg3, np.hypot(gx - bwx, gy - bwy) <= 1000.0)
    camp_b = {**geo(reg_meta, cbx, cby), "grid": "regional_40m", "radius_m": 300, **disc_stats(reg_meta, reg_dem, reg_slope, cbx, cby, 300.0)}

    lz = candidates[0]
    ridx = json.loads((REPO / "web/public/data/index.json").read_bytes())["roi_a"]
    rb = json.loads((REPO / "web/public" / ridx["path"] / "terrain.json").read_bytes())["bounds_geo"]
    lz_in_roi_a = rb["lat_min"] <= lz["lat"] <= rb["lat_max"] and rb["lon_min"] <= lz["lon"] <= rb["lon_max"]
    butler = dist(lz, {"lat": 18.44463, "lon": 77.45088})
    scen = {
        "schema": "ares-base-scenario/1",
        "status": "HYPOTHETICAL scenario reference; not evaluated or approved by NASA; not a landing-site certification",
        "inputs": {"regional_relief": reg_meta["dataset_version"], "m0a": m0a_meta["dataset_version"], "catalog": cat_idx["version"]},
        "sites": {
            "landing_zone": {"id": "LZ-1", "role": "candidate human landing zone", "lat": lz["lat"], "lon": lz["lon"], "radius_m": 400,
                             "evaluation": "40 m regional relief (display-grade); PROVISIONAL", "inside_roi_a": lz_in_roi_a,
                             "routable": lz_in_roi_a, "routable_note": "inside the ROI-A CTX 20 m grid only; no analysis grid connects it to the base",
                             "distance_to_perseverance_landing_m": butler, "search_note": "the minimum lies near the outer edge of the 1.0-2.5 km search ring"},
            "base": {"id": "BASE", "role": "primary habitat / base (scenario reference and expedition start)", **base,
                     "evaluation": "HiRISE 2 m prototype grid (slope only)", "routable": True},
            "camp_a": {"id": "CAMP-A", "role": "temporary expedition camp, Western Delta", **camp_a, "evaluation": "HiRISE 2 m prototype grid (slope only)", "routable": True},
            "camp_b": {"id": "CAMP-B", "role": "temporary expedition camp, Bright Angel (PROVISIONAL)", **camp_b,
                       "evaluation": "40 m regional relief only; no detailed terrain at B", "routable": False},
        },
        "candidates": candidates,
        "distances_from_base_m": {**{k: dist(base, t) for k, t in targets.items()}, "landing_zone": dist(base, lz), "camp_a": dist(base, camp_a), "camp_b": dist(base, camp_b)},
        "rules": (__doc__ or "").split("Selection rules (fixed in this file before running):")[1].split("Usage")[0].strip(),
        "not_evaluated": ["rock abundance and small obstacles", "dust depth, bearing strength, trafficability", "lander plume and ejecta effects",
                          "radiation (no Jezero surface measurement; no spatial dataset)", "thermal, wind and dust-storm conditions at the site",
                          "solar power and illumination", "communications and logistics", "planetary protection constraints"],
        "limits": ["Slopes on the 40 m grid are averages over ~100 m; a low value does not mean a smooth or safe surface.",
                   "Vertical reference of both terrain products is UNVERIFIED.", "Targets are rover waypoints, not exact rock or tube positions."],
    }
    tmp = OUT / "_staging"
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    (tmp / "base_scenario.json").write_bytes(json.dumps(scen, indent=1).encode())
    mb = json.dumps([{"file": "base_scenario.json", "sha256": hashlib.sha256((tmp / "base_scenario.json").read_bytes()).hexdigest()}], indent=1).encode()
    (tmp / "manifest.json").write_bytes(mb)
    ver = hashlib.sha256(mb).hexdigest()[:12]
    shutil.rmtree(OUT / ver, ignore_errors=True)
    tmp.rename(OUT / ver)
    (OUT / "index.json").write_bytes(json.dumps({"base_scenario": {"version": ver, "path": f"analysis/base/{ver}/"}}, indent=1).encode())
    print(ver)
    print(json.dumps({"base": base, "camp_a": camp_a, "camp_b": camp_b, "from_base": scen["distances_from_base_m"]}, indent=1))
    for c in candidates:
        print(c["id"], c["lat"], c["lon"], "p50", c["slope_p50_deg"], "p95", c["slope_p95_deg"], "max", c["slope_max_deg"], "relief", c["relief_m"], c["distance_m"], "base", c["distance_to_base_m"])


if __name__ == "__main__":
    main()
