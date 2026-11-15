"""S9 independent check of the traversability audit (numpy, written separately from the TypeScript in web/src/traverse.ts).

Reads the route cells that analysis/s9/traversability_audit.ts wrote, then from the raw M0-A DEM:
  1. recomputes step grade, Horn slope, cross-slope and 3x3 relief and compares them with the TypeScript numbers;
  2. repeats the slope measurements on the three independent HiRISE stereo pairs (C, W, DL) of the same box;
  3. measures slope at a coarser scale (4 m cells) and in a corridor around the route.
Writes analysis/s9/results/stereo_check.json. Read-only on every dataset. Run: uv run python traversability_check.py
"""
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "analysis" / "s9" / "results"
DEG = 180 / np.pi


def horn(z, dx, dy):
    """East and north gradient (rise per ground metre) with the Horn 3x3 kernel; NaN on the outer ring."""
    ge = np.full(z.shape, np.nan)
    gn = np.full(z.shape, np.nan)
    nw, n, ne = z[:-2, :-2], z[:-2, 1:-1], z[:-2, 2:]
    w, e = z[1:-1, :-2], z[1:-1, 2:]
    sw, s, se = z[2:, :-2], z[2:, 1:-1], z[2:, 2:]
    ge[1:-1, 1:-1] = ((ne + 2 * e + se) - (nw + 2 * w + sw)) / (8 * dx)
    gn[1:-1, 1:-1] = ((nw + 2 * n + ne) - (sw + 2 * s + se)) / (8 * dy)  # row 0 is north
    return ge, gn


def along(z, cells, dx, dy):
    """Per-step measurements of a cell path on DEM z."""
    ge, gn = horn(z, dx, dy)
    slope = np.arctan(np.hypot(ge, gn)) * DEG
    rows = []
    for (r0, c0), (r1, c1) in zip(cells[:-1], cells[1:]):
        te, tn = (c1 - c0) * dx, (r0 - r1) * dy
        L = float(np.hypot(te, tn))
        g_e, g_n = np.nanmean([ge[r0, c0], ge[r1, c1]]), np.nanmean([gn[r0, c0], gn[r1, c1]])
        win = z[max(0, r1 - 1):r1 + 2, max(0, c1 - 1):c1 + 2]
        rows.append({
            "grade_deg": float(np.arctan((z[r1, c1] - z[r0, c0]) / L) * DEG),
            "cell_slope_deg": float(np.nanmax([slope[r0, c0], slope[r1, c1]])),
            "cross_slope_deg": float(np.arctan(abs((g_e * -tn + g_n * te) / L)) * DEG),
            "relief_m": float(np.nanmax(win) - np.nanmin(win)),
        })
    return rows, slope


def robust_sigma(d):
    d = d[np.isfinite(d)]
    return float(1.4826 * np.median(np.abs(d - np.median(d))))


def main():
    audit = json.loads((OUT / "traversability.json").read_text())
    ver = "f8de9017164a"
    base = ROOT / "web" / "public" / "data" / "m0a" / ver
    meta = json.loads((base / "terrain.json").read_text())
    nx, ny, dx, dy = meta["nx"], meta["ny"], meta["dx_ground_m"], meta["dy_ground_m"]
    dem = np.fromfile(base / "dem.f32.bin", dtype="<f4").reshape(ny, nx).astype(float)
    slope_raster = np.fromfile(base / "slope_deg.f32.bin", dtype="<f4").reshape(ny, nx).astype(float)
    cache = next((p for p in [ROOT / "pipeline" / "cache" / "m0a_pairs.npz", ROOT.parent / "ares-wayfinder-wt-m0a" / "pipeline" / "cache" / "m0a_pairs.npz"] if p.exists()), None)
    pairs = dict(np.load(cache)) if cache else {}
    out = {"generated_by": "pipeline/traversability_check.py", "dataset_version": ver, "stereo_pairs": sorted(pairs), "routes": {}}

    # how much the terrain slope itself differs between independent stereo models of the same ground
    pslope = {k: np.arctan(np.hypot(*horn(v, dx, dy))) * DEG for k, v in pairs.items()}
    names = sorted(pslope)
    out["slope_difference_between_pairs_deg"] = {
        f"{a}-{b}": {"robust_sigma": round(robust_sigma(pslope[a] - pslope[b]), 2), "p95_abs": round(float(np.nanpercentile(np.abs(pslope[a] - pslope[b]), 95)), 2),
                     "robust_sigma_where_slope_over_15": round(robust_sigma((pslope[a] - pslope[b])[(pslope[a] > 15) | (pslope[b] > 15)]), 2)}
        for i, a in enumerate(names) for b in names[i + 1:]}
    if "C" in pairs:
        out["bundle_minus_pair_C_m"] = {"median": round(float(np.nanmedian(dem - pairs["C"])), 3), "robust_sigma": round(robust_sigma(dem - pairs["C"]), 3)}

    # the same slope at a coarser scale: 2x2 block mean to 4 m cells, Horn on that (about an 8 m baseline)
    z4 = dem[: ny // 2 * 2, : nx // 2 * 2].reshape(ny // 2, 2, nx // 2, 2).mean(axis=(1, 3))
    slope4 = np.arctan(np.hypot(*horn(z4, dx * 2, dy * 2))) * DEG

    rr, cc = np.mgrid[0:ny, 0:nx]
    for rid in ("m0a_reference", "m0a_base_to_a"):
        route = audit["routes"][rid]
        res = {"name": route["name"], "by_gate": []}
        for g in route["by_gate"]:
            if g["status"] != "OK":
                res["by_gate"].append({"gate_deg": g["gate_deg"], "clearance": g["clearance"], "status": g["status"]})
                continue
            cells = [tuple(c) for c in g["cells"]]
            rows, _ = along(dem, cells, dx, dy)
            mx = lambda key, rs=rows: float(np.nanmax(np.abs([r[key] for r in rs])))
            # slope from the bundle raster for the cell-slope comparison (it had a halo at the edges; identical inside)
            cell_raster = max(float(np.maximum(slope_raster[a], slope_raster[b])) for a, b in zip(cells[:-1], cells[1:]))
            dist = np.full((ny, nx), np.inf)  # ground distance of every cell to the route
            for r, c in cells:
                dist = np.minimum(dist, np.hypot((cc - c) * dx, (rr - r) * dy))
            item = {
                "gate_deg": g["gate_deg"], "clearance": g["clearance"], "status": "OK", "steps": len(rows),
                "python": {"max_step_grade_deg": round(mx("grade_deg"), 2), "max_cell_slope_deg": round(cell_raster, 2), "max_cross_slope_deg": round(mx("cross_slope_deg"), 2), "max_relief_3x3_m": round(mx("relief_m"), 2)},
                "typescript": {k: g[k] for k in ("max_step_grade_deg", "max_cell_slope_deg", "max_cross_slope_deg", "max_relief_3x3_m")},
                "corridor_max_slope_deg": {f"within_{w}m": round(float(np.nanmax(slope_raster[dist <= w])), 1) for w in (2, 5, 10)},
                "nearest_ground_steeper_than_m": {f"{t}deg": round(float(dist[slope_raster > t].min()), 1) for t in (25, 30)},
                "slope_at_4m_cells_max_deg": round(float(np.nanmax([slope4[min(r // 2, slope4.shape[0] - 1), min(c // 2, slope4.shape[1] - 1)] for r, c in cells])), 1),
                "per_stereo_pair": {},
            }
            item["agree"] = all(abs(item["python"][k] - item["typescript"][k]) < 0.02 for k in item["python"])
            for name, z in pairs.items():
                prow, _ = along(z, cells, dx, dy)
                item["per_stereo_pair"][name] = {
                    "max_step_grade_deg": round(float(np.nanmax(np.abs([r["grade_deg"] for r in prow]))), 1),
                    "max_cell_slope_deg": round(float(np.nanmax([r["cell_slope_deg"] for r in prow])), 1),
                    "max_cross_slope_deg": round(float(np.nanmax([r["cross_slope_deg"] for r in prow])), 1),
                    "metres_steeper_than_20deg": round(float(sum(np.hypot((b[1] - a[1]) * dx, (a[0] - b[0]) * dy) for (a, b), r in zip(zip(cells[:-1], cells[1:]), prow) if r["cell_slope_deg"] > 20)), 1),
                }
            if pairs:
                # cells of the route where the three models disagree about being steeper than the gate that was applied (20 deg if none)
                thr = g["gate_deg"] or 20
                votes = np.array([[ps_[r, c] > thr for r, c in cells] for ps_ in pslope.values()])
                spread = np.array([[ps_[r, c] for r, c in cells] for ps_ in pslope.values()])
                item["stereo_disagreement"] = {"threshold_deg": thr, "cells_all_models_below": int((votes.sum(0) == 0).sum()), "cells_models_disagree": int(((votes.sum(0) > 0) & (votes.sum(0) < len(pslope))).sum()),
                                               "cells_all_models_above": int((votes.sum(0) == len(pslope)).sum()), "largest_slope_spread_deg": round(float(np.nanmax(spread.max(0) - spread.min(0))), 1)}
            res["by_gate"].append(item)
        out["routes"][rid] = res
    (OUT / "stereo_check.json").write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
