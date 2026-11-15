# Provisional engineering demo route — Rochette/Montdenier → Landing (ROI-A)

Status: **provisional engineering demo route, not a final scientific waypoint approval** (technical lead, 2026-11-14).
Bundle `fc22a0c8a91f`. Raw output: `demo_route_raw.txt` (`core/scripts/demo_route.ts`).

## Points

| Point | Role | Coordinates | Verification |
|---|---|---|---|
| Rochette / Montdenier (Máaz) | Crater-floor **igneous** rock sampling target (Máaz formation); not a delta sedimentary target | 18.43074 N, 77.44437 E → cell (63, 24) | **UNVERIFIED** (S2 open) |
| Octavia E. Butler Landing | Historical Perseverance landing site, used as a **hypothetical mission reference point**; not a verified human habitat site | 18.44463 N, 77.45088 E → cell (22, 42) | **UNVERIFIED** (S2 open) |

## Numbers (g_max 0.45, no slope gate)

| Quantity | Distance route | Terrain route |
|---|---|---|
| Horizontal length (m) | 969.161 | 969.161 — equal (difference 5.7e-13 m, float noise) |
| Surface length (m) | 970.239 | 969.326 |
| Ascent / descent (m) | 22.80 / 12.29 | 12.73 / 2.21 |
| Model cost, Minetti (flat-equivalent m; both routes scored with the same model) | 1093.229 | **1058.299** → LOWER by 34.930 |
| Model cost, Tobler (same) | 1028.229 | **1008.018** → LOWER by 20.211 |

`compareToBaseline` scores the distance route with the terrain model and classifies the result with a
relative tolerance of 1e-9: EQUAL, LOWER, or BASELINE_NOT_ALLOWED. HIGHER would violate optimality and throws.
Tests (`core/test/compare.test.ts`) cover all three outcomes and confirm no HIGHER case in 300 random grids.

## How to explain it (binding wording)

- "Both routes are the same physical length: 969 m."
- "Many paths share that shortest length. The distance planner returns one of them; the terrain-aware
  planner returns the one with the lowest **model** cost. Under the Minetti-shaped model that is 34.9
  flat-equivalent metres lower (3.2 %), mostly because it avoids ~10 m of extra up-and-down."
- "Model cost is not distance, energy, time or safety. The curve comes from Earth, unsuited treadmill
  walking (Minetti et al. 2002) and is not validated for suited Mars EVA."
- Do **not** say: safer, faster, saves energy, recommended for astronauts, or quote the 34.9 as metres walked.
- The baseline's ascent depends on an arbitrary tie-break among equal-length paths, so the ascent
  difference must not be headlined as a saving.
