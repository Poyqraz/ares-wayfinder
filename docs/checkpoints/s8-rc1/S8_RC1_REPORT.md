# s8-rc1: route audit and first-person EVA

Branch `integ/s8`, based on `s7-rc3` (03306cf). No dataset, contract or route-algorithm change; reference routes are
unchanged (ROI-A 969.161 m, M0-A 416.426 m / 664.390). Not merged, not pushed.

## Route audit (full text: docs/audit/S8_ROUTE_AUDIT.md)
- A* equals Dijkstra to floating-point precision on the reference routes and on 360 random pairs: the routes are
  optimal **among 8-connected grid paths** for their stated cost.
- They are **not** the cheapest walkable line: 8 headings cost up to 8.2 % extra length. On ROI-A the straight line is
  valid, 895.6 m, cost 990.3, against the grid optimum 969.2 m, cost 1058.3.
- "No slope gate" versus 24.2 deg was an ambiguous sentence, not a bug: the 24.2 deg rule is a per-step grade cutoff
  on the terrain-aware route (always on); the per-cell slope gate is off; the shortest-distance route has no grade
  limit. The Planning text now says this.
- Turning is free in the model (49 heading changes on the M0-A terrain-aware reference route). Cost is direction
  dependent (664.4 uphill, 303.8 back).
- Modelled: DEM elevation, step grade, distance, NoData. Unvalidated shape only: the Minetti-type curve (Earth,
  unsuited; coefficients still pending source check). Absent: rocks below DEM resolution, radiation, dust, thermal,
  illumination, weather, suit and crew factors.

## Changes
- **Smoothed walking line** (`web/src/walk.ts`): any-angle line derived from the grid route; each straight segment is
  accepted only on valid terrain, with no sampled step over 24.2 deg and no rise in model cost; metrics recomputed.
  Shown as a white dotted line in Planning with its own table. Labelled "re-checked, not a new optimum". The grid route
  stays the reference everywhere else.
- **First-person EVA view** (`web/src/EvaView3D.tsx`): camera on the DEM mesh of the 3D scene at 1.7 m eye height,
  true vertical scale, looking along the route ahead; real ortho texture; chevrons and marker posts placed on the
  surface. No rocks, sky model, lighting or weather. Flat tilted map kept as a labelled fallback ("Flat map view", and
  automatically if WebGL fails).
- **3D Terrain to EVA**: "Start EVA walk" starts the first-person walk on the selected route at once. The flyover
  remains as the separate optional overview. One shared playhead drives camera, mini-map, profile and readouts.
  "Back to 3D overview" and "Back to Planning" keep region, routes and endpoints.
- **3D route drawing**: screen-width lines with a dark casing; shortest distance cyan dashed, terrain-aware orange
  solid, selected one wider (same code as the 2D map). Route markers are clickable labels in 3D and a button list with
  the same card as Planning.
- Playback is frame-timed (about 12 m of route per second, whole route in 20 to 45 s; a viewing speed).

## Verification
- Browser journey (Playwright, Chromium): Mission Control, objective A, Planning, 3D Terrain, marker selection,
  Start EVA, pause, checkpoints at 2/35/60/80 %, policy switch, playback to the destination, back to 3D, back to
  Planning with 416.426 m / 664.390 intact. Same on ROI-A (969.161 m). Bright Angel: no Start EVA, no walk.
- At every checkpoint: camera distance equals the readout, eye at least 1.69 m above the drawn surface, mini-map dot
  equals the walker position. Unit tests sample 600 points per route on both grids and both policies.
- Frame rate, real Chrome 1440 x 900 on NVIDIA RTX 4060 Laptop GPU (D3D11): ROI-A 128 fps, M0-A 127 fps.
  Headless software renderer used by the test suite: 2 to 4 fps (not representative).
- Tests: core 41/41, web unit 69/69, build OK, Playwright dev 29/29, production preview offline 29/29, perf 3/3,
  pipeline 43/43, ARES-1 14/14, M0-A analysis 8/8.

## Before / after
- 3D routes: before `docs/checkpoints/s7-rc3/rc3-3d-default.png`, after `s8-02-3d-routes.png`, `s8-03-3d-marker.png`.
- EVA: before `docs/checkpoints/s7-rc3/rc3-eva-walking.png` (tilted map), after `s8-04` to `s8-08`.

## Limitations
- Close to the walker the ground is blurred: 1 m (HiRISE) and 5 m (CTX) pixels seen from 1.7 m. ROI-A is a 20 m DEM
  with CTX imagery, so its first-person view is smooth and featureless; the HiRISE display drape of ROI-A is not used
  in the EVA view.
- The EVA walk follows the grid route, so the path still has 45 deg steps; the gaze is eased to hide most of it.
- The smoothed line is not searched by the planner and is not used for walking or regression values.
- Sky is a flat colour; no sun, shadows or atmosphere.
- No machine without a GPU was measured; software rendering is far too slow for the first-person view.
- Physical network-off reload still needs a person.
- Carried over: F01 geology review, F02/F03, DEM registration and vertical datum, Minetti coefficients (S6),
  CR-005/CR-006 approval, no terrain for B.

## Recommendation
GO for human acceptance of s8-rc1 as a demo candidate. NO-GO for describing the routes as optimal walking paths or as
safe: they are grid-optimal under an unvalidated cost curve.
