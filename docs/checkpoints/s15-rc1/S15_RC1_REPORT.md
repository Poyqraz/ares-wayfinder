# s15-rc1: mission B is routable on a wider HiRISE grid

> **Update, s15-rc2 (15 Nov 2026):** the owner signed off G4 and G5 for the wider grid. The bundle's gate record and
> the app labels were updated; the data files and dataset version are unchanged. See section 10. Where this report
> says "pending", read it as the state at s15-rc1.

Branch `integ/s15`, base and rollback checkpoint `s14-rc1` (91fa798). Not merged, not pushed.
The frozen bundles, the catalog, `core/`, the contract and the cost model are unchanged. The frozen references are
unchanged and re-tested: ROI-A 969.161 m / 1093.229 / 1058.299 (LOWER), M0-A 416.426 m / 664.390, conservative 453.513 m.

## 1. What was built
- A second HiRISE 2 m analysis bundle, **`m0ab` / `5b2abdb8bb70`**: the M0-A box widened west and south until the
  Amalik sampling rover position has 150 m of ground around it. 381 x 409 cells (155,829), 100 % valid.
- It was built by the **existing M0-A pipeline**, run with `ARES_AREA=m0ab` (`pipeline/m0a_area.py`). Same source
  rasters, same grid definition, same gate limits. With no variable set the pipeline is as before (its 43 tests pass)
  and the frozen bundle `f8de9017164a` was not rebuilt.
- It sits on the **same 2 m cell lattice** as the frozen grid and uses the same ground spacing.

## 2. Validation (`analysis/m0ab/validation/GATES_REPORT.md`)

| Check | Result |
|---|---|
| G1 geometry, G2 pixels | PASS: 100 % valid on three DEMs; all endpoints and straight corridors valid; nothing filled |
| G3 cross-DEM | PASS: HiRISE against the two CTX DEMs, MAD 1.87 m and 2.11 m (limit 5 m) |
| G3 stereo-pair seams | PASS: the mosaic is stereo pair C in 100 % of the box, so no seam lies inside it |
| G4 registration | numbers meet the limits (image-to-terrain shift at most 0.91 cells; rover-elevation spread 0.27 m; -0.19 m at Amalik). **Human sign-off pending** |
| G5 analysis grid | same definition as M0-A. **Human confirmation pending** |
| G6 connectivity | M0-A, M0-B and A-B connected under the unchanged threshold; nothing relaxed |
| Superset | all 95,571 cells of the frozen grid are bit-identical in the wider grid (elevation, slope, validity) |
| Frozen reference | M0 -> A on the wider grid gives the same cells and numbers as the frozen grid, for all three strategies |
| Independent oracle | TypeScript A* and Dijkstra against the Python oracle, 18 cases: largest relative difference 5.6e-15 |
| Stereo slope margin | 2.6 to 4.9 deg in the new part (3.7 to 5.0 deg in the frozen part): the 4 deg margin is kept |

**G4 and G5 are human gates. I ran their numbers; I did not sign them off.** The app labels the grid
"automated gates pass; owner sign-off pending" on the mission card, in Planning, on the maps, in the route notes,
in the EVA caption and in Provenance.

## 3. Routes to B (`analysis/s15/results/b_routes.json`)

| Pair | Strategy | Length | Walking cost | Steepest step | Steepest ground | On ground > 15 deg |
|---|---|---|---|---|---|---|
| M0 -> B | Shortest | 438.587 m | 438.587 | 22.8 deg | 25.7 deg | 69 m |
| | Terrain-aware | 438.587 m | 615.136 | 7.8 deg | 15.4 deg | 6 m |
| | Conservative | 438.587 m | 619.149 | 9.5 deg | 9.1 deg | 0 m |
| A -> B | Shortest | 593.931 m | 593.931 | 19.4 deg | 24.6 deg | 87 m |
| | Terrain-aware | 593.931 m | 599.666 | 15.2 deg | 23.3 deg | 32 m |
| | Conservative | 608.736 m | 621.495 | 15.2 deg | 23.3 deg | 15 m |

- The straight line M0 to B is 407 m; the grid routes are 438.6 m because steps go along rows, columns and diagonals.
- Sensitivity of M0 -> B: the same route for the three step thresholds; endpoint shifts of 2 and 4 m change the cost
  by under 1 % and move the line by up to 11.5 m; the other stereo pairs move the line by up to 44 m at about 1 %.
- These are candidate corridors between rover positions. Not surveyed paths, not safety statements.

## 4. In the app
- **Mission B** now has "Plan M0 -> B corridor". Planning, 3D Terrain and the EVA walk work on the wider grid with all
  three strategies, markers, the experimental slope gate and the terrain panel.
- **M0 and A stay on the frozen grid.** The dataset follows the mission: switching between B and M0 or A swaps it, and
  the header shows which one is in use (`M0-A-B HiRISE 2 m (5b2abdb8bb70)` or `M0-A HiRISE 2 m (f8de9017164a)`).
- The Planning region selector has "M0-A-B · HiRISE 2 m wide grid" next to the frozen "M0-A" entry.
- Target cards for Amalik, Shuyak and Mageik offer "Plan a route to this rover position (prototype)".
- Mission Control and Regional Relief draw the wider grid as its own dashed box in B's blue.
- Provenance lists both HiRISE datasets.
- **Fail closed:** if the wider bundle does not pass its hash checks, B drops back to inspection with the reason, its
  plan button and region entry are disabled, and M0-A keeps working. Tested by corrupting one byte.
- C (Bright Angel) is unchanged: inspection only.

## 5. Found and fixed during review
- Two routes of equal length produced "-0 m longer than the shortest route". It now reads "The same length as the
  shortest route."
- `planFromBase` set the region before the mission; with B selected it would have used cells of the wrong grid. Fixed
  by setting the mission first; the dataset also follows the mission through one store subscription.

## 6. Tests (on the committed code, one full run)
- Web unit **111/111** (6 new), build OK; core 41/41, pipeline 43/43, ARES-1 14/14, M0-A analysis 8/8.
- Browser, Chromium, the one full run: dev 46/48, production preview with DNS disabled 47/48 (2 new tests; the S14 test for B rewritten).
  - Both runs failed one Atlas assertion: a stale expected sentence in the test (the app text had been reworded on purpose). Test fixed.
  - Dev also timed out once in the long real-time EVA walk test (90 s cap, software renderer, full suite running beside it). It passed in the preview run.
  - After the fix: the two specs pass in dev twice each (10/10), and the Atlas spec passes against the production build. The EVA test's cap is now 150 s.
  - The full suite was not run a second time, to keep the regression time down; no application code changed after the full run.
- Real Chrome on NVIDIA RTX 4060: perf suite **10/10**; EVA 143 fps on the wider grid at 1440 x 900.

## 7. Limitations
- **G4 and G5 sign-off for the wider box is pending.** Everything about B's routes rests on that decision.
- Vertical datum unverified; DEM registration to the CTX frame open (as for M0-A).
- 2 m cells of a 1 m stereo DTM: rocks and anything smaller than a few metres are not represented.
- The goal at Amalik is the rover position during sampling, not the outcrop, a drill hole or an access point.
- The repository gains about 1.7 MB of bundle data (`web/public/data/m0ab`, `analysis/m0ab/bundle`).
- Internally the wider grid shares the app's "m0a" region code and is chosen by mission; a separate region id would be
  cleaner if more grids are added.
- The validation overlay `analysis/m0ab/validation/g4_overlay.png` is there for the owner's G4 review; I looked at the
  numbers, and a person should look at the picture.
- Carried over: everything in the s14-rc1 and s13-rc1 reports (CR-007, CR-008, catalog v2 for Shuyak, Bosak Table 1,
  conservative-route parameters, Minetti coefficients, F01 to F03 reviews).

## 8. Pictures
Real Chrome on the GPU (`s15-app-*.png`): `01` Mission Control with B, `02` to `04` Planning B (three routes,
conservative selected, slope layer), `05` 3D Terrain B, `06` and `07` EVA walk to Amalik, `08` Regional Relief with the
wider grid, `09` Provenance, `10` Planning A on the frozen grid. Headless test shots: `s15-01`, `s14-01` to `s14-06`.

## 9. Assessment: GO for human acceptance; merge needs the gate decision
- **GO** as a release candidate: the suites pass (after one stale test expectation was corrected, see section 6) and the wider grid is, cell for cell, the frozen grid where they overlap.
- **Before merge:** sign off or refuse G4 and G5 for the wider box (CR-009). If refused, B returns to inspection only
  by removing one data folder and one line in the mission definition.

## 10. s15-rc2: gate sign-off recorded
- **Decision:** "Sign off both", in reply to "Do you sign off G4 and G5 for the wider M0-A-B grid?" (owner, 15 Nov 2026).
  Recorded in `analysis/m0ab/validation/signoff.json` with its scope: prototype analysis only; it does not verify the
  vertical datum, close the registration to the CTX frame, or approve a merge.
- **Bundle:** rebuilt offline from the cached source window. Dataset version unchanged (`5b2abdb8bb70`); all data files
  have the same hashes; only `terrain.json` (the gate record) and its hash in `index.json` changed.
- **App:** the "owner sign-off pending" labels are gone. The wider grid is described like the M0-A grid: a prototype
  grid approved for prototype analysis. Every other caveat stays (candidate corridor, rover positions, vertical datum
  unverified, rocks not represented).
- **Checks for this change (text and gate record only):** web unit tests, build, and the browser specs that read these
  labels, in dev and against the production build. The full suite was not repeated.
