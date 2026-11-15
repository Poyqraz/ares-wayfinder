# S8 route audit

Scope: `core/src/route.ts` (algorithm `astar-1.0.0`, unchanged in S8) on the two routable bundles,
M0-A `f8de9017164a` (HiRISE 2 m) and ROI-A `7ec72147790e` (CTX 20 m). Numbers come from
`analysis/s8/route_audit.ts` (results in `analysis/s8/results/route_audit.json`) and `web/test/s8.test.ts`.
Nothing here changes a dataset, a contract or a reference route.

## 1. What "optimal" means here

Three different statements, only the first of which the software can make:

| Claim | Status |
|---|---|
| **Mathematical optimality**: least cost among all 8-connected cell paths on the grid, for the stated cost | **Holds.** A* equals Dijkstra to floating-point precision: reference routes differ by 0 to 6e-14 m; 60 random pairs on M0-A and 300 on ROI-A differ by at most 2e-12 m (distance) and 0 (terrain). Re-scoring each returned path edge by edge reproduces its cost exactly. The independent Python oracle (SciPy Dijkstra, separate edge builder) agreed to 1.4e-16 in the M0-A work. |
| **Model-cost optimality**: least cost of any walkable line on the DEM | **Does not hold, by a known bounded amount.** Movement is restricted to 8 headings, so a grid path is up to 8.2 % longer than the straight line. On ROI-A the straight line between the reference endpoints is valid terrain, 895.6 m long and costs 990.3 flat-equivalent m; the "optimal" grid route is 969.2 m and costs 1058.3. The grid route is optimal on its graph, not on the surface. |
| **Suitability for a human Mars EVA** | **Not established and not claimed.** See section 3. |

## 2. What the planner actually does

- **Graph**: 8 neighbours per cell; a diagonal step needs both orthogonal neighbours routable (no corner cutting). NoData cells are never entered or filled.
- **Shortest-distance route**: cost = horizontal length. No grade limit at all. It can cross steps steeper than 24.2 deg; when it does, the comparison reports `BASELINE_NOT_ALLOWED`.
- **Terrain-aware route**: cost = sum of step length x m(grade), m(0) = 1, Minetti-shaped polynomial; any step with |grade| > 0.45 (24.2 deg) is removed from the graph.
- **"No slope gate" vs the 24.2 deg limit**: these were two different things described ambiguously. The 24.2 deg rule is a per-step *grade* cutoff and is always on for the terrain-aware route. The optional per-*cell* slope gate (`cell_slope_gate_deg`) is off. The Planning text now says exactly that.
- **Direction matters**: the cost curve is asymmetric (downhill is cheaper), so A to B and B to A differ: M0-A reference 664.4 uphill vs 303.8 back; ROI-A 1058.3 vs 893.7. A return leg is a separate search.
- **Turning and curvature are not in the cost.** The terrain-aware M0-A reference route has 49 heading changes of 45 deg; they are free in the model. That is why routes look jagged.
- **Surface length, ascent and descent** are reported, not optimised (ascent enters only through the grade multiplier).

## 3. Movement model and environment: what is and is not represented

Represented (from data in the build):
- DEM elevation, step grade, horizontal and surface distance, ascent, descent.
- NoData / coverage as hard exclusion.
- The 24.2 deg step-grade cutoff (terrain-aware route only), an experimental algorithm parameter.

Represented only as an unvalidated shape:
- The cost curve. Its coefficients are a Minetti et al. 2002 walking polynomial still marked "pending primary-source check (S6)" in the code. It is from unsuited treadmill walking on Earth: no suit mass or stiffness, no 0.38 g gait, no regolith. Flat-equivalent metres are a relative index, not energy, time or consumables.

Absent (no gridded data exists in the build; none is simulated):
- Rocks and obstacles below DEM resolution (2 m and 20 m postings; effective resolution is coarser).
- Radiation, dust, wind, temperature, illumination and shadow, communications line of sight, trafficability of the regolith.
- Crew factors: suit, life-support margins, fatigue, heart rate.
- MEDA appears only as one historical rover-local pressure record (sol 516, 2022). It is not used in routing.

Geospatial uncertainty that the route inherits:
- DEM to image registration unresolved on ROI-A (G1/S-4); vertical datum unverified on both grids.
- In the M0-A work, swapping independent HiRISE stereo pairs moved the terrain-aware line by up to about 39 m for less than 0.5 % cost change: the cost surface is flat near the optimum, so the exact line is not significant at that scale.

## 4. Why routes are jagged, and what was done

Cause: search connectivity (8 headings) combined with a nearly flat cost surface, on which many zig-zag paths cost the same. It is not a drawing artefact: the drawn polyline is the cell path.

Change in S8 (`web/src/walk.ts`, `smoothRoute`): an **any-angle line** is derived from each grid route by replacing runs of grid steps with straight segments. A segment is accepted only if
1. every sample (half-cell spacing) lies on routable terrain, on the same triangles the 3D mesh draws;
2. for the terrain-aware route, no sampled step exceeds 24.2 deg; and
3. its model cost, recomputed on those samples with the same curve, is not higher than the grid steps it replaces.

All metrics are recomputed for the new geometry. Results:

| Route | Grid length / cost | Smoothed length / cost | Heading changes |
|---|---|---|---|
| M0-A reference, terrain-aware | 416.4 m / 664.4 | 387.5 m / 645.1 | 49 to 0 |
| M0-A reference, distance | 416.4 m | 387.5 m | 6 to 0 |
| M0-A base to A, terrain-aware | 279.1 m / 514.0 | 274.8 m / 513.8 | 5 to 2 |
| ROI-A reference, terrain-aware | 969.2 m / 1058.3 | 895.6 m / 990.3 | 8 to 0 |
| ROI-A reference, distance | 969.2 m | 895.6 m | 3 to 0 |

Status of that line: **re-checked, never worse than the grid route under the same curve, not a new optimum** (the planner did not search it; the shortcut search is greedy). On three of the four reference cases it is simply the straight line between the endpoints, which is valid terrain there. It is drawn as a white dotted line beside the grid route in Planning with its own numbers. The grid route remains the reference for regression values, the 3D scene, route markers and the EVA walk. Tests cover a NoData wall (the line bends around it) and a cliff above the grade limit.

## 5. Realistic next steps (not done in S8)

1. Replace the 8-connected search with an any-angle search (Theta* or 16/32 headings) so the searched optimum itself loses the grid detour. This changes reference numbers and needs a contract change request.
2. Add a turn cost, or accept the any-angle line as the walked path once item 1 exists.
3. Close S6: verify the Minetti coefficients against the primary source, or switch to the Tobler form already in the code.
4. Report cost sensitivity to DEM noise as a corridor width rather than a single line.
5. Illumination from ephemerides and the DEM is the one environmental layer that could be computed from data already held; radiation, dust and thermal layers need sources the project does not have.
