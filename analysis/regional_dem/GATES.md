# Regional DEM gates (written before any candidate DEM pixel was read; only headers and labels had been read)

Purpose: decide whether an official broad-area Mars DEM can carry a **display-only** regional 3D relief view over
the app's regional science extent. Nothing here is for routing, hazards or slopes shown to the user.

- **Extent:** the regional science extent of the regional basemap `analysis/regional/d3d62fc34c56/regional.json`,
  lat 18.40–18.52 °N, lon 77.28–77.51 °E (planetocentric, east-positive), converted with each DEM's own header CRS and
  expanded to whole source pixels by the contract window rounding (`roi.window_from_proj_bounds`).
- **Candidates:** `ctx_dem_20m` (JPL Mars 2020 Science Investigation CTX DEM mosaic, Mangold et al. 2021) and
  `trn_ctx_dtm_20m` (USGS Mars 2020 TRN CTX DTM mosaic `JEZ_ctx_B_soc_008`), URLs as in `pipeline/m0a_validate.py`.
- **Hard rules (not gates, never relaxed):** no NoData is filled or interpolated; no relief is synthesised; no local
  DEM (ROI-A, M0–A, HiRISE) is stretched over the region; the bundle never enters `web/public/data` in this work.

## Gates

| Gate | Test | Limit |
|---|---|---|
| **R1 coverage** | Share of the DEM's native cells in the extent window that hold a finite elevation (not the nodata value, not < −1e30) | **≥ 98 %** |
| **R2 DEM–DEM** | `d = TRN − JPL` on the TRN native 20 m grid over the extent (JPL warped bilinearly onto it; cells where either is NoData are excluded). MAD = median(\|d − median(d)\|), unscaled, as in `m0a_g3g4.py` | **MAD ≤ 5 m** |
| **R3 registration** | Each DEM's hillshade vs the regional CTX 6 m orthomosaic, existing NCC method (`registration_check.surface/peak`), see below | **\|shift\| ≤ 40 m (2 DEM cells) with an adequate non-edge peak, or explicitly UNRESOLVED** |
| **R4 vertical reference** | Read from the product's own label/metadata | **documented, or labelled `UNVERIFIED` with the evidence that exists** |

Reported but **not gated**: median, p05/p95 of `d`; a plane + gradient regression of `d` (tilt and implied relative
horizontal shift); per-tile medians; the same statistics for HiRISE DTM 1 m (soc_006, averaged to 20 m, cells with
100 % HiRISE coverage only) minus each CTX DEM where HiRISE overlaps. A \|median\| above 10 m is carried into R4 as a
vertical-reference finding, because a constant offset does not change displayed relative relief (`y = h − h_min`).

### R3 method, fixed in advance

- Common grid: 12 m (2 × 2 block mean of the 6 m ortho science window, same pixel corners as `science_6m.jpg`).
- DEM hillshade computed on the DEM's native grid with ground spacing (`roi.ground_dx`), then warped bilinearly to the
  12 m grid. Ortho smoothed (Gaussian σ 2 px), both high-passed (minus Gaussian σ 15 px), as in `registration_check.py`.
- Sun azimuth (0–345° step 15°) and altitude (30/45/60°) chosen by global NCC at zero shift (known bias, reported).
- Search ±10 px = ±120 m on both axes; parabolic sub-pixel refinement; tiles 4 × 2 over the inner region, plus whole.
- Synthetic sign check: the chosen hillshade shifted by known amounts must be recovered within 0.5 px; otherwise R3 is
  UNRESOLVED (no verdict possible).
- A peak is **adequate** if NCC ≥ 0.3 and it is not on the search edge (same limits as `registration_check.py`).
- **R3 = PASS** if the whole-extent peak is adequate with \|shift\| ≤ 40 m and no adequate tile exceeds 40 m.
  **R3 = FAIL** if the whole-extent peak is adequate with \|shift\| > 40 m, or ≥ 2 adequate tiles exceed 40 m.
  **R3 = UNRESOLVED** otherwise. PASS and UNRESOLVED satisfy the gate; UNRESOLVED must be written into the bundle.
- Limitation stated up front: the TRN DTM and the 6 m ortho are one USGS product family (soc_008), so for the TRN
  DTM this measures internal consistency, not absolute position.

## Decision rule

A DEM is **suitable for display-only regional relief** if R1, R2, R3 (PASS or UNRESOLVED) and R4 all hold. R2 is
pairwise: if it fails, neither DEM is corroborated and **nothing is built**. If both pass, prefer the DEM whose native
CRS equals the regional image CRS (eqc, lat_ts 0, lon_0 0, R 3 396 190 m), so no elevation is resampled across
projections; if still tied, the higher R1 share.

## Bundle rules (if a DEM passes)

- Grid in the regional image CRS. Posting **40 m** = 2 × 2 block mean of the 20 m native cells (any NoData cell in a
  block → NoData). Reason: 20 m over the extent is ~ 680 × 360 ≈ 245 k vertices, above the ~150 k WebGL budget;
  40 m is ~ 61 k, an exact native aggregation (no interpolation), and a 20 m stereo DTM already has an effective
  resolution of a few posts. If the chosen DEM were not native to that CRS it would be warped with GDAL `average`
  to 40 m and any cell touching NoData set to NoData.
- Files: `dem.f32.bin`, `validity.u8.bin`, `hillshade.png`, `terrain.json` (TerrainMeta, `roi_id "regional"`, role
  `display_only_regional_relief`), `sources.json`, `manifest.json`; version = first 12 hex of sha256(manifest.json);
  no timestamps in hashed files; built twice to confirm the same version.
