# M0–A gate G6 and prototype routes: bundle `f8de9017164a`

**Status:** PROTOTYPE ANALYSIS, not integrated in the app, not in `web/public/data/index.json`.
Branch `feat/m0a-terrain`.

**Approvals (2026-11-14):**
- G4 approved conditionally, for prototype route analysis only;
- G5: HiRISE-derived 2 m analysis grid.

Neither approval certifies absolute registration, the vertical datum, EVA safety or energy savings.

## 1. Analysis bundle

| Item | Value |
|---|---|
| Version | `f8de9017164a` (= first 12 hex of the manifest SHA-256); index `analysis/m0a/bundle/index.json`, role `prototype_analysis` |
| Source DTM | `https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif` |
| Source ortho (display only) | `…/HiRISE/JEZ_hirise_soc_007_orthoMosaic_25cm_Ortho_blend120.tif` (orthographic, lat_0 18.4663, lon_0 77.4298) |
| Grid | DTM projection (eqc, lat_ts 0, lon_0 0, R 3 396 190 m). 259 × 369 cells, 2 m projected = 1.897 m ground E-W × 2 m N-S. x0 4 588 032, y0 1 094 326 |
| Processing | 2 × 2 block mean of the 1 m DTM (a NoData pixel makes the cell NoData; nothing is filled); Horn 3 × 3 slope on ground spacing with a 1-cell halo from the source; ortho warped with GDAL average to 1 m on the same footprint |
| Validity | 95 571 / 95 571 cells valid (no NoData, no undefined slope) |
| Files (SHA-256 in `manifest.json`) | `dem.f32.bin`, `slope_deg.f32.bin`, `validity.u8.bin`, `endpoints.json`, `sources.json`, `ortho_1m.jpg`, `hillshade.png`; `terrain.json` hashed in the index |
| Deterministic rebuild | `uv run python m0a_bundle.py --offline` (from the cached source window) reproduces `f8de9017164a` byte-for-byte; the online build gave the same version |

**Endpoints** (rover positions, never tube, core or rock points; read from catalog `572fba1ce61f`):

| Endpoint | Position | Cell | Snap |
|---|---|---|---|
| Start | M0 Bearwallow-drop rover position (`waypoint:M0`, MMGIS sol 674), 18.452728 N, 77.408336 E | row 273, col 161 | 1.07 m |
| Goal | Skinner Ridge sampling rover position (Initial Report), 18.458931 N, 77.406171 E | row 89, col 97 | 0.65 m |

Snap rule: the cell containing the point (PixelIsArea, floor). TS (`core/coords`) and Python give the same cells (tested).

## 2. G6 connectivity

**CONNECTED.**
- **Threshold:** edges with |grade| > 0.45 (24.2°) are removed. This is an *experimental algorithm threshold* (the cost curve's fitted domain), **not an astronaut safety limit**.
- **Effect:** it removes 1.5 % of edges. The whole grid remains one strongly connected component.
- **Smaller thresholds:** routes still exist at 0.35 (19.3°) and 0.25 (14.0°). Nothing was relaxed.

## 3. Routes (existing TS engine `core/src/route.ts`, unchanged; 8-connected, no corner cutting)

| Route | Length (m) | Ascent / descent (m) | Steepest edge | Cost (flat-equiv. m) | Shortest route under the same model |
|---|---|---|---|---|---|
| M0→A shortest distance | 416.43 | 26.46 / 1.50 | 22.0° | — | — |
| M0→A terrain, Minetti | 416.43 | 25.09 / 0.12 | **18.2°** | 664.39 | 673.50 (terrain route 1.4 % lower) |
| M0→A terrain, Tobler | 416.43 | 25.09 / 0.12 | 18.2° | 530.27 | 538.11 (1.5 % lower) |
| A→M0 shortest distance | 416.43 | 1.45 / 26.42 | 20.6° | — | — |
| A→M0 terrain, Minetti | 417.57 | 0.12 / 25.09 | 15.1° | 303.80 | 324.55 (6.4 % lower) |
| A→M0 terrain, Tobler | 416.43 | 0.13 / 25.09 | 18.2° | 422.79 | 439.96 (3.9 % lower) |

- The straight-line distance is 387 m. On an 8-connected 2 m grid the shortest path is 416.4 m, and many paths share that length.
- **M0→A:** the terrain route is one of those equal-length paths, chosen so the climb is gentler (steepest edge 18.2° instead of 22°, almost no descent).
- **A→M0:** the Minetti route is 1.1 m longer. Each direction was computed separately; no symmetry is assumed.
- The figure is `routes_f8de9017164a.png`: route cells drawn on the 1 m ortho of the same footprint.

## 4. Independent verification

- **TS vs Python oracle:**
  - TS A* and TS Dijkstra vs the Python loop oracle (`pipeline/oracle.py`, SciPy Dijkstra): all 6 policy/direction cases agree, max relative difference 1.4e-16;
  - a second, vectorised Python graph agrees with the oracle on all cases and on 40 random grids with NoData (pytest).
- **Tests:** `node --test analysis/m0a/m0a.test.ts`, 8/8 pass. They cover:
  - bundle identity and absence from the live index;
  - cos(lat) applied once;
  - snapping and the pixel-edge convention, geo↔proj round trip < 1e-12°;
  - oracle parity;
  - determinism;
  - NoData on the route (detour, no corner cutting);
  - a NoData endpoint (`INVALID_ENDPOINT_NODATA`);
  - an enclosed goal and a 0.001 threshold (honest `NO_ROUTE`);
  - grid-corner endpoints, out-of-grid (`ENDPOINT_OUTSIDE_ROI`), wrong dataset (`DATASET_VERSION_MISMATCH`);
  - the terrain route never beats the shortest route on length.
- **Pipeline:** pytest 27/27.

## 5. Sensitivity (`sensitivity_f8de9017164a.json`)

| Perturbation | Effect on the M0→A terrain route (Minetti) |
|---|---|
| Threshold 0.35 (19.3°) | identical route |
| Threshold 0.25 (14.0°) | +4.9 m length, line moves ≤ 5.7 m, cost +0.5 % |
| Both endpoints shifted 2 m (8 directions; G4 measured ≤ 1.7 m) | line moves ≤ 7.6 m (mean ≤ 0.9 m), cost −1.0 % … +1.8 % |
| Both endpoints shifted 4 m | line moves ≤ 7.6 m, cost −2.6 % … +3.1 % |
| Independent stereo DTM pair W instead of C | **line moves up to 38.7 m (mean 17.5 m)**, cost +0.4 %, steepest edge 18.0° |
| Independent stereo DTM pair DL | line moves up to 24.9 m (mean 9.2 m), cost −0.5 %, steepest edge 17.7° |
| Shortest-distance route on pairs C / W / DL | steepest edge 22.0° / **28.9°** / 24.0° |

**Grade noise.** Comparing independent stereo DTMs on 2 m edges, the difference has σ 0.048–0.068 (constant pair offsets cancel). One DTM therefore carries roughly 0.035–0.048 grade noise per edge, about 2–2.7°.

## 6. Scientific reading: what is and is not defensible

**Robust across all three independent DTMs, thresholds and endpoint shifts:**
- M0 and A are connected under the configured threshold;
- a terrain-aware route of essentially the same length (≈ 416 m on the grid) keeps every 2 m edge at ≤ 18.2°;
- the shortest-distance route reaches 22–29°;
- the terrain route's relative cost is 1.4–1.5 % lower than the shortest route's, under the same model, in the M0→A direction.

**Not defensible as a precise line:**
- the cost surface is nearly flat across a ~25–40 m wide band of alternatives (< 0.5 % cost difference);
- which line wins is decided by DTM noise at the 2 m scale;
- present it as a **route corridor with a representative line**, not a surveyed path.

**Not claimed:**
- EVA safety;
- energy or time savings (flat-equivalent metres are a relative model quantity, and the cost curves are pending S6);
- obstacle clearance (effective DTM resolution is several metres);
- absolute registration or vertical datum.

**Verdict:** the 2 m cost model is defensible for a prototype that compares relative cost and steepness between two route policies, with the corridor caveat. It is not defensible for a single precise path or for any safety or energy statement.
