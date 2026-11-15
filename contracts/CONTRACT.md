# Ares Wayfinder — Data & Interface Contract v1.0.0

Normative. Owner: Poyraz (technical lead). Machine-readable mirror: `contracts/types.ts`.
Neither coding agent may change this file or `types.ts` silently. Changes go through a
change request (CR) approved by the owner; semver applies (major = breaking).

## 1. Coordinate frames

| Frame | Definition |
|---|---|
| `MARS_GEO` | Planetocentric latitude, **east-positive** longitude, displayed in −180..180. Sphere radius from source metadata (CTX DEM: 3396190 m). Never GeoJSON/WGS84. Display only. |
| `PROJ` | Source Equirectangular projection in metres: `E = R·(λ−λ0)·cos(φ_ts)`, `N = R·φ`, false easting/northing 0. CTX DEM: `φ_ts` = 18.4663°, `λ0` = 0°. Values are read from the file header, never hard-coded in the pipeline. |
| `ROI_GRID` | `(row, col)`, row 0 = **north** edge, col 0 = west edge. `(x0, y0)` = **top-left corner** of the ROI window (pixel-is-area). Cell centre: `E = x0 + (col+0.5)·dx_proj`, `N = y0 − (row+0.5)·dy_proj`. |
| `SCENE` | Three.js, Y-up, metres: `x = (E − E_c)·k_x` (CR-005: `k_x = dx_ground_m/dx_proj` when it differs from 1 by more than 0.1 %, else 1), `z = −(N − N_c)` (north = −Z), `y = (h − h_min)·VE`. `E_c = x0 + nx·dx_proj/2`, `N_c = y0 − ny·dy_proj/2`. If VE ≠ 1, the UI must show `VERTICAL EXAGGERATION ×VE`. |

**Single source of transforms:** `core/src/coords.ts`. The web app imports it and never writes its own transform or applies `cos(lat)`.

**Ground spacing:** `dy_ground_m = dy_proj`, `dx_ground_m = dx_proj · cos(lat_centre)/cos(φ_ts)`. Computed **once** by the pipeline and written to `terrain.json`. Consumers never recompute it.

**Window rounding (normative):** the ROI lat/lon box is converted to fractional source pixel indices, then expanded to whole pixels: `col0 = floor(col_min)`, `col1 = ceil(col_max)` (exclusive), likewise rows. `nx = col1−col0`, `ny = row1−row0`, `x0 = X_src + col0·dx_proj`, `y0 = Y_src − row0·dy_proj`. `x0, y0` are always a real source pixel corner. A 1-cell halo is read around the window for slope only; it is not part of the bundle grid.

## 2. Terrain bundle — `web/public/data/<roi_id>/<dataset_version>/`

`terrain.json` fields: see `TerrainMeta` in `types.ts`. Binary files are little-endian, row-major, starting at the north row, `nx·ny` values:

| File | Type | Meaning |
|---|---|---|
| `dem.f32.bin` | Float32 | Elevation in metres; NaN = no source data |
| `slope_deg.f32.bin` | Float32 | Horn 3×3 slope in degrees using separate ground dx/dy; NaN = undefined |
| `validity.u8.bin` | Uint8 | 0 `VALID`, 1 `NODATA_SOURCE`, 2 `OUTSIDE_ROI`, 3 `VALID_SLOPE_UNDEFINED` |
| `ortho.jpg` | JPEG | CTX ortho resampled onto this grid (display only) |
| `hillshade.png` | PNG | Derived from `dem` |
| `pois.json` | JSON | `Poi[]`, each with a source citation |
| `sources.json` | JSON | `SourceRecord[]` |
| `manifest.json` | JSON | Sorted `{file, sha256}` for every file above |

`dataset_version` = first 12 hex characters of sha256(`manifest.json`). Golden test files carry the `dataset_version` they were built from. A mismatch fails the test, and the UI shows `DATASET_VERSION_MISMATCH`.

**Routability depends only on DEM NoData:** validity 0 and 3 are routable, 1 and 2 are not. Slope is used only when the optional cell slope gate is enabled; then a NaN slope blocks the cell. Policy blocks (slope gate, `|grade| > g_max`) are computed at runtime by `core`, never baked into the bundle.

## 3. Route API (pure function in `core`)

Input `RouteRequest`, output `RouteResult` (see `types.ts`).

- 8-connected grid. Horizontal edge length `L_h` = `dx_ground_m` (E/W), `dy_ground_m` (N/S), `sqrt(dx*dx+dy*dy)` (diagonal).
- A diagonal move needs both orthogonal neighbour cells routable (no corner cutting). There is no goal exception.
- Edge grade `g = (z_v − z_u)/L_h`, signed and directed.
- Mode `distance`: cost = `L_h`. Mode `terrain`: cost = `L_h · m(g)`, `m(0) = 1`; edges with `|g| > g_max` are removed.
- `cost_flat_equiv_m` = Σ cost, in **flat-ground-equivalent metres**. In `distance` mode it equals `length_horizontal_m`.
- A* heuristic: anisotropic octile distance × `m_min`, where `m_min` = min of `m` over `[−g_max, g_max]` × (1 − 1e−9).
- Deterministic: heap key `(f, h, row·nx + col)`; relax only on improvement > 1e−12.
- `start == goal` → `OK`, one cell, cost 0.

Status codes: `OK`, `NO_ROUTE`, `INVALID_ENDPOINT_NODATA`, `ENDPOINT_OUTSIDE_ROI`, `ENDPOINT_BLOCKED_BY_POLICY`, `DATASET_VERSION_MISMATCH`.

## 4. Claims policy (binding on UI text)

Allowed: "lowest relative terrain cost under the stated assumptions"; "optimal for this cost model on this DEM, verified against Dijkstra"; "features smaller than the DEM resolution are not visible".
Forbidden: safe / EVA-certified, probabilities, ETA or minutes, O₂ / energy / kcal, "obstacle-free", radiation or thermal safety, "NASA slope limit". Thresholds are labelled "demonstration parameter, not a safety limit". Image resolution (5 m) never implies terrain resolution (20 m posting).

## 5. Change log

- 1.0.0 (2026-11-14): initial freeze.
- CR-004 (2026-11-14, additive, approved in principle): optional `Poi.evidence` (`PoiEvidence`,
  schema `ares-poi-evidence/1`), see `docs/decisions/CR-004-poi-evidence.md`. No existing field
  changes; data without `evidence` stays valid. `CONTRACT_VERSION` stays `"1.0.0"` for now, because
  loaders compare it strictly with each bundle's `contract_version`. Bumping it to `1.1.0` (together
  with CR-001/CR-002) is decided at the S2 release.
- CR-005 (2026-11-15, display-only, requested by the technical lead in the S4 acceptance review): SCENE `x` and the
  2D map's x axis are ground metres east-west (`k_x = dx_ground_m/dx_proj`) on grids whose `lat_ts` is far from their
  latitude (M0–A, lat_ts 0: `k_x` = 0.94857, previously drawn 5.4 % too wide). Grids within 0.1 % keep `k_x = 1`
  (ROI-A: 1.00006), so legacy scene coordinates are bit-identical. PROJ, ROI_GRID, route costs, lengths and
  profiles are unchanged. See `docs/decisions/CR-005-scene-ground-scale.md`.
