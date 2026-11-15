# CR-005: ground-true east-west display scale (SCENE and 2D map)

**Defect (S4 acceptance review, 2026-11-15).** On the M0–A grid the 2D map and the 3D scene were about 5.4 % too wide
east-west.

**Root cause.** Both displays used projected metres as display metres:
- 2D: `map.tsx` `gridView()` set the SVG viewBox width to `nx·dx_proj`;
- 3D: `core/coords.projToScene()` set `x = E − E_c`.

On an equirectangular grid with `lat_ts = 0`, one projected metre east-west is `1/cos(lat)` ground metres
(1/cos 18.456° = 1.0542). ROI-A uses `lat_ts = 18.4663`, so its factor is only 1.00006, which is why the defect never
showed there. Distances, costs and profiles always used `dx_ground_m` and were correct.

**Change.**
- `core/coords.groundScaleX(meta)` returns `k_x = dx_ground_m/dx_proj`.
  - `projToScene`: `x = (E − E_c)·k_x`; `sceneToProj` inverts it exactly.
  - shortcut: `k_x` is 1 when it differs from 1 by ≤ 0.1 %, so ROI-A scene coordinates stay bit-identical.
- `web/src/mapGeometry.ts`: the SVG x axis is `x0 + (E − x0)·k_x`.
  - The viewBox width is `nx·dx_proj·k_x`, giving the ground aspect.
  - Clicks are converted back with the exact inverse.
  - The scale bar uses ground metres per SVG unit.
- 3D camera framing uses the same ground width.

**Unchanged:**
- PROJ, ROI_GRID and `cellCenter`/`projToCell`;
- the route engine, route cells and vertices;
- lengths, profiles and model costs: M0–A 416.426 m / 664.390, ROI-A 969.161 m / 1058.299;
- the texture UVs, because the mesh still has one vertex per cell.

**Tests:**
- `core/test/sceneScale.test.ts`: E-W and N-S 100 m control distances, the round trip, and ROI-A bit-identical;
- `web/test/s5.test.ts`:
  - 2D aspect equals the ground aspect;
  - E-W/N-S map distances;
  - the click↔ground round trip lands in the same DEM cell;
  - the 3D mesh spans the ground width;
- `web/e2e/m0a.spec.ts`:
  - the rendered map aspect is within 1 % of ground;
  - the route start meets the rover-position marker within 4 px.

**Status:** implemented in `integ/s5-rc`. The contract text is updated in `contracts/CONTRACT.md` §1 and its change log.
`CONTRACT_VERSION` stays 1.0.0, because bundles are unaffected.
