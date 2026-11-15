"""T06: independent reference router (SciPy Dijkstra) and golden fixtures for the TS A* parity test.

Written separately from core/src/route.ts from contracts/CONTRACT.md §3: explicit edge list,
power-form cost curves, scipy.sparse.csgraph.dijkstra. Shares no code with the TS engine.

Usage: uv run python oracle.py
Output: core/test/golden/oracle_random.json, core/test/golden/oracle_roi_a.json
"""
import json
import math
from pathlib import Path

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra

REPO = Path(__file__).resolve().parent.parent
GOLDEN = REPO / "core" / "test" / "golden"


def multiplier(curve, g):
    if curve == "minetti":  # Minetti et al. 2002 walking polynomial, normalised to flat = 1 (pending S6)
        return (280.5 * g**5 - 58.7 * g**4 - 76.8 * g**3 + 51.9 * g**2 + 19.6 * g + 2.5) / 2.5
    if curve == "tobler":  # Tobler 1993: v(0)/v(g) with v = 6 exp(-3.5 |g + 0.05|) (pending S6)
        return math.exp(-3.5 * abs(0.05)) / math.exp(-3.5 * abs(g + 0.05))
    raise ValueError(curve)


def route_cost(dem, validity, slope, dx, dy, start, goal, mode, curve, g_max, gate):
    """Return the optimal cost from start to goal (cells as (row, col)), or None if unreachable."""
    ny, nx = dem.shape

    def ok(r, c):
        if validity[r, c] not in (0, 3):
            return False
        return gate is None or (not math.isnan(slope[r, c]) and slope[r, c] <= gate)

    src, dst, w = [], [], []
    for r in range(ny):
        for c in range(nx):
            if not ok(r, c):
                continue
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    if (dr, dc) == (0, 0):
                        continue
                    rr, cc = r + dr, c + dc
                    if not (0 <= rr < ny and 0 <= cc < nx) or not ok(rr, cc):
                        continue
                    if dr != 0 and dc != 0 and not (ok(r + dr, c) and ok(r, c + dc)):
                        continue
                    length = math.sqrt(dx * dx + dy * dy) if dr and dc else (dy if dr else dx)
                    cost = length
                    if mode == "terrain":
                        g = (float(dem[rr, cc]) - float(dem[r, c])) / length
                        if abs(g) > g_max:
                            continue
                        cost = length * multiplier(curve, g)
                    src.append(r * nx + c)
                    dst.append(rr * nx + cc)
                    w.append(cost)
    s, t = start[0] * nx + start[1], goal[0] * nx + goal[1]
    if s == t:
        return 0.0 if ok(*start) else None
    m = coo_matrix((w, (src, dst)), shape=(nx * ny, nx * ny)).tocsr()
    d = dijkstra(m, directed=True, indices=s)[t]
    return None if math.isinf(d) else float(d)


MODES = [("distance", "minetti", None), ("terrain", "minetti", None), ("terrain", "tobler", None), ("terrain", "minetti", 6.0)]


def random_cases(n=150, seed=7):
    rng = np.random.default_rng(seed)
    cases = []
    for k in range(n):
        ny, nx = int(rng.integers(5, 10)), int(rng.integers(5, 12))
        dem = rng.random((ny, nx)).astype(np.float32) * 12
        validity = np.where(rng.random((ny, nx)) < 0.15, 1, np.where(rng.random((ny, nx)) < 0.1, 3, 0)).astype(np.uint8)
        slope = np.where(validity == 3, np.nan, rng.random((ny, nx)) * 10).astype(np.float32)
        free = np.argwhere(validity != 1)
        start, goal = (tuple(int(v) for v in free[rng.integers(len(free))]) for _ in range(2))
        dx, dy = 20.003428, 20.0
        for mode, curve, gate in MODES:
            if gate is not None and not (slope[start] <= gate and slope[goal] <= gate):
                continue  # endpoint policy errors are covered by TS unit tests
            cost = route_cost(dem, validity, slope, dx, dy, start, goal, mode, curve, 0.45, gate)
            cases.append({
                "id": f"r{k}-{mode}-{curve}-{gate}", "nx": nx, "ny": ny, "dx": dx, "dy": dy,
                "dem": [float(v) for v in dem.ravel()],
                "validity": [int(v) for v in validity.ravel()],
                "slope": [None if math.isnan(v) else float(v) for v in slope.ravel()],
                "start": start, "goal": goal, "mode": mode, "curve": curve, "g_max": 0.45, "gate": gate,
                "expected_cost": cost,
            })
    return cases


def roi_cases(roi_id="roi_a"):
    index = json.loads((REPO / "web" / "public" / "data" / "index.json").read_text())[roi_id]
    b = REPO / "web" / "public" / index["path"]
    meta = json.loads((b / "terrain.json").read_text())
    nx, ny = meta["nx"], meta["ny"]
    dem = np.fromfile(b / "dem.f32.bin", dtype="<f4").reshape(ny, nx)
    slope = np.fromfile(b / "slope_deg.f32.bin", dtype="<f4").reshape(ny, nx)
    validity = np.fromfile(b / "validity.u8.bin", dtype=np.uint8).reshape(ny, nx)
    k = math.cos(math.radians(meta["lat_ts_deg"]))
    cells = {}
    for p in json.loads((b / "pois.json").read_text()):
        x = math.radians(p["geo"]["lon"]) * meta["radius_m"] * k
        y = math.radians(p["geo"]["lat"]) * meta["radius_m"]
        cells[p["id"]] = (math.floor((meta["y0"] - y) / meta["dy_proj"]), math.floor((x - meta["x0"]) / meta["dx_proj"]))
    pairs = [("landing", "roubion"), ("landing", "rochette"), ("sid", "rochette"), ("roubion", "landing")]
    out = []
    for a, z in pairs:
        for mode, curve, gate in MODES:
            cost = route_cost(dem, validity, slope, meta["dx_ground_m"], meta["dy_ground_m"], cells[a], cells[z],
                              mode, curve, 0.45, gate)
            out.append({"id": f"{a}->{z}-{mode}-{curve}-{gate}", "start": cells[a], "goal": cells[z],
                        "mode": mode, "curve": curve, "g_max": 0.45, "gate": gate, "expected_cost": cost})
    return {"roi_id": roi_id, "dataset_version": meta["dataset_version"], "poi_cells": cells, "cases": out}


if __name__ == "__main__":
    GOLDEN.mkdir(parents=True, exist_ok=True)
    rnd = random_cases()
    (GOLDEN / "oracle_random.json").write_text(json.dumps({"generator": "pipeline/oracle.py seed 7", "cases": rnd}))
    roi = roi_cases()
    (GOLDEN / "oracle_roi_a.json").write_text(json.dumps(roi, indent=1))
    reachable = sum(c["expected_cost"] is not None for c in rnd)
    print(f"random: {len(rnd)} cases ({reachable} reachable); roi_a: {len(roi['cases'])} cases, poi cells {roi['poi_cells']}")
