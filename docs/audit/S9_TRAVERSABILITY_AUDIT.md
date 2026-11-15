# S9 terrain-aware traversability audit

Base: `s8-rc2` (0e7836c). Branch `integ/s9`. Bundles: M0-A `f8de9017164a` (HiRISE 2 m), ROI-A `7ec72147790e` (CTX 20 m).
Numbers: `analysis/s9/results/traversability.json` (TypeScript, `analysis/s9/traversability_audit.ts`) and
`analysis/s9/results/stereo_check.json` (independent numpy, `pipeline/traversability_check.py`). Tests: `web/test/s9.test.ts`,
`web/e2e/s9.spec.ts`. Pictures: `docs/checkpoints/s9-rc1/`. The core planner, the datasets and the reference routes are unchanged.

**The screenshot referred to in the request did not reach me.** I audited the two terrain-aware routes the 3D scene shows
on M0-A (the M0 to A reference route, and ARES Base to A) and the ROI-A reference route, and I searched random routes for
the worst behaviour. If the screenshot shows a different pair of endpoints, the audit script takes any pair.

## 1. Answer to the central question

**Why does the planner accept an apparently steep slope?** Because the only slope it limits is the height change between
two neighbouring cell centres along the path (at most 24.2 degrees, terrain-aware route only). It does not look at how
steep the ground itself is, at the slope across the walking direction, at steep ground beside the path, or at DEM error.
A path can therefore run along or obliquely up a steep hillside as long as each of its own 2 m steps is gentle.

This is a model gap, not a coding error: every stage computes what it says it computes (section 3).

**How bad is it on the routes shown?** Moderately:

| Route (terrain-aware, reference planner) | Steepest step along path | Steepest ground under path | Largest slope across path | On ground over 15 / 20 / 25 deg | Steep ground nearby |
|---|---|---|---|---|---|
| M0-A reference, 416.4 m | 18.2 deg | 19.9 deg | 15.3 deg | 33 m / 0 / 0 | 27.9 deg within 5 m, 34.7 deg within 10 m |
| ARES Base to A, 279.1 m | 18.2 deg | 21.0 deg | 19.2 deg | 32 m / 9 m / 0 | 27.9 deg within 5 m, 34.7 deg within 10 m |
| ROI-A reference, 969.2 m | 2.4 deg | 4.3 deg | 3.9 deg | 0 / 0 / 0 | not computed |

Both M0-A routes climb the delta front to A. A's recorded rover position itself lies on 18.1 degree ground, 4 m from
ground steeper than 25 degrees and 6 m from ground steeper than 30 degrees.

**How bad can it get?** Much worse. Of 80 terrain-aware routes between random points on M0-A, 19 crossed ground steeper
than 25 degrees, 14 crossed ground steeper than 30 degrees and 23 had a cross-slope above 20 degrees. The worst
(cell 45,217 to 125,133) runs 106 m on ground over 25 degrees, reaches **41.4 degree ground with 39.8 degrees of it
across the path**, and still has no step over 23.5 degrees. The planner called all of them valid.

**Why it can look worse than it is in 3D.** At vertical exaggeration x5 a real 20 degree slope is drawn at 61 degrees,
at x10 at 75 degrees. At x1 the M0-A climb looks like what it is: about 25 m of rise over the last 150 m. The dark
band on the delta front in the imagery is shadow and texture in the orthophoto, not extra relief. The 3D scene now warns
when the scale is exaggerated.

Possible causes checked, one by one:

| Suspected cause | Finding |
|---|---|
| Real terrain relief | Yes: 20 to 21 degree ground under the path, 28 to 35 degrees within 5 to 10 m. |
| Cross-slope traversal | Yes: up to 15 to 19 degrees across the path; 179 m of the M0-A reference route has more slope across than along. |
| Incorrect slope evaluation | No. The bundle's slope raster equals an independent Horn recomputation to 0.004 deg (M0-A) and 2e-7 deg (ROI-A); TypeScript and numpy per-step numbers agree to 0.02 deg. |
| DEM interpolation / resolution | Contributes: 2 m cells are block means of a 1 m stereo DTM whose real resolution is several metres. Step grades over 2 m are noisy (section 4). |
| Vertical exaggeration | Yes when above x1 (display only). |
| Route draping / 3D geometry | No. The line is drawn on the cell elevations with a 0.5 m lift; the camera and guidance use the mesh surface (tested against the mesh triangles in S8). 2D, 3D and profile use the same vertices. |
| Terrain-model artefacts | Stereo models disagree locally (section 4); no seam in the corridor (G3). |

## 2. What the terrain-aware route minimises

Cost = sum over steps of length x m(grade), m(0) = 1, a Minetti-shaped polynomial of signed grade; steps with
|grade| > 0.45 removed. It is exactly optimal on the 8-connected grid for that cost (A* equals Dijkstra, also under the
gate). It is direction dependent (uphill 664.4, the way back 303.8), ignores turns, and is not the cheapest line on the
surface (S8 audit). **A lower cost means fewer flat-equivalent metres under an unvalidated Earth walking curve. It is
not evidence of lower risk**: the 41 degree route above has the lowest cost between its endpoints.

## 3. Pipeline audit, stage by stage

| Stage | What it computes | Checked how | Result |
|---|---|---|---|
| Ingestion (`pipeline/m0a_bundle.py`, `t04_bundle.py`) | Window of the USGS HiRISE DTM (1 m) averaged 2x2 to 2 m; CTX DEM at 20 m. NoData never filled. | Manifest hashes; bundle equals stereo pair C (median 0.000 m, sigma 0.000 m) | Correct. Resolution is nominal, see section 4. |
| Coordinates (`core/src/coords.ts`) | Cell centre, proj, geo, scene; E-W ground scale cos(lat) applied once. | Existing round-trip tests; step lengths use dx_ground 1.897 m, dy 2.000 m | Correct. |
| Slope raster | Horn 3x3 on ground spacing, with a halo. | Independent recomputation in TS and numpy | Correct. **Used for display only by the reference planner.** |
| Edge model (`core/src/route.ts`) | Step grade from two cell centres; cost multiplier; cutoff at 0.45. No corner cutting. | Re-scoring, Dijkstra, Python oracle, new synthetic cases | Correct for what it states. Blind to terrain slope and cross-slope. |
| Per-cell slope gate | `cell_slope_gate_deg`: exists in the core, **off in the app** (null). | New tests | Works when set; it was never used. |
| Search | A* with an admissible heuristic. | Equals Dijkstra with and without the gate | Correct. |
| Smoothing (`web/src/walk.ts`) | Straight segments re-sampled every half cell on the mesh triangles. | S8 tests; new gate test | Correct; it now also obeys the gate. It samples the drawn surface, not only endpoints. |
| 3D drawing, EVA | Same vertices; mesh surface for camera. | S8 tests | Correct. |

No numerical, indexing, sign, scaling or projection error was found. The defect is what the model leaves out.

## 4. DEM reality check (M0-A)

- Three independent HiRISE stereo models (pairs C, W, DL) cover the box. The bundle is pair C.
- Terrain slope (Horn 3x3 at 2 m) differs between models by 2.2 to 3.0 deg (robust 1 sigma), by 3.7 to 5.0 deg on ground
  steeper than 15 deg, with a 95th percentile of 5.7 to 7.7 deg. At single cells of the routes the three models differ by
  up to 16 to 20 deg.
- On the other models the same routes are steeper:

| Route | Steepest ground, pair C / W / DL | Steepest step, C / W / DL | Cells where models disagree about 20 deg |
|---|---|---|---|
| M0-A reference | 19.9 / 22.0 / 23.7 deg | 18.2 / 18.2 / 17.4 deg | 5 of 185 |
| ARES Base to A | 21.0 / 24.2 / 25.0 deg | 18.2 / **26.9** / 20.6 deg | 13 of 105 |

  On pair W the base route breaks the planner's own 24.2 deg step cutoff. The route passes that cutoff only on the model
  it was planned on.
- 2 m posting is not 2 m resolution. Stereo DTMs resolve features a few posts across; rocks, ledges and steps smaller
  than several metres are absent. On level ground with 0.15 m of height noise the worst 2 m step grade is more than
  twice the worst 3x3 terrain slope (test), so the step cutoff is the noisier of the two measures.
- Registration: the HiRISE grid's absolute position is unverified (G4 evidence only); on ROI-A the DEM-to-image offset
  is unresolved. A line drawn 4 m from 25 degree ground cannot be claimed to stay off it.
- ROI-A: 20 m cells cannot show slopes shorter than several tens of metres; 96.5 % of its cells are under 5 deg at that
  scale. Its low numbers describe the DEM, not the ground a person would walk on. No independent model was compared.

## 5. Traversability factor matrix

| Factor | Reference planner | With the experimental gate | Shown to the user |
|---|---|---|---|
| Grade along each step | Hard limit 24.2 deg (terrain-aware route) and soft cost | Same | Yes |
| Terrain slope of the ground | **Absent** | Hard limit (15, 20 or 25 deg) | Yes: chart, table, route outline in 2D and 3D |
| Slope across the path | **Absent** | Bounded by the gate (a component of terrain slope) | Yes |
| Steep ground beside the path | **Absent** | Optional one-cell clearance (about 2 m) | Corridor figures in the audit only |
| Abrupt change, scarps | Only through step grade | Scarp cells exceed the gate | 3x3 relief measured, in the audit |
| Curvature, roughness | Absent | Absent | No |
| DEM / stereo uncertainty | Absent | Not planned for; metres near the gate are reported | Yes (M0-A); "not quantified" on ROI-A |
| NoData | Hard exclusion | Hard exclusion; undefined slope also excluded | Yes |
| Turns, path continuity | Free | Free | Heading changes (S8) |
| Registration error | Absent | Absent | Stated |
| Rocks, regolith strength, traction | Absent, no data | Absent | Stated as not evaluated |
| Radiation, dust, thermal, illumination, suit | Absent, no data | Absent | Stated as not modelled |

## 6. Correction: experimental terrain-slope gate

A separate, clearly labelled mode in Planning. It uses the core's existing `cell_slope_gate_deg`, so the algorithm and
contract are unchanged; the default is off and the reference outputs are identical.

- Cells whose Horn 3x3 terrain slope exceeds the gate are never entered (both routes). Because a cell's slope bounds
  every directional component, this limits both the grade along the path and the slope across it.
- Optional clearance: a cell is also excluded when one of its eight neighbours exceeds the gate.
- If an endpoint is on excluded ground, or the permitted ground does not connect, the result is "no supported corridor".
  Nothing is relaxed and no route is drawn; the ungated reference route stays visible in grey for comparison.
- Smoothing obeys the same gate under every sample.
- Gate values and their only basis: 20 deg is a lunar planning figure (a NASA lander-requirements presentation asks for
  suited walking up, down and across a 20 deg slope; Pena-Asensio et al. 2023 plan lunar traverses under 20 deg);
  about 15 deg is the steepest ground Apollo crews are reported to have walked. They are for the Moon. **None is a Mars
  EVA safety limit, and passing a gate certifies nothing.**

Before and after on real terrain (terrain-aware route):

| Route | Mode | Result | Length | Model cost | Steepest ground | Cross-slope | Over 15 / 20 deg |
|---|---|---|---|---|---|---|---|
| M0-A reference | Reference | OK | 416.426 m | 664.390 | 19.9 deg | 15.3 deg | 33 / 0 m |
| | Gate 25 | OK, same route | 416.426 m | 664.390 | 19.9 deg | 15.3 deg | 33 / 0 m |
| | Gate 20 | OK | 417.566 m | 664.860 | 19.6 deg | 15.2 deg | 24 / 0 m |
| | Gate 20 + clearance | **No corridor** (A's cell touches steeper ground) | | | | | |
| | Gate 15 | **No corridor** (A is on 18.1 deg ground) | | | | | |
| ARES Base to A | Reference | OK | 279.059 m | 514.012 | 21.0 deg | 19.2 deg | 32 / 9 m |
| | Gate 20 | OK | 283.621 m | 516.605 | 19.1 deg | 16.6 deg | 38 / 0 m |
| | Gate 20 + clearance, Gate 15 | **No corridor** | | | | | |
| ROI-A reference | Any gate | OK, same route | 969.161 m | 1058.299 | 4.3 deg | 3.9 deg | 0 / 0 m |
| Worst random pair | Reference | OK | | | 41.4 deg | 39.8 deg | 106 m over 25 deg |

Random pairs under gate 20: 62 of 80 still connect (10 have an endpoint on steeper ground, 8 have no connection); their
routes stay at or below 19.7 deg and are 1.2 % longer on average. So the gate costs little where a gentle corridor
exists, and says so where none does.

What the gate does not fix: the gated M0-A routes still pass 4 m from ground over 25 deg, and on stereo pairs W and DL
their ground reaches 22 to 24 deg. A gate on one stereo model is not a bound on the real slope.

Each gated route is re-checked cell by cell on the original rasters in `web/test/s9.test.ts` (slope, neighbours when
clearance is on, step cutoff, A* equals Dijkstra).

## 7. What the user now sees

- Planning, "Terrain under the route": chart of terrain slope, cross-slope and step grade along the route, the gate line,
  a table (steepest step, steepest ground, largest cross-slope, metres over 15/20/25 deg, metres where cross-slope
  exceeds grade), stereo uncertainty, the gate controls, the no-corridor message, and a reference-versus-gated column.
- 2D map: the selected route is underlined yellow on 15 to 20 deg ground and red above 20; excluded cells are tinted
  magenta when a gate is on; the reference route is a grey dashed line beside a gated one.
- 3D: the selected route's outline uses the same yellow and red; a warning appears at x5 and x10 with the apparent angle.
- Route conditions table: "Grade along each step: used", "Terrain slope and slope across the path: partly",
  "Clearance, DEM error: partly", instead of the earlier single "Slope: used".

## 8. Independent tests

`web/test/s9.test.ts` (13 tests): 30 deg face met head-on (reference climbs it diagonally, gate refuses); sideways across
a 35 deg hillside (reference charges it as level ground; gate blocks); 4 m scarp; one-cell ridge and smoothing; nearly
flat ground (gate changes nothing); NoData and undefined slope; DEM noise; island behind steep ground (NO_ROUTE, no
fallback); smoothing and clearance under a gate; reference routes unchanged; the 41 deg random route; gated routes
re-checked on the rasters. `pipeline/traversability_check.py` recomputes the route measurements in numpy and on the
other stereo models. `web/e2e/s9.spec.ts` drives the gate in the browser, including both no-corridor cases and the reset.

## 9. Limitations

- One stereo model drives the plan; the others are compared, not combined.
- The gate is a threshold on a 2 m Horn slope of a DEM with several-metre resolution. It is not a walkability model.
- Clearance is one cell. Registration uncertainty is larger than that.
- No obstacle, surface-strength, traction, illumination or environmental data exists in the build.
- Gate values come from lunar documents and secondary reports, not from a Mars EVA standard.
- The EVA walk and 3D still follow whichever route is planned; the gate does not change how they are drawn.

## 10. Scientific GO / NO-GO

- **Reference terrain-aware routing: NO-GO as a "terrain-suitable" path.** It is a least-cost path under a step-grade
  rule and can cross 40 degree ground. It may be shown only as what it is, with the measured terrain beside it.
- **Experimental gated routing: GO as an experimental, labelled comparison mode.** It removes the specific defect
  (unbounded terrain and cross-slope), fails closed, and is independently re-checked.
- **Either mode as a credible candidate path for a human expedition: NO-GO.** Required first: a slope measure at the
  DEM's real resolution with uncertainty from the stereo models; a clearance at least as large as the registration
  error; a decision, by someone with EVA authority, on slope limits for a Mars suit; and the unresolved items already
  carried (vertical datum, Minetti coefficients, obstacles below resolution).

## Sources for the gate values (lunar, context only)

- NASA NTRS presentation on lander surface requirements: https://ntrs.nasa.gov/api/citations/20210026296/downloads/Scoville%20Final%20presentation%20-%20compressed.pptx.pdf
- Pena-Asensio et al. 2023, reported at https://phys.org/news/2023-10-lunar-astronauts-easy-trails-moon.html
- EPSC 2024 abstract on Apollo traverse slopes and slope misperception: https://meetingorganizer.copernicus.org/EPSC2024/EPSC2024-196.html
- Apollo 16 Lunar Surface Journal, Stone Mountain: https://nasa.gov/wp-content/uploads/static/history/alsj/a16/a16.sta5.html
