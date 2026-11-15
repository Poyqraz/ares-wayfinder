# T-HiRISE-1 — display-only HiRISE terrain + ortho bundle for ROI-A

Status: **built and independently validated; display-only; not integrated in any frontend.**
Bundle `web/public/data/hirise/roi_a/e88cfab318e6/` (index: `web/public/data/hirise/index.json`).
Aligned to CTX bundle `roi_a/fc22a0c8a91f`, which is unchanged. `core/`, `contracts/`, the route
engine and `web/public/data/index.json` are unchanged.

## Scientific separation (binding)

- Routing stays on the CTX 20 m analysis grid. HiRISE is visualization only.
- Drawing the existing route on a HiRISE surface does not validate it for human walking.
- The route elevation profile, physical distance and model costs stay CTX-derived and are not replaced.
- G1/S-4, S2, S6 and the vertical datum stay open. The DTM line artifacts are disclosed, not edited.

## Sources (official USGS Astrogeology, Mars 2020 TRN; verified)

| Role | Product file | URL | DOI |
|---|---|---|---|
| DTM 1 m | `JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif` | https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif | 10.5066/P9REJ9JN |
| Ortho 0.25 m | `JEZ_hirise_soc_007_orthoMosaic_25cm_Ortho_blend120.tif` | https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_007_orthoMosaic_25cm_Ortho_blend120.tif | 10.5066/P9QJDP48 |

Authors: Fergason, Galuszka, Hare, Mayer, Redding, Smith (USGS, 2020). HiRISE: McEwen et al. 2007,
doi:10.1029/2005JE002605. Credit: NASA/JPL-Caltech/University of Arizona; USGS. Public domain.

## Processing (pipeline/hirise_bundle.py)

| Step | DTM | Ortho |
|---|---|---|
| Source CRS (from the GeoTIFF) | eqc `lat_ts=0`, R 3396190 | orthographic `lat_0=18.4663 lon_0=77.4298`, R 3396190 |
| Pixels actually read (col, row, w, h) | (12 569, 12 838, 1 645, 1 880); 0 NoData | (47 613, 51 360, 6 243, 7 522); 0 NoData |
| Target CRS | CTX bundle CRS: eqc `lat_ts=18.4663`, R 3396190, x0 4 353 640, y0 1 093 740 | same |
| Resampling | GDAL area **average** to 2 m (~4.2 source px per cell) | GDAL area **average** to 0.5 m (~4 source px per cell) |
| NoData rule | any NoData contribution makes the cell NaN; no filling | same (stored as DN 0 before JPEG) |
| Fallback | `dtm_4m` = 2×2 block mean of `dtm_2m` | `ortho_1m` = 2×2 block mean before JPEG |
| Height change | **none** (no shift to CTX) | DN unchanged (no stretch) |
| Horizontal correction | **none applied** (measured only, see below) | same |

## Coverage and geometry (verified)

| Grid | nx × ny | Spacing (proj / ground E–W) | Invalid |
|---|---|---|---|
| dtm_2m | 740 × 900 | 2 m / 2.0003 m | 0 |
| dtm_4m | 370 × 450 | 4 m / 4.0007 m | 0 |
| ortho_0p5m | 2 960 × 3 600 | 0.5 m / 0.50009 m | 0 |
| ortho_1m | 1 480 × 1 800 | 1 m / 1.00017 m | 0 |

Extent equals the CTX ROI-A grid exactly: NW 18.452055 N 77.435695 E, SE 18.421688 N 77.462019 E
(planetocentric, east-positive). HiRISE heights −2592.76 … −2544.75 m. All four POIs fall on valid cells.

## Elevation compatibility (not adjusted)

CTX bundle − HiRISE on the identical 20 m grid (6 660 cells): median **+1.664 m**, mean +1.745,
SD 2.071, p01 −2.875, p99 +6.845, max |Δ| 10.02 m. Vertical datum **UNVERIFIED** for both.

## Horizontal registration (measured, not applied)

HiRISE 0.5 m texture vs the CTX bundle ortho (5 m grid), high-pass NCC with sub-pixel peak:
offset of HiRISE relative to CTX = **+1.24 m east, −4.27 m north** (i.e. 4.27 m south). Peak NCC 0.723
(zero shift 0.656, runner-up outside 1 px 0.465, grid median 0.013). Estimated uncertainty ±2.5 m. USGS:
94.1 % of features within 6 m of the CTX LVS map. Not applied, because the offset is less than a quarter
of one 20 m analysis cell, and because the CTX reference is itself not quantitatively registered to the
CTX DEM (S-4).

## DTM artifacts (disclosed, unedited)

21 coherent east–west row steps inside ROI-A (1 800 × 1 561 source pixels), median 0.061 m, max 0.119 m.
They are visible in shaded relief (evidence image, bottom right) and will be visible at VE ×5/×10.

## Independent validation (pipeline/hirise_validate.py → science/hirise_bundle_validation_roi_a.md)

| Check | Result |
|---|---|
| Manifest sha256 = index; version = prefix; every file hash and byte count; no unlisted files | all pass |
| Extent equals CTX bundle; CRS lat_ts/R equal; dims × spacing = extent | all pass |
| DTM vs independent pixel-centre binning of the 1 m source (own eqc formulas) | median \|Δ\| 0.005 m, p99 0.054 m, max 0.170 m |
| POI sample heights (bundle / independent bin / source pixel) | landing −2569.881 / −2569.888 / −2569.904; rochette −2574.548 / −2574.545 / −2574.524; roubion −2584.897 / −2584.898 / −2584.916; sid −2568.601 / −2568.600 / −2568.629 |
| Ortho vs independent orthographic inverse (Snyder) + binning | median \|Δ\| 1.0 DN, p99 6.0 DN, Pearson r 0.99625 |
| Orientation, texture vs CTX ortho | as-is r 0.829; N–S flipped −0.193; E–W flipped 0.201 |
| Orientation, DTM vs CTX DEM (detrended) | as-is r 0.891; N–S flipped −0.025; E–W flipped 0.563 |
| Fresh source headers (size, transform, CRS, NoData) vs manifest | all match (online) |
| dtm_4m vs 2×2 mean of dtm_2m | max \|Δ\| 0.0002 m |
| Determinism | two rebuilds from the source cache give the same version `e88cfab318e6` |
| pytest (`pipeline/tests/`) | 12 / 12 pass (7 HiRISE + 5 existing) |

## Package size, browser memory and GPU textures (computed estimates, not measured in a browser)

| Item | Download | Geometry / texture | GPU estimate |
|---|---|---|---|
| dtm_2m | 2.66 MB | 666 000 vertices, 1 328 722 triangles | ≈ 37 MB (position 12 B + uv 8 B + normal 12 B per vertex; Uint32 indices) |
| dtm_4m | 0.67 MB | 166 500 vertices, 331 362 triangles | ≈ 9 MB |
| ortho_0p5m | 2.26 MB | 2 960 × 3 600 | ≈ 43 MB as RGBA8, ≈ 57 MB with mipmaps |
| ortho_1m | 0.75 MB | 1 480 × 1 800 | ≈ 11 MB, ≈ 14 MB with mipmaps |
| manifest | 0.01 MB | | |
| **Total download** | **6.36 MB** | | |

- Recommended: `dtm_2m` + `ortho_0p5m`, ≈ 95 MB GPU, plus a similar amount of JS-side copies while building.
- Fallback: `dtm_4m` + `ortho_1m`, ≈ 25 MB GPU.
- The largest texture side is 3 600 px, within the 4 096 px limit common to WebGL2 devices. Check
  `MAX_TEXTURE_SIZE` at runtime anyway.

## Visual evidence

`science/hirise_roi_a_ctx_vs_hirise.jpg` (`pipeline/hirise_evidence.py`): the identical ROI-A extent,
north up. Rows: CTX 5 m vs HiRISE 0.5 m ortho; a 300 m box at Landing; CTX 20 m vs HiRISE 2 m
hillshade. Landing and Rochette are marked (coordinates UNVERIFIED, S2).

## Frontend integration: GO, gated

**GO** for a separate, gated frontend task after CR-003 is approved, with these conditions:
1. a toggle "Terrain: CTX 20 m / HiRISE 2 m (display only)", CTX by default;
2. integrity checks per CR-003, with CTX shown on any failure;
3. the route drawn by sampling HiRISE heights at the CTX route vertices, with the CR-003 label, while
   numbers and profile stay CTX;
4. the required labels (DOIs, display only, datum UNVERIFIED, +1.66 m offset, line artifacts,
   pre-landing imagery, VE, S2);
5. the 4 m / 1 m fallback chosen when `MAX_TEXTURE_SIZE` < 4096 or the device is weak.

**NO-GO** for any use of HiRISE in routing, profiles, lengths or costs.
**Required fallback:** the existing CTX demo (`feat/3d-terrain` @ `20a071d`), unchanged.
