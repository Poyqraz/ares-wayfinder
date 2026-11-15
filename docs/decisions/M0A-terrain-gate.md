# M0–A terrain analysis: validation gate and implementation plan (2026-11-14)

Branch `feat/m0a-terrain` from `s3-rc1` (d7b8853). **Planning document. No routing is enabled by it.**
Live demo, ROI-A/ROI-B CTX bundles, the HiRISE display bundle, `web/public/data/index.json`,
`core/`, the cost model and the ARES-1 catalog `572fba1ce61f` are not touched by this workstream.

## 1. What is being connected (facts from catalog `572fba1ce61f`)

| End | Position used | What it is | What it is not |
|---|---|---|---|
| Start (M0) | `waypoint:M0` = rover position at the Bearwallow drop, 18.452728 N, 77.408336 E (MMGIS, sol 674) | a real rover position at the depot | not a tube center (all ten are `NOT_AVAILABLE`) |
| Goal (A) | Skinner Ridge sampling rover position, 18.458931 N, 77.406171 E (Initial Report) | a real rover position at the outcrop | not the core or rock point |

- **Distance:** great-circle 387 m (376 m to the Wildcat Ridge position). The ten drop positions lie within 61 m of each other.
- **Area:** the box from `ares1/docs/dem_coverage.json` is lat 18.44952–18.46193, lon 77.40289–77.41160, about 1.4 × 0.9 km.
- **Not covered by the current bundles:** ROI-A and ROI-B both lie east of lon 77.42.

**Scale problem.** At the 20 m CTX posting the whole route is about 19 cells, too coarse for a meaningful
distance-versus-terrain comparison across delta-front scarps. The USGS HiRISE 1 m DTM gives about 390 cells. HiRISE is
display-only in the live app (CR-003), so using it for analysis is a new, explicit decision (gate G5).

## 2. Data sources (official only; read by HTTP range, rasters never committed)

| Id | Product | Known from headers / earlier probes | Must be verified |
|---|---|---|---|
| `ctx_dem_20m` | JPL `M20_JezeroCrater_CTXDEM_20m.tif` (Mangold et al. 2021) | eqc, R 3 396 190 m, lat_ts 18.4663, 20 m; box 100 % valid; slope p95 17.5°, max 27.7° | vertical reference (UNVERIFIED in the ROI-A bundle) |
| `trn_ctx_dtm_20m` | USGS TRN `JEZ_ctx_B_soc_008_…DeltaGeoid_20m_Eqc_latTs0` | **lat_ts = 0** (x stretched by 1/cos 18.46° ≈ 1.054); 100 % valid | independent cross-check DEM |
| `hirise_dtm_1m` | USGS TRN `JEZ_hirise_soc_006_DTM_…DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif` | **lat_ts = 0**; mosaic of stereo pairs C, W, DL in this box; 100 % valid; slope max 56.9° | pair seams inside the corridor; blend band |
| `hirise_ortho_25cm` | USGS TRN `JEZ_hirise_soc_007_orthoMosaic_25cm_Ortho_blend120.tif` | display imagery | DTM↔ortho registration |
| `places_positions` | rover positions from the catalog (10 drops, 2 sampling) with PLACES elevations | elevation reference "areoid (per PLACES)" | elevation residuals against each DEM |

## 3. Acceptance gates (all evidence produced by scripts; human sign-off on G4 and G5)

| Gate | Test | Pass condition | If it fails |
|---|---|---|---|
| **G1 geometry** | read the CRS, R, lat_ts, transform and PixelIsArea of all four rasters from headers; convert the box and both endpoints; apply `roi.ground_dx` once (essential for lat_ts = 0) | window inside every raster; endpoint roundtrip < 1e-6 m; ground spacing recorded per DEM | stop |
| **G2 pixels** | windowed read with a 1-cell halo; validity codes (`roi.validity`); Horn slope | ≥ 98 % valid, **both endpoints and the straight corridor valid**; no NoData filled | move the box, or stop |
| **G3 cross-DEM** | HiRISE resampled to 20 m vs the JPL CTX DEM and the TRN CTX DTM: elevation difference (median, MAD) and slope correlation | median offset reported; MAD ≤ 5 m; no seam step > 2 m along the corridor | label the seam; if it crosses the corridor → stop or reroute the box |
| **G4 registration** (human) | DTM-hillshade vs ortho NCC (reuse `registration_check.py` method) per DEM; PLACES elevation residuals at the 12 rover positions | horizontal shift ≤ 1 analysis cell (HiRISE 1–2 m resampled grid: ≤ 2 cells), residual spread ≤ 3 m | registration stays **UNRESOLVED** (like ROI-A S-4): routing may be computed for review but is labelled, never shown as validated |
| **G5 analysis DEM** (human) | choose the routing grid: HiRISE resampled to 2 m (recommended) or CTX 20 m | written decision + CR (HiRISE moves from display-only to analysis input for this ROI only) | default to CTX 20 m with a "coarse: about 19 cells" warning |
| **G6 cost-model domain** | fraction of edges with \|g\| > g_max = 0.45 in the corridor; connectivity M0 → A | a connected path exists, or `NO_ROUTE` is reported as the result | `NO_ROUTE` is a valid outcome; never relax g_max to force a route |

**Hard stops** (no routing prototype): G1 or G2 fail; a HiRISE seam step > 2 m crossing every corridor; no
independent second DEM agreeing within G3.

## 4. Implementation plan (smallest independently testable prototype; only after G1–G3 pass)

1. **`pipeline/m0a/validate.py`:** gates G1–G3 plus the G4 numbers.
   - Reuses `roi.window_from_proj_bounds`, `roi.ground_dx`, `roi.horn_slope_deg` and `roi.validity`.
   - Does **not** add a key to `t03_validate.ROIS`, because `context_overview` and the bundle tooling iterate over it.
   - Output: `analysis/m0a/validation/` (report, overlay PNGs, numbers JSON).
2. **`pipeline/m0a/bundle.py`:** a versioned bundle in the existing terrain format (contract §9.2), written to
   `analysis/m0a/bundle/<version>/`.
   - It never writes to `web/public/data/` or `index.json`. `t04_bundle.py` writes the live index, so it is not reused as is.
3. **Routing:** the existing TS core (`core/`, A* + Dijkstra, anisotropic octile, m_min-scaled heuristic) runs
   unchanged on the M0–A grid through a Node script in `analysis/m0a/`.
4. **Independent checks:**
   - the existing Python oracle method (`oracle.route_cost`, separate edge builder + SciPy Dijkstra) on the same grid;
   - TS↔Python cost parity < 1e-9 relative;
   - distance mode equal to the independent shortest path;
   - terrain mode ≤ distance mode in flat-equivalent cost;
   - no NoData cell and no corner cut on either route;
   - both directions computed separately.
5. **Report:** both routes with length, ascent/descent, max edge grade and flat-equivalent cost, plus the limits:
   - "Rover positions, not rock or tube points";
   - "Lowest relative terrain cost under the stated cost model; not an EVA safety or energy claim";
   - the G4 registration status.
6. **Not in this step:** integration into the live app (needs your explicit approval), a B route, and any change to ROI-A.

## 5. Order and time (deadline: submission 15 Nov 23:59 Konya)

| Step | Effort | Depends on |
|---|---|---|
| G1 + G2 header and pixel probe (CTX 20 m, TRN CTX, HiRISE 1 m) | 1.5 h | network access to the USGS/JPL S3 buckets |
| G3 cross-DEM + seam check | 1.5 h | G2 |
| G4 numbers + overlays for human review | 1 h | G2 |
| G5/G6 decision, then bundle + route prototype + oracle parity | 3 h | G1–G3 pass, G5 decided |
