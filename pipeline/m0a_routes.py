"""M0-A gate G6 (connectivity), independent Python route costs, and sensitivity, on bundle analysis/m0a/bundle.

Two Python implementations, both written from contracts/CONTRACT.md §3 and sharing no code with core/src/route.ts:
  - oracle.route_cost (explicit loop edge list, SciPy Dijkstra) -> reference costs for the TS parity check;
  - edges() below (vectorised edge list, SciPy Dijkstra with predecessors) -> paths for sensitivity; its costs
    are checked against oracle.route_cost before any sensitivity number is reported.
g_max 0.45 (~24.2 deg) is an experimental algorithm threshold (the cost curve's fitted domain), not a safety limit.
Usage (from pipeline/): uv run python m0a_routes.py [--offline]
Output: analysis/m0a/results/oracle_<version>.json, analysis/m0a/results/sensitivity_<version>.json
"""
import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from rasterio.warp import Resampling, reproject, transform_bounds
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components, dijkstra

import m0a_area as area
import oracle
from m0a_g3g4 import PAIR_URL, read_float
from m0a_validate import ENV

REPO = Path(__file__).resolve().parent.parent
BUNDLE_INDEX = area.ANALYSIS / "bundle" / "index.json"
RESULTS = area.ANALYSIS / "results"
PAIR_CACHE = Path(__file__).parent / "cache" / f"{area.AREA}_pairs.npz"
P_A, P_B, FWD, REV = area.PRIMARY  # the pair the connectivity summary and the sensitivity study are about
G_MAX = 0.45
POLICIES = [("distance", "minetti"), ("terrain", "minetti"), ("terrain", "tobler")]
DIRS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def load_bundle():
    idx = json.loads(BUNDLE_INDEX.read_bytes())[area.AREA]
    b = REPO / idx["path"]
    for m in json.loads((b / "manifest.json").read_bytes()):
        assert hashlib.sha256((b / m["file"]).read_bytes()).hexdigest() == m["sha256"], f"integrity: {m['file']}"
    assert hashlib.sha256((b / "manifest.json").read_bytes()).hexdigest()[:12] == idx["dataset_version"]
    assert hashlib.sha256((b / "terrain.json").read_bytes()).hexdigest() == idx["terrain_json_sha256"]
    meta = json.loads((b / "terrain.json").read_bytes())
    nx, ny = meta["nx"], meta["ny"]
    dem = np.fromfile(b / "dem.f32.bin", dtype="<f4").reshape(ny, nx)
    slope = np.fromfile(b / "slope_deg.f32.bin", dtype="<f4").reshape(ny, nx)
    val = np.fromfile(b / "validity.u8.bin", dtype=np.uint8).reshape(ny, nx)
    ends = json.loads((b / "endpoints.json").read_bytes())["endpoints"]
    return meta, dem, slope, val, ends


def mult(curve, g):
    if curve == "minetti":
        return (280.5 * g**5 - 58.7 * g**4 - 76.8 * g**3 + 51.9 * g**2 + 19.6 * g + 2.5) / 2.5
    return np.exp(3.5 * (np.abs(g + 0.05) - 0.05))


def edges(dem, passable, dx, dy, mode, curve, g_max):
    """Vectorised 8-connected directed edge list (no corner cutting), as a CSR matrix."""
    ny, nx = dem.shape
    idx = np.arange(nx * ny).reshape(ny, nx)
    src, dst, w = [], [], []
    for dr, dc in DIRS:
        r0, r1 = max(0, -dr), ny - max(0, dr)
        c0, c1 = max(0, -dc), nx - max(0, dc)
        a = (slice(r0, r1), slice(c0, c1))
        b = (slice(r0 + dr, r1 + dr), slice(c0 + dc, c1 + dc))
        ok = passable[a] & passable[b]
        if dr and dc:
            ok &= passable[(slice(r0 + dr, r1 + dr), slice(c0, c1))] & passable[(slice(r0, r1), slice(c0 + dc, c1 + dc))]
        L = math.sqrt(dx * dx + dy * dy) if dr and dc else (dy if dr else dx)
        cost = np.full(ok.shape, L)
        if mode == "terrain":
            g = (dem[b].astype(np.float64) - dem[a].astype(np.float64)) / L
            ok &= np.abs(g) <= g_max
            cost = L * mult(curve, g)
        src.append(idx[a][ok]); dst.append(idx[b][ok]); w.append(cost[ok])
    src, dst, w = np.concatenate(src), np.concatenate(dst), np.concatenate(w)
    return coo_matrix((w, (src, dst)), shape=(nx * ny, nx * ny)).tocsr()


def shortest(m, s, t, nx):
    d, pred = dijkstra(m, directed=True, indices=s, return_predecessors=True)
    if math.isinf(d[t]):
        return None, None
    path = [t]
    while path[-1] != s:
        path.append(int(pred[path[-1]]))
    return float(d[t]), [(k // nx, k % nx) for k in reversed(path)]


def metrics(path, dem, dx, dy):
    L = up = down = maxg = 0.0
    for (r1, c1), (r2, c2) in zip(path, path[1:]):
        step = math.sqrt(dx * dx + dy * dy) if r1 != r2 and c1 != c2 else (dy if r1 != r2 else dx)
        dz = float(dem[r2, c2]) - float(dem[r1, c1])
        L += step; up += max(dz, 0); down += max(-dz, 0); maxg = max(maxg, abs(dz) / step)
    return {"length_horizontal_m": round(L, 4), "ascent_m": round(up, 3), "descent_m": round(down, 3),
            "max_edge_grade": round(maxg, 4), "max_edge_slope_deg": round(math.degrees(math.atan(maxg)), 2), "cells": len(path)}


def deviation(p, q, dx, dy):
    """Hausdorff and mean distance (ground m) of path q from path p, using cell centres."""
    a = np.array(p, dtype=float) * [dy, dx]
    b = np.array(q, dtype=float) * [dy, dx]
    d = np.sqrt(((a[:, None, :] - b[None, :, :]) ** 2).sum(-1))
    return {"hausdorff_m": round(float(max(d.min(1).max(), d.min(0).max())), 2), "mean_m": round(float(d.min(0).mean()), 2)}


def pair_grids(meta, offline):
    if offline or PAIR_CACHE.exists():
        c = np.load(PAIR_CACHE)
        return {k: c[k] for k in c.files}
    nx, ny, x0, y0 = meta["nx"], meta["ny"], meta["x0"], meta["y0"]
    dst_t = Affine(meta["dx_proj"], 0, x0, 0, -meta["dy_proj"], y0)
    crs = f"+proj=eqc +lat_ts={meta['lat_ts_deg']} +lat_0=0 +lon_0={meta['central_meridian_deg']} +x_0=0 +y_0=0 +R={meta['radius_m']} +units=m +no_defs"
    out = {}
    with rasterio.Env(**ENV):
        for pair in ("C", "W", "DL"):
            with rasterio.open("/vsicurl/" + PAIR_URL.format(pair)) as src:
                w = src.window(*transform_bounds(crs, src.crs, x0 - 4, y0 - ny * meta["dy_proj"] - 4, x0 + nx * meta["dx_proj"] + 4, y0 + 4, densify_pts=64))
                w = w.round_offsets().round_lengths()
                a = read_float(src, w)
                g = np.full((ny, nx), np.nan)
                reproject(a, g, src_transform=src.window_transform(w), src_crs=src.crs, dst_transform=dst_t, dst_crs=crs,
                          resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan)
                out[pair] = g
    PAIR_CACHE.parent.mkdir(exist_ok=True)
    np.savez_compressed(PAIR_CACHE, **out)
    return out


def robust_sigma(d):
    d = d[np.isfinite(d)]
    return float(1.4826 * np.median(np.abs(d - np.median(d))))


def main():
    offline = "--offline" in sys.argv
    meta, dem, slope, val, ends = load_bundle()
    ver, nx = meta["dataset_version"], meta["nx"]
    dx, dy = meta["dx_ground_m"], meta["dy_ground_m"]
    passable = (val == 0) | (val == 3)
    cell = lambda k: (ends[k]["row"], ends[k]["col"])  # noqa: E731
    S, T = cell(P_A), cell(P_B)
    s, t = S[0] * nx + S[1], T[0] * nx + T[1]

    # --- G6: connectivity under the configured threshold (no relaxation)
    m_terrain = edges(dem, passable, dx, dy, "terrain", "minetti", G_MAX)
    n_comp, labels = connected_components(m_terrain, directed=True, connection="strong")
    g6 = {"g_max_grade": G_MAX, "g_max_deg": round(math.degrees(math.atan(G_MAX)), 2),
          "threshold_kind": "experimental algorithm threshold (cost-curve domain), NOT an astronaut safety limit",
          "same_strong_component": bool(labels[s] == labels[t]),
          "component_share_of_grid": round(float((labels == labels[s]).mean()), 4),
          "edges_removed_share": round(1 - m_terrain.nnz / edges(dem, passable, dx, dy, "distance", "minetti", G_MAX).nnz, 4)}
    g6["result"] = "CONNECTED" if g6["same_strong_component"] else "NO_ROUTE"
    g6["pair"] = FWD
    g6["all_pairs_connected"] = {fwd: bool(labels[cell(a)[0] * nx + cell(a)[1]] == labels[cell(b)[0] * nx + cell(b)[1]]) for a, b, fwd, _ in area.ROUTES}

    # --- reference costs: loop oracle (independent) and vectorised implementation must agree
    oracle_cases, nominal = [], {}
    for a, b, name in [x for ka, kb, fwd, rev in area.ROUTES for x in ((cell(ka), cell(kb), fwd), (cell(kb), cell(ka), rev))]:
        for mode, curve in POLICIES:
            ref = oracle.route_cost(dem, val, slope, dx, dy, a, b, mode, curve, G_MAX, None)
            m = edges(dem, passable, dx, dy, mode, curve, G_MAX)
            vec, path = shortest(m, a[0] * nx + a[1], b[0] * nx + b[1], nx)
            agree = (ref is None and vec is None) or (ref is not None and vec is not None and abs(ref - vec) <= 1e-9 * max(1.0, ref))
            assert agree, (name, mode, curve, ref, vec)
            key = f"{name} {mode}{'' if mode == 'distance' else '-' + curve}"
            oracle_cases.append({"id": key, "start": list(a), "goal": list(b), "mode": mode, "curve": curve, "g_max": G_MAX, "gate": None,
                                 "expected_cost": ref, "vectorised_cost": vec})
            if path:
                nominal[key] = (vec, path)
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / f"oracle_{ver}.json").write_bytes(json.dumps({"dataset_version": ver, "generator": "pipeline/m0a_routes.py (oracle.route_cost)",
                                                            "g6": g6, "cases": oracle_cases}, indent=1).encode())

    # --- sensitivity (the primary pair), paths from the vectorised implementation
    sens = {"dataset_version": ver, "g6": g6, "nominal": {k: {"cost_flat_equiv_m": round(c, 4), **metrics(p, dem, dx, dy)} for k, (c, p) in nominal.items()}}
    base = {k: p for k, (_, p) in nominal.items() if k.startswith(FWD)}
    rows = []
    for g in (0.25, 0.35, 0.45):
        for curve in ("minetti", "tobler"):
            c, p = shortest(edges(dem, passable, dx, dy, "terrain", curve, g), s, t, nx)
            ref = base[f"{FWD} terrain-{curve}"]
            rows.append({"g_max": g, "g_max_deg": round(math.degrees(math.atan(g)), 1), "curve": curve,
                         "status": "OK" if p else "NO_ROUTE", **({"cost_flat_equiv_m": round(c, 3), **metrics(p, dem, dx, dy), **deviation(ref, p, dx, dy)} if p else {})})
    sens["threshold"] = rows

    # endpoint / registration perturbation: shift both endpoints together (catalog frame vs DEM frame)
    rows = []
    for r_m in (2.0, 4.0):
        for ang in range(0, 360, 45):
            e, n = r_m * math.sin(math.radians(ang)), r_m * math.cos(math.radians(ang))
            def moved(ep):
                col = math.floor((ep["E"] + e * meta["dx_proj"] / dx - meta["x0"]) / meta["dx_proj"])
                row = math.floor((meta["y0"] - (ep["N"] + n)) / meta["dy_proj"])
                return row, col
            a, b = moved(ends[P_A]), moved(ends[P_B])
            for curve in ("minetti",):
                c, p = shortest(edges(dem, passable, dx, dy, "terrain", curve, G_MAX), a[0] * nx + a[1], b[0] * nx + b[1], nx)
                ref = base[f"{FWD} terrain-minetti"]
                rows.append({"shift_m": r_m, "azimuth_deg": ang, "start": list(a), "goal": list(b), "status": "OK" if p else "NO_ROUTE",
                             **({"cost_flat_equiv_m": round(c, 3), "length_horizontal_m": metrics(p, dem, dx, dy)["length_horizontal_m"], **deviation(ref, p, dx, dy)} if p else {})})
    sens["endpoint_shift"] = rows

    # DEM perturbation: route on each independent HiRISE stereo pair (same grid, same endpoints)
    pairs = pair_grids(meta, offline)
    rows = []
    for pair, z in pairs.items():
        pz = np.isfinite(z)
        for mode, curve in POLICIES:
            c, p = shortest(edges(z, pz, dx, dy, mode, curve, G_MAX), s, t, nx)
            ref = base[f"{FWD} {mode}{'' if mode == 'distance' else '-' + curve}"]
            rows.append({"pair": pair, "mode": mode, "curve": curve, "valid_share": round(float(pz.mean()), 4), "status": "OK" if p else "NO_ROUTE",
                         **({"cost_flat_equiv_m": round(c, 3), **metrics(p, z, dx, dy), **deviation(ref, p, dx, dy)} if p else {})})
    sens["dem_pairs"] = rows
    # grade noise between independent stereo pairs on 2 m edges (constant offsets cancel in a grade)
    noise = {}
    for p1, p2 in (("C", "W"), ("C", "DL"), ("W", "DL")):
        z1, z2 = pairs[p1], pairs[p2]
        noise[f"{p1}-{p2}"] = {"east_edge_sigma": round(robust_sigma(np.diff(z1, axis=1) / dx - np.diff(z2, axis=1) / dx), 4),
                               "north_edge_sigma": round(robust_sigma(np.diff(z1, axis=0) / dy - np.diff(z2, axis=0) / dy), 4)}
    sens["grade_noise_between_pairs"] = noise
    sens["grade_noise_note"] = ("sigma of the difference of two independent DTMs; one DTM's own grade noise is about sigma/sqrt(2) "
                                "if the two are independent and equally noisy.")
    (RESULTS / f"sensitivity_{ver}.json").write_bytes(json.dumps(sens, indent=1).encode())
    print(json.dumps({"g6": g6, "nominal": sens["nominal"], "noise": noise}, indent=1))


if __name__ == "__main__":
    main()
