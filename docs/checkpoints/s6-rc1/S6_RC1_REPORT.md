# S6 RC1: ARES-1 mission experience (Mission Control, map-first Planning, B exploration, 3D framing)

| Item | Value |
|---|---|
| Starting point (verified) | `integ/s5-rc` @ `331bbe5`, clean; `s5-rc1` @ `812662d`; `main` @ `2d255d6` |
| S6 branch / worktree | `integ/s6` in `ares-wayfinder-wt-s6` |
| Regional DEM workstream | `feat/regional-dem` in `ares-wayfinder-wt-rdem` (`e254a38` gates, `3cce9e0` bundle `5c4dd158f4cf`), **not merged into S6** |
| Data (unchanged) | ARES-1 catalog `572fba1ce61f`, M0–A `f8de9017164a`, regional basemap `d3d62fc34c56`, terrain features `1c0248bfeda3`, ROI-A bundles |
| Merge to main | not done; needs your approval |

## Stage 1: root causes

| Symptom | Root cause |
|---|---|
| Mission Control was a long database page; a click's answer appeared below the fold | The old Science Atlas overview stacked the map, magnifier, feature panel and destination form vertically. The destination card rendered under the form. |
| Planning terrain was a narrow strip | `.map-frame` took the grid's aspect at full height, `clampView` held the view at the grid's aspect, and nothing was drawn outside the grid. The tall M0–A grid therefore letterboxed in a wide area. Toolbar text, a 210 px profile and a 360 px side panel took further space. |
| B could not be explored | The region selector only offered analysis grids. B had no grid, so its button was simply disabled. |
| Mission choice not shared | There was no mission state: Planning and 3D only knew `region`. |
| 3D terrain used half the viewport | The status panel sat below the canvas (≈ 40 % of the height). The overview pose was tuned for a wide canvas, and there was no whole-grid fit. |
| Layer legend resized the map | The one-line legend sat in a wrapping flex row sized by its content, so toggling a layer could move the map. |

## Stage 2: changes

**New files:**

| File | Purpose |
|---|---|
| `web/src/missions.ts` | Mission scenario text (M0, A, B), readiness, B reasons |
| `web/src/RegionalCanvas.tsx` | Zoom/pan regional CTX map at ground proportions; mission vs feature vs ground clicks; scale bar |
| `web/src/MissionControl.tsx` | Dashboard |
| `web/src/Inspector.tsx` | In-view cards |
| `web/src/BExplore.tsx` | B exploration mode |
| `web/src/RouteConditions.tsx` | What the planner uses and what it does not model |
| `web/e2e/s6.spec.ts` | S6 browser tests |

**Changed files:**
- `store.ts`: shared `mission`, `inspect`, `mapFocus`, `atlasOpen`; `selectMission`, `inspectFeature`, `routeFromDestination`.
- `App.tsx`: scenes; footer for B.
- `panels.tsx`: map-first Workbench, persistent layer bar, collapsible side panel and profile, B button enabled, route conditions.
- `map.tsx`:
  - the view takes the container's aspect, measured with a ResizeObserver;
  - regional CTX context is drawn outside the grid (exact eqc affine), marked as context only;
  - the analysis grid has a dashed outline.
- `TerrainView.tsx`: B notice instead of another region's terrain; aspect-aware overview; "Fit terrain".
- `ScienceAtlas.tsx`: opens directly in the Atlas view.
- `styles.css`.
- `web/e2e/m0a.spec.ts`: adapted to the tabs.

**What the user sees:**
- **Mission Control:**
  - a short ARES-1 introduction;
  - mission tabs M0 / A / B;
  - a large zoomable CTX map with distinct mission circles, F01–F03 diamonds, the ROI-A box and the M0–A grid, plus a ground scale bar.
  - **Every click answers in the inspector at the top of the right column, inside the viewport**:
    - a mission card (objective, readiness, actions);
    - a feature card (F01 "pending review");
    - a destination card with Set as start / Set as goal / Inspect details / Dismiss.
  - Compact mission cards, plus tabs: Destination, Terrain features, Atlas & MEDA, Zoom tool, Data & limits.
  - The map position is kept on dismiss and switch.
- **Shared state:**
  - choosing M0 or A puts Planning and 3D on the M0–A corridor;
  - choosing B puts Planning into **B exploration**: regional imagery, the B waypoint, the F03 anchor, the Sapphire Canyon sampling rover position and the 9 claims;
  - routing and detailed 3D are disabled with reasons, and no other region's route or terrain is shown.
- **Planning:**
  - the map fills the content area, with regional context around the grid;
  - the layer bar sits beside the map;
  - the side panel and profile collapse, and start collapsed under 1280 × 800;
  - a **Route conditions** table:
    - slope and NoData: used;
    - craters: partly, through slope and the cutoff;
    - rocks, **radiation**, dust/weather and illumination: not modelled, with the reason, and no values invented.
- **3D:**
  - on wide screens the canvas takes the full height (controls in a side column), and the overview adapts to the canvas aspect;
  - "Fit terrain" frames the whole grid;
  - ×1 vertical exaggeration remains the default;
  - 2D/3D alignment and ROI-A camera tests are unchanged.

## Stage 3: tests (all on `integ/s6` at the RC commit)

| Suite | Result |
|---|---|
| core | 41/41 |
| web unit | 57/57 |
| M0–A analysis | 8/8 |
| pipeline | 33/33 |
| ARES-1 | 14/14 |
| build | OK |
| Playwright, dev | **21/21** (15 earlier + 6 S6) |
| Playwright, production preview with DNS disabled | **21/21** |
| Performance | 2/2 (M0–A 3D 144 fps; ROI-A HiRISE 140 fps; floor 30) |

**S6 browser tests prove:**
- a map click opens a destination card whose box is inside the viewport, and a marker appears;
- a mission tab opens its card in view;
- B exploration shows reasons, no route, the Sapphire Canyon point and 9 claims, and 3D for B is disabled;
- mission selection persists across scenes;
- ROI-A stays 969.161 m / 1058.299 and M0–A stays 416.426 m / 664.390;
- **layer pixel changes:**
  - hillshade, elevation, slope, steepness and turning ortho off each change the rendered map pixels at a constant map size;
  - NoData changes only the legend, because M0–A has no NoData cells;
- at 1920 × 1080, 1440 × 900 and 1024 × 768:
  - the Mission Control map exceeds 40 % / 40 % / 30 % of the screen;
  - the Planning map exceeds 35 % / 35 % / 20 %;
  - the panel toggle changes the map width;
- 3D: ×1 default, canvas taller than 60 % of the viewport, and "Fit terrain" changes the view.

## Screenshots (this folder)

| File | Shows |
|---|---|
| `s6-01-mission-control.png` | Mission Control |
| `s6-02-inspector-mission.png` | Mission card in view |
| `s6-03-map-click-card.png` | Map click → destination card |
| `s6-04-b-explore.png` | B exploration |
| `s6-05-b-3d-disabled.png` | 3D for B disabled |
| `s6-06-planning-m0a.png` | Map-first M0–A Planning |
| `s6-07-m0a-3d-fit.png` | 3D after "Fit terrain" |
| `s6-08-m0a-3d-default.png` | 3D default view |
| `s6-09-roi-a-legacy.png` | Legacy ROI-A |
| `s6-layout-1920/1440/1024.png` | The three window sizes |

## Stage 4–5: 3D and regional 3D

**Stage 4** is done as listed above.

**Stage 5: evaluation done, integration not done.** On `feat/regional-dem`:
- **Candidate:** the USGS TRN CTX DTM 20 m passed the pre-registered gates for **display-only** regional relief:
  - 100 % valid over lat 18.40–18.52, lon 77.28–77.51;
  - MAD 0.36 m against the JPL CTX DEM (most likely the same source data, so this is agreement, not independence);
  - HiRISE − TRN MAD 2.29 m, with a north–south tilt of about 0.67 m/km.
- **Registration to the imagery:** UNRESOLVED; a 10–20 m north component is plausible.
- **Vertical reference:** UNVERIFIED (the file name and metadata disagree).
- **Bundle:** `5c4dd158f4cf`, 341 × 178 vertices at 40 m, same CRS as the regional image, reproducible.
- **Not merged into S6,** because:
  1. its `terrain.json` adds fields that need a change request;
  2. the regional 3D scene must be labelled display-only, with UNRESOLVED registration and UNVERIFIED datum, and must never offer routing;
  3. it would put the working candidate at risk this close to submission.
- **Staged plan:** see `ares-wayfinder-wt-rdem/analysis/regional_dem/REGIONAL_DEM_REPORT.md`.
  1. CR for the bundle fields.
  2. A "Regional relief (display only)" 3D mode.
  3. Texture from the regional CTX image with UVs computed from map coordinates.
  4. Labels.
  5. Tests.
  6. Keep the local detailed 3D for ROI-A and M0–A only.
  7. Never stretch the 2 m M0–A grid regionally.

## Current scientific limits

- **B:** no validated terrain grid, so no routing and no detailed 3D.
- **Science items:** G1/S-4 DEM registration, vertical datum and the S6 cost curve remain open.
- **F01:** awaiting geology review; F02/F03 literature only.
- **Not modelled:** radiation, dust, temperature and illumination; no data is invented.
- **M0–A:** a candidate corridor between rover positions, not a surveyed path.

## Recommendation

**GO** for s6-rc1 as the submission demo build, after your manual acceptance pass on the production preview.

**NO-GO** for:
- merging to `main` without approval;
- claiming regional 3D, B routing, F01 approval, or any safety, radiation or energy result.

## Addendum, s6-rc2: regional relief 3D integrated (display only, CR-006)

`feat/regional-dem` was merged into `integ/s6` (merge commit, nothing rewritten). Bundle `5c4dd158f4cf` is served from
`web/public/data/regional_dem/` with its own hash-pinned index.

**Loader** (`web/src/regionalRelief.ts`) checks:
- index role, manifest SHA-256 and version, every file hash, and the `terrain.json` hash;
- the display-only role, the same CRS as the regional image, and that the texture is basemap `d3d62fc34c56`.

**View** (`web/src/RegionalRelief.tsx`):
- 341 × 178 mesh through `buildTerrainMesh` / `projToScene` (CR-005 ground scale);
- texture coordinates from map coordinates;
- mission waypoint pillars;
- ×1 by default (×3 optional);
- always-visible labels: display only, ~100 m effective resolution, registration UNRESOLVED, vertical reference UNVERIFIED, no routing/slope/hazard information.

**Entry points:** the Mission Control header; the local 3D controls; the B 3D notice (B's *detailed* 3D stays disabled).

No route is drawn on regional relief, and the 2 m M0–A grid is never stretched regionally. CR text:
`docs/decisions/CR-006-regional-relief-display.md`.

**Fix during integration:** the relief first rendered untextured. Three.js compiles the material's shader once, so a
texture arriving later was never sampled. The material is now rebuilt when the texture loads.

**Tests at s6-rc2:**

| Suite | Result |
|---|---|
| core | 41/41 |
| web unit | 59/59 (+2 relief loader: hashes, tampering, role, wrong basemap, UV range, ground scale) |
| M0–A analysis | 8/8 |
| pipeline | 40/40 (+7 regional DEM) |
| ARES-1 | 14/14 |
| build | OK (19 MB) |
| Playwright, dev | 22/22 (+1 relief: labels, ×1 default, ×3 changes pixels, canvas > 60 % height, no route, B entry) |
| Playwright, DNS-offline preview | 22/22 |
| Performance | 2/2 |

**Screenshot:** `s6-10-regional-relief.png`.
