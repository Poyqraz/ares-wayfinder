# Regional DEM for a display-only regional 3D view: result

**Decision: yes, for display only.** The USGS Mars 2020 TRN CTX DTM 20 m (`trn_ctx_dtm_20m`) is selected and built as
bundle **`5c4dd158f4cf`** (`analysis/regional_dem/5c4dd158f4cf/`, 341 × 178 = 60 698 vertices at 40 m posting).
It is **not** for routing, slopes, hazards or traversability. Two labels travel with it: registration to the
regional imagery is **UNRESOLVED** under the gate rule, and the vertical reference is **UNVERIFIED**.

- Gates were written and committed **before** any candidate DEM pixel was read: `GATES.md`, commit `e254a38`.
- Raw numbers: `checks.json`. Script: `pipeline/regional_dem.py` (`fetch` / `analyze` / `build`).
  Tests: `pipeline/tests/test_regional_dem.py`.
- Evidence image: `evidence_dem_differences.png`. It has three panels, north up, on the TRN 20 m grid, coloured
  blue (−10 m) through white (0) to red (+10 m), NoData grey. Top: TRN − JPL. Middle: HiRISE − TRN. Bottom: HiRISE − JPL.
- Nothing was filled, smoothed or synthesised. No local DEM was stretched over the region. Nothing was written
  under `web/`.

## Extent and inputs

- **Extent:** the regional science extent of basemap `d3d62fc34c56`: lat 18.40–18.52 °N, lon 77.28–77.51 °E. Each
  DEM's window comes from its own header CRS, expanded to whole pixels by the contract window rounding.
- **Reads:** HTTP range reads (`/vsicurl`), headers plus one window per raster. The HiRISE window is about 390 MB, so
  `fetch` takes about 8 minutes. The window is cached in `pipeline/cache/regional_dem.npz`, which is git-ignored.

| Raster | Size | CRS (header) | Pixel | nodata | Window over the extent |
|---|---|---|---|---|---|
| JPL CTX DEM 20 m (`ctx_dem_20m`, Mangold et al. 2021) | 4456 × 5067 | eqc, R 3 396 190, **lat_ts 18.4663**, lon_0 0, PixelIsArea | 20 m | −3.4028235e38 | 647 × 357 cells, x0 4 344 880, y0 1 097 780 |
| USGS TRN CTX DTM 20 m (`trn_ctx_dtm_20m`, soc_008) | 1596 × 1512 | eqc, R 3 396 190, **lat_ts 0**, lon_0 0, PixelIsArea | 20 m (18.971 m ground E-W) | −3.4028227e38 | 682 × 356 cells, x0 4 580 743.25, y0 1 097 773.14 |
| USGS HiRISE DTM 1 m (soc_006 blend40), cross-check | 21400 × 21488 | eqc, lat_ts 0, PixelIsArea | 1 m | −3.4028227e38 | averaged onto the TRN 20 m window |
| USGS CTX ortho 6 m (soc_008), registration reference | 5322 × 5040 | eqc, lat_ts 0, PixelIsArea | 6 m | 0 | the `science_6m.jpg` window (2274 × 1187), as 12 m blocks |

- All rasters are stripped and uncompressed, with no overviews.
- The TRN DTM and the 6 m ortho share the **same origin** (4 573 663.250853, 1 109 693.140188). So the DTM grid's x0 is
  exactly the image's x0, and its y0 is 2 m north of the image's y0.

## R1 coverage, NoData, elevation, slope (native grids over the extent)

| DEM | Valid cells | NoData pattern | Elevation min / p01 / p99 / max (m) | Horn slope p50 / p95 / p99 / max (ground spacing) |
|---|---|---|---|---|
| JPL CTX DEM | 230 979 / 230 979 = **100 %** | none (0 cells, 0 components) | −2649.7 / −2640.4 / −1889.7 / −1787.7 | 3.4° / 16.1° / 22.0° / 33.7° |
| TRN CTX DTM | 242 792 / 242 792 = **100 %** | none (0 cells, 0 components) | −2649.7 / −2640.5 / −1890.5 / −1788.2 | 3.4° / 16.1° / 22.1° / 34.2° |

The extent holds about 860 m of real relief. Terrain rises toward the west edge (the highest cell is in the westernmost column, in the direction of the western crater wall); the lowest is on the eastern crater floor.

## R2 DEM vs DEM, and the HiRISE check

- **Grid:** the TRN native 20 m grid over the extent, 242 792 cells.
- **JPL:** warped bilinearly onto that grid. A cell is dropped if its warp support touches JPL NoData; none did.
- **HiRISE:** the GDAL average of the 1 m pixels in each 20 m cell. Only cells with 100 % HiRISE support are kept,
  which turned out to be all 242 792.

| Difference | Median | **MAD** | p05 / p95 | Robust σ | Tile medians (2 × 4 tiles; north row, then south row; west → east) |
|---|---|---|---|---|---|
| TRN − JPL | −0.09 m | **0.36 m** | −1.72 / +1.10 m | 0.54 m | −0.43 +0.03 −0.02 +0.04 / −0.79 −0.12 −0.01 +0.01 |
| HiRISE − TRN | −0.91 m | 2.29 m | −6.55 / +4.96 m | 3.40 m | −0.00 −0.36 +1.63 +1.15 / −2.42 −2.73 −1.35 −1.54 |
| HiRISE − JPL | −1.04 m | 2.21 m | −6.51 / +4.49 m | 3.28 m | −0.42 −0.27 +1.58 +1.17 / −3.25 −2.86 −1.34 −1.45 |

**Systematic patterns.** These come from a least-squares fit of the difference to a plane plus a gradient
(first-order horizontal shift) term. They are diagnostics, not corrections; nothing was corrected.

### TRN and JPL are not independent over this extent

- The fit removes a uniform offset: features in TRN sit **4.1 m west and 10.7 m south** of the same features in JPL.
- After that, the robust σ of TRN − JPL drops from 0.49 m to **0.04 m** (217 k cells).
- The offset is the same in all 8 tiles: −4.0 to −4.3 m E, −10.2 to −11.1 m N, with residual σ 0.03–0.07 m.
- The larger raw differences (|d| > 2 m in 5.6 % of cells) are concentrated in the steep western fifth of the
  extent. That is where an offset times the gradient produces large differences.
- Two independent CTX stereo DTMs would differ by metres; the TRN FGDC metadata reports 3.8 m between its own
  source DTMs. So the JPL mosaic very likely reuses the same USGS CTX elevation data here, regridded with a ~half-cell
  offset. **This is an inference; the JPL label does not say so.**
- Consequence: R2 shows that the two published products agree. It does **not** show that two independent
  measurements agree. The HiRISE check is the more independent test.

### HiRISE vs the CTX DEMs

- **North–south tilt:** HiRISE is about 0.67 m/km higher toward the north relative to both CTX DEMs. That is about
  4–5 m over the 7 km extent, visible in the tile medians (north row +1.2 to +1.6 m, south row −1.3 to −2.7 m).
- **Implied shift, whole extent:** HiRISE minus TRN is −0.9 m E and +17.2 m N. HiRISE minus JPL is −4.8 m E and +8.0 m N.
  Per tile, HiRISE minus TRN ranges from −18 to +2 m E and +8 to +20 m N.
- **No east-west offset of tens of metres.** This supports the earlier judgement that the "~50 m E" CTX shift in
  `G3_G4_REPORT.md` was an artefact.
- **MAD 2.2–2.3 m.** This is also within the 5 m limit.
- **Caveat:** the HiRISE DTM is not fully independent of CTX. It is the same USGS production, MOLA-tied, and the TRN
  FGDC metadata says the CTX mosaic served as ground truth for the HiRISE orthomosaic.

## R3 registration of each DEM's hillshade to the regional CTX 6 m orthomosaic

- **Method:** `registration_check.surface/peak` on a 12 m grid, made of 2 × 2 blocks of the `science_6m.jpg` window.
  Search radius ±10 px (±120 m). Pixel size 11.383 m E (ground) by 12 m N.
- **Sign convention:** the shift is the position of a feature in the ortho minus its position in the DEM.
- **Sun direction:** chosen by NCC at zero shift. The result was azimuth 270°, altitude 45° for both DEMs
  (NCC 0.581 for TRN, 0.598 for JPL).
- **Synthetic sign check: PASS for both.** Imposed shifts of (3.0, −2.0) px were recovered exactly. Imposed shifts of
  (1.4, 2.6) px were recovered as (1.419, 2.568) for TRN and (1.419, 2.564) for JPL. The tolerance is 0.5 px.

| Tile (≈ lon band) | TRN E / N (m) | TRN \|s\| | TRN NCC | JPL E / N (m) | JPL \|s\| | JPL NCC |
|---|---|---|---|---|---|---|
| r0c0 N, 77.28–77.34 | +1.3 / +13.5 | 13.5 | 0.631 | −3.1 / +3.9 | 5.0 | 0.633 |
| r0c1 N, 77.34–77.40 | +23.0 / +22.9 | 32.5 | 0.646 | +18.5 / +13.1 | 22.7 | 0.646 |
| r0c2 N, 77.40–77.45 | +32.8 / +16.3 | 36.7 | 0.679 | +29.8 / +7.5 | 30.7 | 0.675 |
| r0c3 N, 77.45–77.51 | +30.7 / +18.7 | 36.0 | 0.466 | +24.4 / +5.8 | 25.0 | 0.466 |
| r1c0 S, 77.28–77.34 | −4.4 / +13.1 | 13.8 | 0.696 | −8.6 / +1.9 | 8.8 | 0.700 |
| r1c1 S, 77.34–77.40 | +7.7 / +20.1 | 21.5 | 0.670 | +3.4 / +10.7 | 11.2 | 0.672 |
| r1c2 S, 77.40–77.45 | +32.8 / +19.2 | 38.0 | 0.588 | +28.2 / +6.6 | 28.9 | 0.586 |
| r1c3 S, 77.45–77.51 | +43.5 / +23.1 | **49.2** | 0.351 | +38.4 / +6.3 | 38.9 | 0.349 |
| **whole** | **+17.2 / +17.4** | **24.5** | 0.608 | **+13.0 / +5.5** | **14.1** | 0.610 |

- **Every peak is adequate** (NCC ≥ 0.3) and none sits on the search edge. Sharpness is low (0.06–0.10), so the NCC
  surfaces are broad.
- **The pre-registered rule gives:**
  - **JPL: PASS.** The whole peak is 14.1 m and every tile is ≤ 40 m.
  - **TRN: UNRESOLVED.** The whole peak is 24.5 m, but one adequate tile (r1c3, the weakest at NCC 0.351 and sharpness
    0.055) is at 49.2 m. The rule needs zero such tiles for PASS and two or more for FAIL.
- **Interpretation (not a gate input).**
  - **East component:** in both DEMs it grows from about 0 m in the west to +30–44 m in the east. The DEM-to-DEM fits
    against HiRISE show no such trend.
  - **The trend runs along the illumination axis** (azimuth 270°, east–west). An NCC between real imagery and modelled
    shading is known to be biased along that axis, by albedo and by the unknown mosaicked sun.
  - **The north components agree.** For TRN they are +13 to +23 m. The HiRISE − TRN fits give +8 to +20 m N.
  - **Reading:** TRN probably sits 10–20 m south of the HiRISE/ortho frame, and JPL about 10 m less so. Both are below
    half a 40 m bundle cell. No correction was applied.
- **Same-family limitation:** the TRN DTM and the 6 m ortho are both soc_008. For TRN this check measures internal
  consistency, not absolute position.

## R4 vertical reference

- **TRN: UNVERIFIED.** The sources disagree with each other.
  - The file name says `MOLAtopography_DeltaGeoid`.
  - The FGDC metadata (`…_20m_Eqc_latTs0_lon0.xml`) says the elevations "refer to the Mars 2020 IAU Sphere with a
    radius of 3396190m". It also says the mosaic was shifted 183.3 m vertically to align with HRSC.
  - The ISIS/PDS3 labels give no vertical datum.
  - Indirect evidence: G4a found TRN − PLACES (areoid) of −1.4 m median at 12 rover positions, and HiRISE − TRN here is
    −0.9 m median. Both suggest areoid-like heights, but neither is an independent datum check.
- **JPL: UNVERIFIED.** The PDS4 label states no vertical datum.
- For a display that draws `y = h − h_min`, a constant datum offset does not change the relief.

## Gates

| Gate | Limit | JPL CTX DEM | TRN CTX DTM |
|---|---|---|---|
| R1 coverage | ≥ 98 % | 100 % ✔ | 100 % ✔ |
| R2 DEM–DEM MAD | ≤ 5 m | 0.36 m ✔ (not independent, see R2) | 0.36 m ✔ (HiRISE − TRN: 2.29 m) |
| R3 registration | ≤ 40 m, non-edge peak, or UNRESOLVED | PASS, 14.1 m ✔ | **UNRESOLVED** ✔, labelled (whole 24.5 m; tile r1c3 49.2 m) |
| R4 vertical reference | documented or labelled | UNVERIFIED ✔ | UNVERIFIED ✔ (metadata conflict recorded) |
| **Suitable, display only** | | **yes** | **yes, chosen** |

**Choice.** The pre-registered rule prefers the DEM that is native to the image CRS: eqc, lat_ts 0, lon_0 0,
R 3 396 190. That is TRN.

- The rule does not rank PASS above UNRESOLVED.
- Using JPL would mean warping its elevations across projections, from lat_ts 18.4663 to 0.
- Over this extent JPL ≈ TRN shifted by about 11 m (residual 0.04 m). So JPL would give the same relief, moved by
  less than 0.3 bundle cells.

## Bundle `5c4dd158f4cf` (analysis/regional_dem/5c4dd158f4cf/)

- **Grid:** the regional image CRS, `+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +R=3396190`.
  - x0 4 580 743.250853, which equals the image x0. y0 1 097 773.140188, which is the image y0 + 2 m.
  - 341 × 178 cells at 40 m projected posting; dx_ground 37.942 m, dy 40 m.
  - bounds lat 18.39998–18.52010, lon 77.27991–77.51002.
  - The grid covers the requested extent. The texture extends 4 m beyond it on the east and south.
- **Posting: 40 m.**
  - **Why not 20 m:** native 20 m would be 682 × 356 = 243 k vertices, over the ~150 k budget.
  - **Why 40 m:** it is an exact 2 × 2 mean of native cells, so there is no interpolation, and it gives 60.7 k vertices.
    A 20 m stereo DTM resolves relief only at a few posts (~60–100 m), so little real information is lost.
  - **Why not 30 m:** it would need interpolation.
  - **Why not 60 m:** 27 k vertices, but it drops detail the budget can afford.
- **Values:** h −2649.54 … −1789.96 m. Source NoData pixels: 0; NaN cells: 0; validity is 60 698 × `VALID`.
  NaN would propagate from any NoData cell in a 2 × 2 block; there was none to propagate.
- **Files:**
  - `dem.f32.bin`: little-endian float32, row-major, north row first.
  - `validity.u8.bin`.
  - `hillshade.png`: 341 × 178, az 315°, alt 45°.
  - `sources.json`: the TRN record, plus cross-check records for JPL, HiRISE and the 6 m ortho, each with role, URL,
    DOI or citation, CRS, vertical reference and limitations.
  - `manifest.json`.
  - `terrain.json`: TerrainMeta fields plus `role: display_only_regional_relief`, `crs_proj4`, `texture` (the
    `d3d62fc34c56/science_6m.jpg` grid), `validity_counts`, `source_window` and `gates`.
  - `analysis/regional_dem/index.json`.
- **Versioning:** version = sha256(`manifest.json`)[:12]. The manifest lists every data file.
  - `terrain.json` carries the version, so it cannot be in the manifest. Following the contract §2 convention it is
    pinned by `terrain_json_sha256` in `index.json`. The test checks both.
- **Reproducibility:**
  - `build` re-reads the DEM over HTTP each time.
  - Two builds gave `5c4dd158f4cf` with byte-identical files (sha256 of all 6 bundle files plus `index.json`).
  - Two `analyze` runs gave a byte-identical `checks.json`.
  - No hashed file contains a timestamp.
- **Not included, on purpose:** no `slope_deg.f32.bin`, no ortho copy, no POIs. The texture is the existing regional
  basemap.

## Limitations

1. **Display only.** Do not compute or show slopes, hazards, distances or routes from it. Features smaller than about
   100 m (rocks, small craters, ripples) are not represented, whatever the texture shows.
2. **Registration:** R3 for TRN is UNRESOLVED. The east component of the NCC shifts is probably illumination bias. A
   real 10–20 m north–south offset relative to HiRISE is plausible but unconfirmed.
3. **Not independent:** R2 compares two products that very likely share source data. HiRISE is the semi-independent
   check, and it shares USGS production with CTX.
4. **Vertical reference:** UNVERIFIED, with a documented metadata conflict.
5. **HiRISE − CTX:** shows a 0.67 m/km north–south tilt and local differences of a few metres (p05/p95 −6.5/+5 m).
   Neither surface is corrected.
6. **Where it lives:** the bundle is under `analysis/`, not `web/public/data/`. Its extra `terrain.json` fields are not
   yet in the contract.

## Staged plan for regional 3D in the web app (not done here)

1. **Sign-off (technical lead).**
   - Accept or reject: the gates, R3 = UNRESOLVED, R4 = UNVERIFIED.
   - Approve an additive CR for a `display_only_regional_relief` terrain role. It would cover `role`, `crs_proj4`,
     `texture` and `gates`, and the rule that routing and slope tools are disabled for this role.
2. **Data release.**
   - Copy `5c4dd158f4cf/` byte-for-byte to `web/public/data/regional_dem/5c4dd158f4cf/`, with an index whose path is
     `data/regional_dem/…`.
   - Add the `-text` rule for that path.
3. **Loader** (`web/src/regions.ts`). Mirror the regional basemap checks:
   - index → manifest hashes → version → `terrain_json_sha256`;
   - CRS must be eqc lat_ts 0 lon_0 0 and equal to the loaded basemap's;
   - `texture.regional_basemap_version` must equal the loaded basemap version;
   - otherwise show `DATASET INTEGRITY` / `DATASET_VERSION_MISMATCH`.
4. **Mesh.**
   - Reuse `buildTerrainMesh`. NaN vertices are skipped, so any future NoData shows as holes, never filled.
   - Compute UVs from projected coordinates into `science_6m.jpg`: `u = (E − tex.x0)/(tex.nx·tex.dx)`,
     `v = 1 − (tex.y0 − N)/(tex.ny·tex.dy)`, with clamp-to-edge. `cellUv` assumes a texture on the DEM grid, so it
     does not apply here.
   - SCENE x uses CR-005 `k_x = dx_ground_m/dx_proj = 0.9486`.
   - VE 1 shows the 860 m of relief. Any VE ≠ 1 must show the `VERTICAL EXAGGERATION ×VE` label.
5. **UI text.**
   - Label: "Regional relief: USGS CTX DTM 20 m shown at 40 m, display only, vertical reference unverified,
     registration unresolved (≈ 25 m)".
   - Hide route, slope and hazard controls in this view.
   - Keep the claims policy (§4).
6. **Nesting local views.** ROI-A (JPL 20 m) and M0–A (HiRISE 2 m) stay separate scenes or insets. Do not stitch them
   into the regional mesh: they differ vertically by about 1–3 m and have their own frames.
7. **Tests.** A loader unit test (hash and version mismatch), a vertex-count and NaN-hole test, and an e2e screenshot.
   Check frame time on a low-end GPU; 60.7 k vertices and about 120 k triangles are expected to be light.
