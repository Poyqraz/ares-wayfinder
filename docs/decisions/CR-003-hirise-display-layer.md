# CR-003 — HiRISE display layer (canonical specification)

| | |
|---|---|
| Status | **APPROVED IN PRINCIPLE** (technical lead, 2026-11-14). This document is the single authoritative interface. It supersedes any other draft, including any frontend-side schema proposed in chat; none was found in any branch. |
| Scope | Additive, **display-only** asset. Outside the routing contract. |
| Unchanged | `contracts/` (v1.0.0; `git diff contract-v1.0.0 -- contracts` is empty), `@ares/core` routing, CTX `roi_a/fc22a0c8a91f/terrain.json` and all CTX bundle files, the analysis index `web/public/data/index.json`. |
| Bundle described | `web/public/data/hirise/roi_a/e88cfab318e6/` as committed on `feat/data-core` (built by `pipeline/hirise_bundle.py`, validated by `pipeline/hirise_validate.py`, `pipeline/tests/test_hirise_bundle.py`, `pipeline/probes/hirise/offline_loader_check.mjs`). |

## 1. Files and URLs

All URLs are relative to the web public root (Vite `public/`), so `/data/...` in the browser.

| URL | Bytes | Integrity |
|---|---|---|
| `/data/hirise/index.json` | 266 | discovery file; not hashed (same as the CTX index) |
| `/data/hirise/roi_a/e88cfab318e6/manifest.json` | 10 088 | sha256 = `index.roi_a.manifest_sha256` |
| `/data/hirise/roi_a/e88cfab318e6/dtm_2m.f32.bin` | 2 664 000 | sha256 + bytes in `manifest.files[]` |
| `/data/hirise/roi_a/e88cfab318e6/dtm_4m.f32.bin` | 666 000 | sha256 + bytes in `manifest.files[]` |
| `/data/hirise/roi_a/e88cfab318e6/ortho_0p5m.jpg` | 2 264 096 | sha256 + bytes in `manifest.files[]` |
| `/data/hirise/roi_a/e88cfab318e6/ortho_1m.jpg` | 752 487 | sha256 + bytes in `manifest.files[]` |

No other files belong to the bundle. The folder contains exactly the manifest plus the four listed files.

## 2. `index.json` (exact)

```json
{
 "roi_a": {
  "dataset_version": "e88cfab318e6",
  "path": "data/hirise/roi_a/e88cfab318e6/",
  "manifest_sha256": "e88cfab318e6727551a5413dedc82e32a9c280c66cbaa36b6652cc1cbeb839ff",
  "aligned_to_ctx_dataset_version": "fc22a0c8a91f",
  "role": "display_only"
 }
}
```

- `path` ends with `/`. Browser URL = `"/" + path + fileName`.
- `role` must equal `"display_only"`, or the layer is rejected.

## 3. Version and hashes

- `manifest_sha256` = lowercase hex SHA-256 of the **exact bytes** of `manifest.json` (UTF-8, LF only,
  no BOM). Do not re-serialize before hashing.
- `dataset_version` = the first 12 hex characters of `manifest_sha256`, and equals the folder name.
- Each `manifest.files[i]` = `{ "file", "bytes", "sha256" }`: SHA-256 of the exact file bytes and their length.
- `manifest.json` is strict JSON (no bare `NaN`/`Infinity`; the token "NaN" appears only inside text).

## 4. `manifest.json` (fields a frontend may rely on)

| Field | Type | Value in e88cfab318e6 |
|---|---|---|
| `schema` | string | `"ares-hirise-display-layer 0.1 (proposed in CR-003; not part of contract v1.0.0)"` |
| `layer_role` | string | starts with `"DISPLAY ONLY."` |
| `roi_id` | string | `"roi_a"` |
| `aligned_to_ctx_bundle` | `{roi_id, dataset_version}` | `{"roi_a", "fc22a0c8a91f"}` |
| `crs` | string | `+proj=eqc +lat_ts=18.4663 +lat_0=0 +lon_0=0.0 +x_0=0 +y_0=0 +R=3396190.0 +units=m +no_defs` |
| `extent_proj_m` | `{x_min, x_max, y_min, y_max}` | 4353640, 4355120, 1091940, 1093740 |
| `bounds_geo` | `{lat_min, lat_max, lon_min, lon_max}` | copied from the CTX bundle |
| `grids.<id>` | object | see §5; ids `dtm_2m`, `dtm_4m`, `ortho_0p5m`, `ortho_1m` |
| `elevation.vertical_reference` | string | starts with `"UNVERIFIED"` |
| `elevation.adjusted_to_ctx` | bool | `false` |
| `elevation.ctx_minus_hirise_at_20m_m` | `{median, mean, std, p01, p99, max_abs, cells, method}` | median 1.664, std 2.071 |
| `elevation.line_artifacts_1m_source` | `{count, step_m_median, step_m_max, ...}` | 21, 0.061, 0.119 |
| `registration.offset_hirise_minus_ctx_m` | `{east, north}` | 1.24, −4.27 |
| `registration.estimated_uncertainty_m` | number | 2.5 |
| `registration.applied_correction_m` | `{east, north}` | 0, 0 |
| `sources[]` | `{role, product_file, url, doi, title, publisher, authors, published, mission, instrument, source_crs, source_transform, source_size_px, source_dtype, source_nodata, source_block, read_window_col_row_w_h, read_window_nodata_pixels, license}` | DTM 10.5066/P9REJ9JN, ortho 10.5066/P9QJDP48 |
| `citations[]`, `credit` | strings | shown in the provenance panel |
| `processing[]`, `limitations[]` | strings | shown in the provenance panel |
| `files[]` | `{file, bytes, sha256}` | 4 entries |

Unknown extra fields must be ignored. A missing required field rejects the layer.

## 5. Raster layout (exact)

`grids.<id>` = `{ nx, ny, dx_proj, dy_proj, dx_ground_m, dy_ground_m, x0, y0, n_invalid, valid_fraction, file, encoding, … }`.

| id | nx × ny | dx_proj = dy_proj | dx_ground_m | Content |
|---|---|---|---|---|
| `dtm_2m` | 740 × 900 | 2.0 | 2.000343 | elevation |
| `dtm_4m` | 370 × 450 | 4.0 | 4.000686 | elevation (2×2 mean of `dtm_2m`) |
| `ortho_0p5m` | 2 960 × 3 600 | 0.5 | 0.500086 | image (width × height) |
| `ortho_1m` | 1 480 × 1 800 | 1.0 | 1.000171 | image (2×2 mean of `ortho_0p5m` before JPEG) |

All four share `x0 = 4353640`, `y0 = 1093740` (upper-left **corner** of the upper-left cell, projected metres).

**DTM binaries (`*.f32.bin`).** Verified on the committed bytes: they hold **one scalar elevation per
cell, nothing else.** There are no E/N tuples, no header and no padding.
- IEEE-754 float32, **little-endian**; length = `nx · ny · 4` bytes (2 664 000 = 740 · 900 · 4).
- Row-major; index `i = row · nx + col`; **row 0 = north edge**, **col 0 = west edge**.
- The value is the area-averaged elevation in metres over the cell
  `E ∈ [x0 + col·dx, x0 + (col+1)·dx]`, `N ∈ [y0 − (row+1)·dy, y0 − row·dy]`; it is attributed to the
  cell centre `E = x0 + (col + 0.5)·dx_proj`, `N = y0 − (row + 0.5)·dy_proj`
  (`@ares/core` `cellCenter(grid, {row, col})` with the HiRISE grid fields).
- **NoData = NaN.** In e88cfab318e6 there is no NaN (`n_invalid = 0`). Loaders must still handle NaN:
  skip any triangle with a NaN corner, and never interpolate or fill.

**Images (`*.jpg`).** Baseline JPEG, **1 component (grayscale)**, 8-bit; pixel width = `nx`, height = `ny`.
Pixel row 0 = north edge, column 0 = west edge, and pixel (row, col) covers the cell defined above.
This is the same orientation convention as the CTX bundle's `ortho.jpg`.
**NoData:** cells counted in `n_invalid` (0 here). DN 0 in a decoded JPEG is **not** a NoData marker,
because lossy compression decodes a few dark valid pixels to 0 (41 in `ortho_0p5m`).

## 6. Coordinate mapping into the 3D scene

- Use `@ares/core` only (`cellCenter`, `projToCell`, `projToScene`). Never write a new transform or `cos(lat)`.
- Build the HiRISE grid object from `grids.<dtm id>`: `{nx, ny, x0, y0, dx_proj, dy_proj}`. Its extent
  equals the CTX extent exactly, so `projToScene` puts it at the same scene origin as CTX.
- **Vertical origin:** call `projToScene(..., h, ve)` with `h_min` = **CTX `terrain.json.h_min`**
  (−2588.896), not the HiRISE minimum. Switching CTX ↔ HiRISE then shows the true height difference
  (median 1.66 m × VE) rather than hiding it. HiRISE heights are never shifted.
- Mesh: one vertex per DTM cell centre. UV per vertex = the texel centre of the same ground point:
  `u = (E − x0) / (nx_tex · dx_tex)`, and the fraction from the north edge `s = (y0 − N) / (ny_tex · dy_tex)`.
  Feed `s` through the same image-orientation code path that already renders the CTX `ortho.jpg`
  correctly (`cellUv` + `flipY = false` in `terrainMesh.ts`), because both images use row 0 = north.
  Orientation must be proven by a test (§10).

## 7. Integrity and loading algorithm

1. `GET /data/hirise/index.json`. Parse it. Require `roi_a`, `role === "display_only"`, and
   `aligned_to_ctx_dataset_version` equal to the **currently loaded CTX** `dataset_version`.
2. `GET "/" + path + "manifest.json"` as bytes. Require `sha256(bytes) === manifest_sha256` and
   `manifest_sha256.slice(0, 12) === dataset_version`. Then parse it.
3. Require the §4 fields: `adjusted_to_ctx === false`, `applied_correction_m` = 0,0, and
   `aligned_to_ctx_bundle.dataset_version` = the CTX version. Require
   `extent_proj_m` = the CTX extent (x0, y0, x0 + nx·dx, y0 − ny·dy), with a tolerance of 1e-6 m.
4. Choose a level:
   - **high** = `dtm_2m` + `ortho_0p5m`;
   - **low** = `dtm_4m` + `ortho_1m`, used when `gl.MAX_TEXTURE_SIZE < 4096` or the user picks it.
   Fetch only the two chosen files.
5. For each fetched file, require byte length and SHA-256 equal to its `files[]` entry.
   - DTM: require length = `nx·ny·4`, then build `new Float32Array(copy, 0, nx·ny)` (little-endian
     platforms; on a big-endian platform use `DataView.getFloat32(i·4, true)`).
   - JPEG: require the decoded size = `nx × ny`.
6. **Any failure** in steps 1–5: do not show HiRISE, stay in CTX mode, and show the non-blocking notice
   `"HiRISE layer unavailable (<reason>). Showing CTX 20 m."` A HiRISE failure must never block CTX,
   2D, routing or the integrity state of the CTX bundle.

Everything needed is inside `web/public/data/hirise/`. Loading needs **no network beyond the local
server, no source GeoTIFFs and no `pipeline/cache/`**. This was verified offline (§10).

## 8. Modes, defaults and fallback

- **CTX 20 m is the default mode** on every load. HiRISE is shown only after the user selects it and
  all of §7 passes.
- Fallback to CTX is automatic on any failure, on a WebGL error or context loss, or if the texture or
  mesh cannot be created. Selecting CTX again must restore the existing CTX scene exactly.
- The toggle label is `"Terrain: CTX 20 m (analysis) | HiRISE 2 m (display only)"`. In low level the
  label reads `HiRISE 4 m (display only)`.

## 9. Route draping (visualization only)

- Input is unchanged: the CTX `RouteResult.vertices_proj` (E, N) and `profile[].s_m`. Nothing is
  recomputed. No second router.
- Draw points: densify every route segment at ≤ 1 m horizontal steps; these extra points are for drawing only.
- Height of each draw point = the HiRISE surface **exactly as rendered**: barycentric interpolation on
  the same triangles as the HiRISE mesh (cells split along the SW–NE diagonal, as in
  `buildTerrainMesh`), plus a constant scene lift of ≥ 0.5 scene units.
- **Prohibited:** substituting CTX heights for individual points, mixing CTX and HiRISE heights in one
  line, or filling NaN. If any draw point would need a NaN or out-of-grid HiRISE value, do not draw the
  HiRISE-draped route; show the route in CTX mode with the notice
  `"Route cannot be drawn on HiRISE here; showing CTX."`
- Flyalong in HiRISE mode: the playhead stays defined by the CTX horizontal distance `s_m`; draw-point `s`
  is linearly interpolated between CTX vertices. Camera clearance is measured above the HiRISE draw line.
- **Never replaced by HiRISE values:** route length, ascent/descent, the elevation profile panel, model
  costs, the relation (LOWER/EQUAL/…), HUD numbers, or any value in `RouteResult`.
- Required on-screen label in HiRISE mode:
  `"Route computed on CTX 20 m; drawn on HiRISE (display only). Not validated for human walking."`

## 10. Required labels and provenance (HiRISE mode)

Values come from the manifest at runtime (shown in brackets), never hard-coded:
- `"HiRISE DTM and orthomosaic, USGS Astrogeology (doi:10.5066/P9REJ9JN, doi:10.5066/P9QJDP48). Display only."`
- `"Vertical datum UNVERIFIED. CTX − HiRISE median [+1.66] m (SD [2.07] m); HiRISE heights not adjusted."`
- `"Horizontal offset vs CTX ortho: [1.24] m E, [4.27] m S (±[2.5] m); no correction applied."`
- `"DTM shows [21] east–west line artifacts ([0.06]–[0.12] m); processing artifacts, not terrain."`
- `"HiRISE images acquired 2006–2017, before the 2021 landing."`
- The existing `VERTICAL EXAGGERATION ×N`, `Coordinates UNVERIFIED (S2)` and the G1/S-4 / S6 notes stay.
- The provenance panel lists `citations[]`, `credit`, `processing[]` and `limitations[]`.

## 11. Test requirements (frontend gate)

1. Integrity: a valid bundle loads. Then, each in turn:
   - one flipped byte in each of the 4 files;
   - a changed manifest byte;
   - a wrong `aligned_to_ctx_dataset_version`;
   - `role` ≠ `display_only`.

   Each must produce CTX mode plus the notice, with the CTX numbers unchanged (969.161 m,
   1093.229 / 1058.299, LOWER).
2. Default: a fresh load is in CTX mode.
3. Layout: the decoded DTM length is 666 000, and sample values match the manifest checks. Reference
   cell heights (row, col of `dtm_2m`): Landing (220, 426) −2569.881, Rochette (631, 243) −2574.548,
   Roubion (722, 448) −2584.897, Sid (242, 470) −2568.601 (±0.001 m).
4. Orientation: render or sample the HiRISE texture. A dark/bright feature check against the CTX
   `ortho.jpg` must pass, and a north–south flipped variant must fail. The data-side flip test gives
   correlations 0.829 as-is vs −0.193 flipped.
5. Draping: every draw point is ≥ mesh height + lift at VE ×1/×5/×10. No CTX height appears in the
   HiRISE line. A NaN injected in a test grid gives the CTX-route notice.
6. Separation: in HiRISE mode the numbers panel, profile and HUD values are identical to CTX mode.
7. Fallback: a simulated WebGL context loss or texture failure returns to CTX. Low level is chosen when
   `MAX_TEXTURE_SIZE < 4096` (mocked).
8. Offline: the e2e test runs with network blocked except the local dev server.
9. Labels: all §10 strings are visible in HiRISE mode, with values matching the manifest.

## 12. Integration risks

- **GPU memory** (computed, not measured): about 95 MB for high (mesh ≈ 37 MB + texture ≈ 57 MB with
  mipmaps), about 25 MB for low. Watch older laptops and use low as the fallback.
- **CPU time** to build a 666 k-vertex mesh and its normals in JS: do it once per VE change, and dispose
  of the old geometry and texture.
- **Orientation:** a wrong `flipY`/`v` choice mirrors the image north–south. Mitigated by test 4.
- **Height mixing:** a careless drape could use CTX heights. Mitigated by §9 and test 5.
- **Visual over-trust:** a sharp surface invites safety readings. Mitigated by the §9 and §10 labels.
- **Datum offset:** switching modes shifts the surface by about 1.7 m × VE. This is intended and labelled.

## 13. Rollback

Delete `web/public/data/hirise/` and the frontend toggle. CTX is unaffected.
