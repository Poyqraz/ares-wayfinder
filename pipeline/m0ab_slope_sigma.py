"""Does the 4 degree slope margin used on the M0-A grid also hold on the wider M0-A-B grid?

Same measure as pipeline/traversability_check.py (S9): the robust 1-sigma difference of Horn slope between the three
independent HiRISE stereo models (C, W, DL), on ground steeper than 15 degrees. Reported for the whole wider box and
for the part that is new (outside the frozen M0-A grid). Read-only; needs pipeline/cache/m0ab_pairs.npz (written by
ARES_AREA=m0ab m0a_routes.py). Run from pipeline/: uv run python m0ab_slope_sigma.py
"""
import json
from pathlib import Path

import numpy as np

from traversability_check import DEG, horn, robust_sigma

ROOT = Path(__file__).resolve().parent.parent


def main():
    idx = json.loads((ROOT / "analysis" / "m0ab" / "bundle" / "index.json").read_bytes())["m0ab"]
    meta = json.loads((ROOT / idx["path"] / "terrain.json").read_bytes())
    nx, ny, dx, dy = meta["nx"], meta["ny"], meta["dx_ground_m"], meta["dy_ground_m"]
    sup = meta["superset_of"]
    old = json.loads((ROOT / "analysis" / "m0a" / "bundle" / sup["dataset_version"] / "terrain.json").read_bytes())
    new = np.ones((ny, nx), dtype=bool)
    new[sup["row_offset"]:sup["row_offset"] + old["ny"], sup["col_offset"]:sup["col_offset"] + old["nx"]] = False
    pairs = dict(np.load(Path(__file__).parent / "cache" / "m0ab_pairs.npz"))
    slope = {k: np.arctan(np.hypot(*horn(v, dx, dy))) * DEG for k, v in pairs.items()}
    names = sorted(slope)

    def stats(mask):
        out = {}
        for i, a in enumerate(names):
            for b in names[i + 1:]:
                d, steep = slope[a] - slope[b], (slope[a] > 15) | (slope[b] > 15)
                out[f"{a}-{b}"] = {"robust_sigma": round(robust_sigma(d[mask]), 2), "robust_sigma_where_slope_over_15": round(robust_sigma(d[mask & steep]), 2),
                                   "cells_over_15": int((mask & steep & np.isfinite(d)).sum())}
        return out

    result = {"generated_by": "pipeline/m0ab_slope_sigma.py", "dataset_version": meta["dataset_version"], "stereo_pairs": names,
              "whole_box": stats(np.ones((ny, nx), dtype=bool)), "new_part_only": stats(new), "frozen_part_only": stats(~new),
              "margin_used_by_the_app_deg": 4}
    worst = max(v["robust_sigma_where_slope_over_15"] for v in result["new_part_only"].values())
    best = min(v["robust_sigma_where_slope_over_15"] for v in result["new_part_only"].values())
    result["new_part_range_deg"] = [best, worst]
    out = ROOT / "analysis" / "m0ab" / "results" / "slope_sigma.json"
    out.write_text(json.dumps(result, indent=1) + "\n")
    print(json.dumps(result, indent=1))


if __name__ == "__main__":
    main()
