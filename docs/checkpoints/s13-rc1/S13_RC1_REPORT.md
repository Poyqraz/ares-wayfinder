# s13-rc1: Conservative Terrain route, environmental context layers, EVA scenario storm alert

Branch `integ/s13`, base and rollback checkpoint `s12-rc1` (964ffeb). Not merged, not pushed.
No dataset, catalog, bundle, contract file or core planner change. The frozen references are unchanged and re-tested:
ROI-A 969.161 m / 1093.229 / 1058.299 flat-equivalent m (LOWER), M0-A 416.426 m / 664.390.

This is a demonstration of transparent mission planning on real NASA terrain data. It is not a certified astronaut
safety planner, and nothing in it claims to be.

## 1. Third route strategy: Conservative Terrain (`web/src/conservative.ts`)

A separate module with its own search (Dijkstra). `core/src/route.ts` is not touched, so the two existing strategies
cannot change. It is called "Conservative Terrain", never "safest".

**Objective.** `step cost = L x m(g) x (1 + 4 x p)`
- `L`, `m(g)`: the same step length and Minetti-type grade factor as the terrain-aware route.
- `s`: the steepest terrain slope (Horn 3x3) in the 3x3 cells around the step's cell, so steep ground *next to* the
  path counts, not only under it. A cell's terrain slope bounds the slope across any path through it, so this also
  limits cross-slope.
- `p = clamp((s + sigma - 5 deg) / (25 deg - 5 deg), 0, 1)^2`. Ground under 5 deg costs nothing extra; the cost rises
  smoothly to five times the walking cost at the gate, which discourages sharp transitions onto steep ground.
- `sigma`: DEM uncertainty. On M0-A it is 4 deg, the disagreement between independent HiRISE stereo models found in the
  S9 audit, added to every slope before it is judged. On ROI-A it is 0 because no such figure exists for the CTX
  grid, and the route says so.

**Hard rules (never relaxed).** Valid terrain only; no corner cutting; step grade at most 24.2 deg (as before);
neighbourhood slope at most 25 deg for every cell, both endpoints included. If an endpoint fails, or gentle ground
does not connect the points, the result is `ENDPOINT_BLOCKED_BY_POLICY` or `NO_ROUTE` with the reason in words and
"Nothing was relaxed". No route is drawn.

**What it is not.** 25 deg, 5 deg and the weight 4 are experimental parameters, not safety limits. Weather, dust and
radiation do not enter the cost: there is no spatial data for them, so they are not hidden penalties either.

**Distance is not inflated.** The length is whatever the objective gives. Over 200 random M0-A pairs the median
extra length against the terrain-aware route is 1.1 % (largest 70.3 %, one pair around a steep wall).

### Results (`analysis/s13/conservative_audit.ts` -> `analysis/s13/results/conservative.json`)

| Reference pair | Strategy | Length | Walking cost | Steepest step | Steepest ground | On ground > 15 deg |
|---|---|---|---|---|---|---|
| M0-A (HiRISE 2 m) | Shortest | 416.426 m | 416.426 | 22.0 deg | 23.4 deg | 28 m |
| | Terrain-aware | 416.426 m | 664.390 | 18.2 deg | 19.9 deg | 33 m |
| | **Conservative** | **453.513 m** | **695.372** | **14.4 deg** | **18.1 deg** | **9 m** |
| ROI-A (CTX 20 m) | Shortest | 969.161 m | 969.161 | 5.9 deg | 6.5 deg | 0 m |
| | Terrain-aware | 969.161 m | 1058.299 | 2.4 deg | 4.3 deg | 0 m |
| | **Conservative** | **969.161 m** | **1058.299** | **2.4 deg** | **4.3 deg** | **0 m** |

- **ROI-A:** the conservative route is the same path as the terrain-aware one. The ground between these points is
  already gentle at 20 m cells, so there is nothing to avoid. The app says this in words instead of drawing a
  pretend-different line.
- **200 seeded random pairs, M0-A:** 167 routes; 21 refused because an endpoint lies on or beside ground over 25 deg;
  12 refused because gentle ground does not connect the points. Hard rules re-checked cell by cell: 0 failures.
  Metres on ground over 15 deg, summed: terrain-aware 2930 m, conservative 1022 m.
- **Honest limit found by the audit:** in 10 of the 167 pairs the conservative route's single steepest cell is
  steeper than the terrain-aware route's (by up to 4.9 deg). The strategy lowers accumulated exposure to slope, not
  the single worst cell. The detour marker states this when it happens.
- **200 random pairs, ROI-A:** 200 routes, all identical in length to the terrain-aware route.
- **Fail-closed examples (M0-A, from the reference start):** goal cell (2, 77): refused, "the destination lies on or
  beside ground steeper than 25 deg (27.9 deg nearby)". Goal cell (2, 95): refused, "does not connect"; the
  terrain-aware route to the same point crosses 44 deg ground.

### Where it shows
- **Planning:** third column in the comparison table, a short note under it (extra length, steepest ground and
  metres over 15 deg against the terrain-aware route, or the refusal reason), third line on the map and in the
  elevation profile, legend entry. Colours: cyan (shortest), orange (terrain-aware), soft green (conservative).
- **Route markers:** on the conservative route a "Largest detour" marker says where the two routes are farthest
  apart and what the steepest ground is on each over that stretch; the start marker says why the route is longer.
- **3D Terrain:** three lines, a third fly button, legend. **EVA HUD:** third route button; the walk, mini-map,
  metrics, markers and profile follow the selected route as before.
- The experimental S9 slope gate still acts on the two frozen strategies only; the conservative route has its own
  fixed rules. The straightened walking line is not offered for it (it would leave the cells it was chosen for).
- If the conservative route is selected and a new endpoint makes it impossible, the selection falls back to
  terrain-aware and Planning says why.

## 2. Environmental layers and legends (`web/src/environment.ts`, `web/src/EnvironmentPanel.tsx`)

There is no gridded dust, weather or radiation dataset over Jezero at this scale. So the layers are **reference
cards with a legend, not coloured areas**. Nothing is interpolated, no hazard map is drawn, and no route changes.
Every statement carries one of four tags:

| Tag | Meaning |
|---|---|
| Measured | a past observation at one place and time |
| Modelled | from a climate or transport model, not an observation |
| ARES-1 scenario | fiction written for this expedition story |
| Not available | no data of this kind in the build |

| Layer | Measured | Modelled | Not available |
|---|---|---|---|
| Dust and storms | Regional dust storm at Jezero, 5-11 Jan 2022, peak visible optical depth about 2 (Lemmon et al. 2022) | Seasonal dust climatology (Mars Climate Database; MRO MARCI weather reports): named, not bundled | Dust and visibility along a route |
| Atmosphere and weather | MEDA pressure, sol 516: 770-804 Pa, 7,440 readings (PDS product in the build). Air temperature, first 250 sols: mean near -55 C, daily swing 50-60 C (Rodriguez-Manfredi et al. 2023) | Climate-model fields: named, not bundled | Wind, temperature, pressure along a route |
| Radiation | Curiosity RAD at **Gale crater**: 0.21 +/- 0.04 mGy/day; about 0.67 mSv/day (Hassler et al. 2014; SwRI release) | - | Radiation at Jezero and along a route |

- **One geographic overlay exists, because one is supported:** with the weather layer on, the M0-A map marks the
  rover position where the sol 516 pressure record was taken (Wildcat Ridge workspace, position attributed, medium
  confidence). It is a point with a label, not a field.
- **Access:** Planning (one "Environment" switch in the layer row, key on the map, full cards in the side panel),
  3D Terrain (switch and key in the panel), Mission Control ("Environment" tab). The chosen layer is shared.
- Route conditions now also say that the HUD storm notice is a scenario event and changes no route.

## 3. EVA HUD scenario alert (`web/src/EvaHud.tsx`)

A small red indicator at the top of the right-hand column of the visor (upper right):
**"Dust storm expected in 2 hours."** with the label **"Scenario simulation"**. Pressing it opens a short panel:
- it is a planned event in the fictional ARES-1 scenario, **not a verified NASA weather forecast**;
- the scenario clock (EVA at T+0, storm at T+2 h) is part of the story and **does not run with the walk playback**,
  which is only a viewing speed. The message is fixed text: scrubbing or playing the walk does not change it;
- the real reference behind the story (the January 2022 storm);
- it changes nothing in the route or any cost.
The tiles "Suit and crew: No telemetry" and "Environment: Not measured" stay. A soft pulse on the dot is switched
off for users who ask for reduced motion. Tested at 1440 x 900 and 1024 x 768: clear of the top labels.

## 4. Data sources
- Lemmon, M. T. et al. (2022), Geophysical Research Letters, doi:10.1029/2022GL100126. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9540647/
- Rodriguez-Manfredi, J. A. et al. (2023), Nature Geoscience 16, 19-28, doi:10.1038/s41561-022-01084-0. https://link.springer.com/article/10.1038/s41561-022-01084-0
- Hassler, D. M. et al. (2014), Science 343, 1244797; SwRI release of the same results. https://swri.org/node/9079
- Mars 2020 MEDA pressure sensor, PDS derived product, sol 516 (already in the build, hash-checked).
- Mars Climate Database (LMD / ESA) and MRO MARCI weather reports (MSSS): named as the right sources; not bundled.
- Terrain: unchanged (HiRISE 2 m bundle `f8de9017164a`, CTX 20 m bundle `7ec72147790e`).
The app works offline as before: the links are citations, nothing is fetched (tested with outside hosts blocked).

## 5. Tests (on the committed code)
- Web unit **99/99** (9 new: the search against an independent Bellman-Ford relaxation on 12 synthetic terrains,
  penalty behaviour, level ground equals the shortest path, a detour round an 18 deg ridge, fail-closed cases, both
  real grids with every hard rule re-checked, the frozen references, environment entries). Build OK.
- Browser, Chromium: dev **44/44**, production preview with DNS disabled **44/44** (5 new: three strategies across
  Planning / 3D / EVA with references; two no-corridor cases; ROI-A; layer states and unavailable-data text with
  outside hosts blocked; storm indicator position, panel, playback independence, 1024 x 768).
- Real Chrome on NVIDIA RTX 4060: perf suite **8/8**; EVA **144 fps** with the indicator, 1440 x 900.
- core 41/41, pipeline 43/43, ARES-1 14/14, M0-A analysis 8/8.
- Two older tests were updated on purpose: the 3D scene now holds three route lines, not two.

## 6. Found and fixed during review
- My first layout put the layer switches on their own toolbar row. That shrank the Planning map below the
  existing map-first layout test. Now one "Environment" switch sits in the existing row; the map is the old size.
- The storm indicator first floated above the column and overlapped the centred top labels at 1024 x 768. It is now
  the first item of the column.
- The four-column cost cells broke "flat-equivalent m" mid-word; the unit now sits under the number.
- The new width check exposed an older defect: the route-conditions table pushed the side panel into horizontal
  scrolling. Fixed.
- The first detour marker compared slopes at one point, which explained little; it now compares the steepest ground
  over the stretch where the routes differ.

## 7. Limitations
- The conservative preference is a documented heuristic, not a validated model of suited walking. Its three
  parameters are not calibrated against anything.
- It lowers accumulated slope exposure, not the single steepest cell (10 of 167 random pairs are worse on that).
- DEM uncertainty is handled only as a fixed 4 deg slope margin on M0-A; horizontal registration error and the
  unverified vertical datum are reported, not planned for. On ROI-A no margin exists.
- At 20 m cells (ROI-A) the strategy sees only slopes tens of metres long and usually equals the terrain-aware route.
- Rocks, regolith strength, illumination, dust, weather and radiation are not in any route.
- The temperature and radiation figures are rounded values from the cited papers and release, not re-derived from
  PDS data here; the radiation figure is from Gale, not Jezero.
- The storm is a fixed story line; there is no scenario timeline engine.
- The third route and the layer switch extend the web state beyond contract section 9.4: see
  `docs/decisions/CR-007-third-route-and-environment-state.md` (needs owner approval).
- Carried over: F01 geology review, F02/F03 literature only, DEM registration and vertical datum, Minetti
  coefficients (S6), CR-005 / CR-006 approval, no terrain grid at B, physical network-off reload by a person.

## 8. Pictures
Real Chrome on the GPU (`s13-app-*.png`):
- `01-planning-three-routes`, `02-planning-conservative-detour-marker`, `03-planning-comparison-table`
- `04-planning-dust-layer`, `05-planning-weather-layer-meda-site`, `06-planning-radiation-cards`, `13-planning-1024-dust`
- `07-3d-three-routes`, `07b-3d-radiation-key`, `08-3d-three-routes-scientific`
- `09-eva-storm-indicator`, `10-eva-storm-details-open`, `11-eva-storm-scientific-view`, `12-eva-storm-1024`
- `14-mission-control-environment-dust`, `15-mission-control-environment-radiation`
Headless test shots: `s13-01` to `s13-08` (includes `03-no-corridor-endpoint`).

## 9. Assessment: GO for human acceptance; NO-GO for merge until reviewed
- **GO** as a release candidate: all suites pass, the frozen references are intact, every new statement is tagged
  by kind, and every refusal is explicit.
- **Before merge (owner decisions):** approve or reject CR-007; accept the three conservative parameters as
  demonstration values or change them; a science reviewer should confirm the wording of the three cited figures.
