# HiRISE high-resolution terrain for ROI-A — feasibility assessment (2026-11-14)

Status: **read-only feasibility study.** Nothing in `core/`, `contracts/`, the route engine, the
CTX bundle, `feat/web` or `feat/3d-terrain` was changed. Probe scripts: `pipeline/probes/hirise/`
(run with `uv run python <script> <scratch_dir>`; they write only to the scratch dir).

## Recommendation

**GO for HiRISE as a display-only 3D terrain and texture layer on ROI-A. NO-GO for routing on HiRISE
now.** Routes keep running on the frozen CTX 20 m grid (contract v1.0.0). The HiRISE layer would make
the 3D scene look and measure better at metre scale, with its own provenance and limitations. It
would not change any route, length or cost.

**Fallback (unchanged, already accepted at G2/G4):** the existing CTX 20 m DEM + 5 m ortho 2D/3D
demo, `feat/3d-terrain` @ `20a071d`. If the HiRISE task slips or a check fails, nothing needs undoing.

## 1. Source products (verified: listed in the bucket, header and metadata read)

Bucket listing: `https://asc-pds-services.s3.us-west-2.amazonaws.com/?list-type=2&prefix=mosaic/mars2020_trn/HiRISE/`

| Role | File (under `https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/`) | Size | DOI (resolves to USGS Astropedia) |
|---|---|---|---|
| DTM mosaic, nominal 1 m | `JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif` (+ `.xml` FGDC, `.lbl`, `_pds3.lbl`) | 1.84 GB | 10.5066/P9REJ9JN |
| Ortho mosaic, nominal 0.25 m (recommended) | `JEZ_hirise_soc_007_orthoMosaic_25cm_Ortho_blend120.tif` (+ `.xml`) "for Mars 2020 Surface Operations" | 3.41 GB | 10.5066/P9QJDP48 (cited in its .xml) |
| Ortho mosaic, nominal 0.25 m (alternative) | `JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif` (also `_first_dd.tif` 9.8 GB) | 7.36 GB | 10.5066/P9QJDP48 |
| Per-stereo-pair DTMs / per-image orthos | `DTM_…_Jezero_{C,E,N,W,DL,CR_NORTH,CR_SOUTH}_Edited_affine_1m_…tif`, `ESP_/PSP_…_25cm_…tif` | 72–132 MB / 0.9–1.7 GB each | — |

Publisher: USGS Astrogeology Science Center, Flagstaff. Authors (FGDC `origin`): R. Fergason,
D. Galuszka, T. Hare, D. Mayer, B. Redding, E. Smith; published 2020-07-24. Source images: MRO HiRISE
RDRs, 7 stereo pairs (14 images) acquired **2006–2017** (`begdate` 2006, `enddate` 2020 in metadata).
**The imagery predates the landing:** no lander, rover or tracks are visible, and the 3D scene must not
imply otherwise.

## 2. Raster facts (verified from the GeoTIFF headers)

| | DTM soc_006 | Ortho soc_007 | Ortho soc_006 |
|---|---|---|---|
| Size | 21 400 × 21 488, Float32 | 81 064 × 85 936, UInt8 | 85 600 × 85 952, UInt8 |
| CRS | `+proj=eqc +lat_ts=0 +lon_0=0 +R=3396190` | **`+proj=ortho +lat_0=18.4663 +lon_0=77.4298 +R=3396190`** | `+proj=eqc +lat_ts=0 +lon_0=0 +R=3396190` |
| Transform | (1, 0, 4 577 366; 0, −1, 1 106 618) | (0.25, 0, −11 612; 0, −0.25, 12 036) | (0.25, 0, 4 577 366; 0, −0.25, 1 106 618) |
| Pixel is | Area | Area | Area |
| NoData | −3.4028226550889045e+38 (ISIS NULL) | 0 | 0 |
| Layout | **strips** (1 × 21 400), uncompressed, no overviews | **256 × 256 tiles, LZW**, no overviews | strips, uncompressed, no overviews |

- Coordinates: planetocentric latitude, east-positive longitude, sphere R = 3 396 190 m (ISIS label:
  `LatitudeType = Planetocentric`, `LongitudeDirection = PositiveEast`). North up, row 0 = north.
- **Scale trap:** the DTM uses `lat_ts = 0`, so one projected metre in x is **0.9487 ground metres** at
  ROI-A latitude. Our CTX bundle uses `lat_ts = 18.4663`. Data prep must warp onto the CTX projection,
  or store the correct `dx_ground_m`. The `.xml` of soc_007 says "stdparll 18.4663", but the GeoTIFF is
  actually orthographic. The header wins.

## 3. ROI-A intersection with valid pixels (verified by reading the pixels)

ROI-A = the CTX bundle grid extent (`fc22a0c8a91f`): lat 18.42169–18.45206 N, lon 77.43569–77.46202 E.

| Check | Result |
|---|---|
| DTM window (col, row, w, h incl. 2 px halo) | (12 609, 12 876, 1 565, 1 804) |
| Valid DTM pixels inside ROI-A | **100.000 %** (0 NoData) |
| Ortho soc_007 window | (47 773, 51 520, 5 923, 7 202); NoData fraction **0.0** |
| POIs, 3 × 3 at 1 m all valid | landing ✔ (h −2569.90), rochette ✔ (−2574.52), roubion ✔ (−2584.92), sid ✔ (−2568.63) |
| Elevation range in ROI-A | −2592.77 … −2544.73 m (CTX: −2588.90 … −2546.11) |
| 1 m slope (Horn, ground spacing) | p50 3.1°, p95 9.5°, p99 13.9°, max 35.8°; > 15° 0.68 %, > 25° 0.014 % |

Which stereo pair covers ROI-A was **not determined** (the mosaic is blended). The metadata warns
about the far-western CR pair, which is outside the landing ellipse and not near ROI-A.

## 4. NoData and DTM confidence

- **Failed check: no per-pixel confidence or figure-of-merit layer is published** in this folder (only
  heights). Confidence is available only as aggregate statistics in the FGDC metadata:
  - horizontal: HiRISE orthos registered to each other better than 3 m (99th percentile), most
    better than 1.1 m; 94.1 % of features within 6 m of the CTX LVS orthomosaic;
  - vertical: median offset ~0.4 m from the CTX LVS DTM ("CTX floating above HiRISE");
  - the DTMs were **manually edited** in SOCET SET.
- **Measured artifact:** 21 east–west line steps in ROI-A (coherent over ≥ 100 m segments,
  6–12 cm high, median 6 cm), visible in hillshade
  (`hirise_roi_a_ortho_vs_hillshade.jpg`, right half). They are processing/mosaic artifacts, not
  geology. They would be visible at VE ×5/×10 and must be disclosed, not "fixed" silently.
- **Assumption:** the effective resolution of a 1 m-post HiRISE stereo DTM is a few metres (a
  common rule of thumb is about 3 × post spacing). This was not verified here. The 25 cm ortho shows
  far more detail (ripples, boulders) than the DTM.

## 5. Vertical reference and compatibility with CTX

- File names say `MOLAtopography_DeltaGeoid`. The DTM's absolute heights were tied to the CTX LVS
  elevation map through ground control points and `pc_align`. **The metadata does not explicitly name
  the vertical datum** (areoid model and epoch), so the label must stay **UNVERIFIED**, as it is for CTX.
- Measured on ROI-A (HiRISE 1 m pixels block-averaged into each CTX 20 m cell by exact footprint, about
  420 px per cell, 6 660 cells):

| CTX (our bundle) − HiRISE | Value |
|---|---|
| median / mean | **+1.66 m / +1.74 m** (CTX above HiRISE) |
| standard deviation | 2.07 m |
| p01 / p99 | −2.88 m / +6.85 m |
| max absolute | 10.03 m |
| sub-cell relief (SD of 1 m heights inside a 20 m cell) | median 0.28 m, p99 1.08 m |

  Our CTX DEM is the JPL "Science Investigation" mosaic (Mangold et al. 2021), not the LVS map the
  HiRISE was tied to. That explains why our offset (+1.66 m) differs from the published ~0.4 m.
  **Consequence:** do not mix CTX and HiRISE heights in one mesh or profile without stating the
  offset. A route drawn from CTX cells onto a HiRISE mesh must be re-sampled on the HiRISE surface for
  display only, with a note.

## 6. Co-registration

| Pair | Method | Result | Status |
|---|---|---|---|
| HiRISE ortho soc_007 vs our CTX ortho (5 m) | HiRISE averaged onto the CTX 5 m grid, high-pass, NCC shift search ±40 m, sub-pixel parabola | peak NCC **0.731** (runner-up 0.635, median −0.03) at **~1.3 m W, ~4.3 m N** | **Verified**: < 1 CTX DEM cell and consistent with the published 94.1 % < 6 m |
| HiRISE DTM vs HiRISE ortho soc_007 (1 m) | high-passed hillshade (best of 72 illuminations, az 165°, el 60°) vs ortho, ±8 px | peak NCC 0.41 at **2 px (~1.9 m) E–W**, 0.32 at zero, grid median 0.08 | **Plausible**: ≤ ~2 m. Hillshade-to-image matching can bias the peak, so sub-metre agreement is not proven. USGS orthorectified each image onto its own DTM. |
| HiRISE DTM vs our CTX DEM (horizontal) | elevation matching, ±40 m | residual SD 2.07 → 1.94 m, minimum shallow | **Inconclusive**: ROI-A is too flat for elevation-based registration |

## 7. Remote read feasibility, cost and memory (measured on this machine)

| Read | Bytes transferred | Time | Peak array in memory |
|---|---|---|---|
| DTM ROI-A window (strip file: whole rows are fetched) | ~154 MB | 88 s | 11 MB |
| Ortho soc_007 ROI-A window (tiled: only touched tiles) | ≤ 43 MB raw, LZW less | 117 s | 43 MB |
| Header open (each file) | a few KB | 1–2 s | — |

HTTP range requests work anonymously (no auth). A one-time preparation of ROI-A takes about 3.5
minutes and needs no full download (1.8 GB + 3.4 GB avoided). ROI-B (~3.9 × 3.0 km) would cost about
2× the rows and about 4× the ortho tiles. Not measured.

## 8. Realistic offline package for ROI-A (measured from the real crop)

| Layer | Grid | Size | Notes |
|---|---|---|---|
| DTM, 1 m native | 1 800 × 1 561 = 2.81 M vertices | 11.2 MB raw, 6.5 MB gzip | 5.6 M triangles: too heavy as one WebGL mesh for a demo laptop |
| **DTM, 2 m block mean (recommended mesh)** | 900 × 780 = 0.70 M vertices, 1.40 M triangles | 2.8 MB raw, 1.7 MB gzip | Real aggregation of 1 m data, not resampled CTX |
| DTM, 4 m block mean (light) | 450 × 390, 0.35 M triangles | 0.7 MB | |
| Ortho 0.25 m native | 7 202 × 5 923 | 5.2 MB JPEG q85 | Exceeds 4096 px; fits 8192 px GPUs only |
| **Ortho 0.5 m (recommended texture)** | 3 601 × 2 961 | 1.9 MB JPEG q85 | |
| Ortho 1 m | 1 800 × 1 480 | 0.6 MB | |

Recommended package: about **4–8 MB** in total (2 m DTM + 0.5 m ortho, optionally 0.25 m ortho), with
SHA-256 manifest and provenance sidecar like the CTX bundle.

**Never:** resample the 20 m CTX DEM to 1 m and call it high-resolution topography. Every HiRISE height
shown must come from the HiRISE DTM.

## 9. Licensing, attribution, provenance

- FGDC: `accconst: None`, `useconst: None`; USGS-produced, U.S. public domain. Includes the standard
  USGS no-warranty disclaimer.
- Required citations in the UI/provenance panel:
  - Fergason, R. L., Galuszka, D., Hare, T., Mayer, D., Redding, B., Smith, E. (2020). *HiRISE Digital
    Terrain Model Mosaic for Mars 2020 Terrain Relative Navigation.* USGS Astrogeology.
    doi:10.5066/P9REJ9JN
  - Same authors (2020). *HiRISE Orthorectified Image Mosaic* (soc_006 / soc_007 Surface Operations).
    doi:10.5066/P9QJDP48
  - McEwen, A. S. et al. (2007). *MRO HiRISE.* JGR 112, E05S04. doi:10.1029/2005JE002605
  - Image credit: NASA/JPL-Caltech/University of Arizona; DTM/mosaic: USGS. No NASA logos.
- Provenance sidecar must record file names, DOIs, the exact read windows, the source CRS, the warp
  method and the output hashes.

## 10. Proposed minimal implementation task (needs your approval; not started)

**TASK T-HiRISE-1, display-only HiRISE layer for ROI-A** (Claude, `feat/data-core`, new files only):

1. `pipeline/hirise_bundle.py`: window-read ROI-A plus a 1 cell CTX halo from the two products above.
   Warp the DTM onto the **CTX projection** (eqc, `lat_ts = 18.4663`) at **2 m by area averaging** (no
   upsampling anywhere). Warp the soc_007 ortho onto the same extent at 0.5 m (average). Keep NoData
   as NaN, never fill it.
2. Write a separate bundle `web/public/data/hirise/roi_a/<version>/`: `dtm_2m.f32.bin`,
   `ortho_0p5m.jpg`, `hirise.json` (grid, CRS, `dx_ground_m`, h range, `vertical_reference:
   "UNVERIFIED"`, `ctx_minus_hirise_median_m: 1.66`, line-artifact note, effective-resolution note,
   pre-landing imagery note), `sources.json`, `manifest.json` (SHA-256), plus `index.json` entry `hirise_roi_a`.
3. Tests (pytest): exact grid alignment with the CTX extent; 100 % valid; POIs valid; CTX−HiRISE
   median within ±0.5 m of 1.66; block-mean check of one 2 m cell against the 1 m source; manifest
   hashes; no value comes from CTX.
4. Contract: this is an **additive** bundle type outside the routing contract. It needs a short
   **CR-003** for the loader schema and your approval. `core/`, `RouteRequest/RouteResult` and the CTX
   bundle stay unchanged. Routing stays on CTX 20 m.
5. Frontend follow-up (Cursor, separate gate): toggle "Terrain: CTX 20 m / HiRISE 2 m (display only)".
   Draw the route line by sampling HiRISE heights at the CTX route vertices, with the label "Route
   computed on CTX 20 m; displayed on HiRISE". VE label, line-artifact and pre-landing notes stay visible.

Estimate: data task about 2–3 h including tests; frontend toggle about 2 h. Risk: low, because it is
additive and fully reversible.

## 11. Secondary inventory for later geological/environmental routing (research only)

Collected by a research subagent (web; **V** = page or listing opened, **R** = reported in a paper,
**U** = not found or could not open). I did not re-verify each entry myself.

| Family | Most usable source | Coverage / resolution | Size | License | Main limitation |
|---|---|---|---|---|---|
| CRISM | Parente et al. Jezero mineral map, Zenodo doi:10.5281/zenodo.5575824 (V) | built from 4 CRISM targeted cubes over Jezero; extent vs ROI-A **not checked** | 1.8 MB | CC BY 4.0 | ML classification, labels "preliminary"; not abundances |
| CRISM | MTRDR targeted cubes, e.g. HRL000040FF (~36 m/px, 2007, box contains ROI-A), FRT000047A3 (~18 m/px, 2007, partly covers ROI-A); PDS DOI 10.17189/1519470 (V) | targeted, 18–36 m/px | 0.16–1.3 GB per cube | public domain | band indices not abundances; artifacts; IR detector ended 2018 |
| CRISM | MRDR tile T1250 (~181 m/px) (V) | covers ROI-A, ~7 px across it | 0.2–0.7 GB | public domain | too coarse for ROI-A |
| THEMIS | USGS controlled MC-13 night/day IR COG, DOI 10.5066/P96FA04Z (V) | ~100 m/px, ROI-A ≈ 15 × 18 px | 436–468 MB (COG, range-readable) | CC0 | 8-bit brightness, **not thermal inertia** |
| THEMIS | Quantitative thermal inertia (Fergason et al. 2006) (U for the Jezero tile) | 100 m/px | ~2.5 GB/tile | public domain | top few cm; ~20 % accuracy; not a hazard map |
| MEDA | Mars 2020 MEDA bundle `urn:nasa:pds:mars2020_meda`, doi:10.17189/1522849, release 2026-08-11 (V) | **single point at the rover**, 2021-02-19 → 2026-05-14 | small CSVs per sol | public domain | time series, not a map; humidity before sol 63 and wind before sol 36 unreliable |

None of these may be presented as traversability, hazard or "safety". Any later multi-factor
routing needs its own design, contract change and approval.

## 12. Verified / assumed / failed

- **Verified:** product files, sizes and DOIs; CRS, transforms, NoData, tiling; 100 % valid DTM and
  ortho over ROI-A; all 4 POIs valid; CTX−HiRISE elevation statistics; HiRISE-vs-CTX ortho offset ~4.5 m;
  read times and bytes; package sizes from the real crop; 21 small line artifacts.
- **Plausible, not proven:** DTM-to-ortho registration ≤ ~2 m.
- **Assumed:** effective DTM resolution of a few metres; ROI-B costs (scaled, not measured); WebGL
  texture limits on the demo laptop.
- **Failed or not available:** per-pixel DTM confidence layer (not published here); explicit vertical
  datum statement (not in metadata); horizontal DTM-vs-CTX-DEM offset (inconclusive on flat terrain);
  which stereo pair covers ROI-A (not determined).
