# M0–A gates G1 (geometry) and G2 (pixels): result

**PASS for all three DEMs and the HiRISE ortho.** Generated 2026-11-14T20:23:29Z by `pipeline/m0a_validate.py`
on `feat/m0a-terrain`. The raw numbers are in `g1_g2.json` in this folder. Gates are defined in
`docs/decisions/M0A-terrain-gate.md`.

- Only headers and one window per raster were read (HTTP range reads). Nothing was written under `web/`.
- No route was computed.
- The endpoints and the box come from catalog `572fba1ce61f` and `ares1/docs/dem_coverage.json`.
  Both endpoints are **rover positions**, not tube or rock points:
  - start = `waypoint:M0`, the rover at the Bearwallow drop;
  - goal = the Skinner Ridge sampling rover position.

## G1 geometry (read from headers, nothing assumed)

| Raster | Size | CRS (from header) | Pixel | Ground dx / proj dx | Window (cols × rows) |
|---|---|---|---|---|---|
| JPL CTX DEM 20 m | 4456 × 5067 | eqc, R 3 396 190, **lat_ts 18.4663**, lon_0 0, PixelIsArea | 20 m | 1.00006 | 26 × 38 |
| USGS TRN CTX DTM 20 m | 1596 × 1512 | eqc, R 3 396 190, **lat_ts 0**, PixelIsArea | 20 m | **0.94857** | 27 × 38 |
| USGS HiRISE DTM 1 m | 21400 × 21488 | eqc, R 3 396 190, **lat_ts 0**, PixelIsArea | 1 m | **0.94857** | 518 × 737 |
| USGS HiRISE ortho 25 cm | 81064 × 85936 | **orthographic**, lat_0 18.4663, lon_0 77.4298, R 3 396 190, PixelIsArea, nodata 0 | 0.25 m | — | inside |

Correction (same day): the first version of this table listed the ortho as "eqc, lat_ts 0". The script had
filled in a default value for a parameter the orthographic projection does not have. The probe itself converted
coordinates through the real CRS, so the window and empty-pixel results were right. `header()` now reports
`proj`, `lat_0` and `lon_0` without defaults, and `probe_dem` asserts eqc before applying `ground_dx`.

- Every window, including the 1-cell slope halo, lies inside its raster.
- Endpoint round trip (geographic → projected → geographic) is ≤ 8.3e-10 m. The pass limit is 1e-6 m.
- The two lat_ts = 0 products need the cos(lat) correction: about 5.1 % in x, applied once by `roi.ground_dx`.
  Ignoring it would make east-west distances 5.4 % too long.
- None of the rasters has overviews.

## G2 pixels

| Raster | Valid cells | Elevation range (m) | Horn slope p50 / p95 / max | Cells > 24.2° | M0 cell h (m) | A cell h (m) | Corridor (±20 m) |
|---|---|---|---|---|---|---|---|
| JPL CTX DEM | 988 / 988 (100 %) | −2555.46 … −2475.23 | 4.9° / 17.4° / 27.2° | 0.4 % | −2547.09 | −2517.26 | 42 cells, all valid, max 12.5° |
| TRN CTX DTM | 1026 / 1026 (100 %) | −2555.56 … −2475.17 | 4.9° / 17.3° / 27.6° | 0.7 % | −2546.80 | −2516.72 | 47 cells, all valid, max 12.4° |
| HiRISE DTM 1 m | 381 766 / 381 766 (100 %) | −2549.68 … −2470.51 | 4.7° / 22.0° / 55.8° | 3.7 % | −2545.45 | −2520.47 | 17 658 cells, all valid, max 36.9° |
| HiRISE ortho | no empty pixels (2 m preview) | — | — | — | — | — | — |

- No NoData anywhere in the box, so no NoData had to be handled or filled.
- **Scale:** on the 20 m grids, M0 → A spans about 19 rows × 6 columns, roughly 20 cells along the route. On the 1 m DTM it spans 368 rows × 128 columns.
- **Slopes:** the straight corridor stays below 13° at 20 m but reaches 36.9° locally at 1 m. That is above the cost model's g_max domain (24.2°), so G6 connectivity matters on HiRISE.

## Early observations for G3/G4 (not gate results)

- Elevation at the endpoints differs by up to 3.8 m between the DEMs. At A: CTX −2517.3, TRN −2516.7, HiRISE −2520.5.
- The PLACES elevation of the Skinner Ridge sampling position is −2520.19 m (areoid), within 0.3 m of HiRISE.
- This suggests an offset in the CTX DEMs, or registration or relief effects at 20 m. G3 and G4 must quantify it before any DEM is called consistent.
- Vertical datum consistency is still **UNVERIFIED**.

## Next (gate document order)

1. **G3:** HiRISE resampled to 20 m vs both CTX DEMs (median and MAD of the difference, slope correlation), plus a check for HiRISE stereo-pair seams in the corridor.
2. **G4:** registration numbers and PLACES residuals at the 12 rover positions, for your sign-off.
3. **G5:** your choice of analysis DEM. Routing stays disabled until G3 passes and G5 is decided.
