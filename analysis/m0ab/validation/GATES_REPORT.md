# M0-A-B wider analysis grid: gate report (15 Nov 2026)

Bundle `5b2abdb8bb70` (`analysis/m0ab/bundle/`, copied to `web/public/data/m0ab/`). Built by the M0-A pipeline run
with `ARES_AREA=m0ab`: the same scripts, source rasters, grid definition and limits as the frozen M0-A bundle
`f8de9017164a` (`docs/decisions/M0A-terrain-gate.md`). The frozen bundle was not rebuilt or changed.

**Status: automated gates G1, G2, G3 and G6 pass; the G4 numbers meet their limits. The two human gates, G4 and G5,
were signed off by the owner on 15 Nov 2026 for prototype analysis (`analysis/m0ab/validation/signoff.json`).** Routes on this grid are prototype corridors, as on the M0-A grid.

## The box
- The frozen M0-A box, widened west and south until the Amalik sampling rover position (catalog record of the Mageik
  sampling activity, 18.45068664 N, 77.40143554 E) has 150 m of ground around it. North and east edges unchanged.
- lon 77.39877 to 77.41160, lat 18.44816 to 18.46193. Grid 381 x 409 cells of 2 m (155,829 cells; frozen: 259 x 369).
- Same 2 m cell lattice as the frozen grid, which sits at column offset 122, row offset 0.
- Ground spacing: the frozen grid's value is used for both (cos latitude differs by 4e-6 across the box), so costs
  and slopes are the same numbers on both grids.

## Gates

| Gate | Result | Evidence (`g1_g2.json`, `g3_g4.json`) |
|---|---|---|
| G1 geometry | PASS | window inside all three DEMs and the ortho; endpoint roundtrip below 1e-6 m |
| G2 pixels | PASS | 100 % valid on the JPL CTX DEM, the TRN CTX DTM and the HiRISE DTM; all three endpoints and the straight M0-A, M0-B and A-B corridors valid; no NoData, nothing filled |
| G3 cross-DEM | PASS | HiRISE minus JPL CTX DEM: median -0.25 m, MAD 1.87 m. HiRISE minus TRN CTX DTM: median -0.83 m, MAD 2.11 m (limit 5 m). Slope correlation 0.80 and 0.78 |
| G3 seams | PASS | the blended mosaic equals stereo pair C in 100 % of the box: there is no pair boundary inside it. Pairs differ by constant offsets (C-W -1.56 m, C-DL +0.55 m, W-DL +2.15 m), as in the frozen box |
| G4 registration (human) | numbers MEET LIMITS; **approved for prototype analysis, 15 Nov 2026** | DTM hillshade against the ortho: shift 0.7 to 1.4 m east, up to 1.3 m north, at most 0.91 cells (limit 2), all five tiles reliable. HiRISE minus rover elevations at 13 positions: median 0.00 m, spread 0.27 m (limit 3 m); at Amalik -0.19 m |
| G5 analysis grid (human) | same definition as M0-A; **confirmed, 15 Nov 2026** | 2 x 2 block mean of the 1 m DTM, Horn slope, no fill, no smoothing |
| G6 connectivity | CONNECTED | M0-A, M0-B and A-B all connected under g_max 0.45; 1.2 % of edges removed by the threshold; nothing relaxed |

## Checks beyond the gates
- **Superset.** All 95,571 cells of the frozen grid are bit-identical in the wider grid (elevation, slope, validity).
  Asserted when the bundle is built, recorded in `terrain.json` (`superset_of`), and tested again in `web/test/s15.test.ts`.
- **Frozen reference reproduced.** M0 -> A on the wider grid: 416.426 m, cost 664.390, the same cells; conservative
  453.513 m / 695.372. Identical to the frozen grid.
- **Independent route costs.** TypeScript A* and Dijkstra against the Python oracle (separate edge builder, SciPy
  Dijkstra): 18 cases, largest relative difference 5.6e-15 (`analysis/m0ab/results/routes_*.json`).
- **Stereo slope margin.** Robust sigma of the slope difference between independent stereo models on ground steeper
  than 15 deg: 2.6 to 4.9 deg in the new part of the box, 3.7 to 5.0 deg in the frozen part
  (`analysis/m0ab/results/slope_sigma.json`). The 4 deg margin used by the Conservative Terrain strategy is kept.

## Routes (`analysis/s15/results/b_routes.json`)

| Pair | Strategy | Length | Walking cost | Steepest step | Steepest ground | On ground > 15 deg |
|---|---|---|---|---|---|---|
| M0 -> B | Shortest | 438.587 m | 438.587 | 22.8 deg | 25.7 deg | 69 m |
| | Terrain-aware | 438.587 m | 615.136 | 7.8 deg | 15.4 deg | 6 m |
| | Conservative | 438.587 m | 619.149 | 9.5 deg | 9.1 deg | 0 m |
| A -> B | Shortest | 593.931 m | 593.931 | 19.4 deg | 24.6 deg | 87 m |
| | Terrain-aware | 593.931 m | 599.666 | 15.2 deg | 23.3 deg | 32 m |
| | Conservative | 608.736 m | 621.495 | 15.2 deg | 23.3 deg | 15 m |

Sensitivity of M0 -> B (`sensitivity_*.json`): the same route for g_max 0.25, 0.35 and 0.45; endpoint shifts of 2 and
4 m change the cost by under 1 % and move the line by up to 11.5 m; routing on the other stereo pairs moves the line
by up to 44 m at about 1 % cost change.

## Limits
- The sign-off covers prototype analysis only. It was given on the automated numbers and the overlay; it does not verify the vertical datum or the registration to the CTX frame, and it is not a merge approval.
- Vertical datum unverified; DEM registration to the CTX frame open (as for M0-A).
- 2 m cells of a 1 m stereo DTM: effective resolution is several metres. Rocks and small hazards are not in it.
- The endpoint at Amalik is the rover position during sampling, not the outcrop, a drill hole or an access point.
