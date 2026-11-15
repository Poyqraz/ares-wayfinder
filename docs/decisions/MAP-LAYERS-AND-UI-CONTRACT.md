# Mission map architecture, provenance-aware layers and the Cursor UI contract (v1, frozen 2026-11-15)

Owner: Claude (geospatial transforms, dataset validation, destination state, sampling, routing).
Cursor may own **only** the three isolated UI components in §5, after this contract.
Branch `feat/m0a-terrain`. Nothing here changes `s3-rc1`, the ROI-A bundles or `contracts/` (v1.0.0 + CR-004).

## 1. Extents and grids (each with its own validated geometry; never reused outside its coverage)

| Extent id | Purpose | Imagery | Terrain / analysis | Grid (from file headers) | Status |
|---|---|---|---|---|---|
| `regional` | Orbital basemap: ROI-A, ROI-B, M0, A, B in context | USGS controlled CTX orthomosaic `JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0` (6 m, also served by NASA Mars Trek), asset `analysis/regional/d3d62fc34c56` | none (image only) | eqc lat_ts 0, R 3 396 190, PixelIsArea, north up; science crop 2274 × 1187 px at 6 m (lat 18.40–18.52, lon 77.28–77.51); whole-mosaic 48 m overview | **verified:** 0 % NoData in crop; registration vs HiRISE ortho 1.2 m E / −1.2 m N (M0–A, NCC 0.89) and 1.1 / 0.3 m (B, NCC 0.90) |
| `roi_a` | Existing engineering demo (unchanged) | JPL CTX ortho 5 m (bundle) + HiRISE display layer (display only) | JPL CTX DEM 20 m, eqc lat_ts 18.4663 | bundles `7ec72147790e` / HiRISE `376dcb1220c4` | released in `s3-rc1`; S-4 registration still open |
| `m0a` | M0–A prototype analysis | HiRISE ortho → 1 m (display texture) | **HiRISE DTM → 2 m ANALYSIS grid** (G5) | eqc lat_ts 0, 259 × 369 cells | **prototype:** G1–G6 done; not routable in the app until accepted |
| `b_spot` | Bright Angel context | regional CTX only | none | — | inspect only; HiRISE CR_SOUTH parallax caveat; no analysis grid |

**Rules:**
- All positions are stored as MARS_GEO: planetocentric latitude, east-positive longitude.
- Each extent converts with **its own** Projection through `core/coords` (`geoToProj` / `projToCell` / `cellCenter`). There is no pixel arithmetic across extents and no CTX↔HiRISE pixel mapping.
- "HiRISE 2 m analysis" (M0–A) and "HiRISE display only" (legacy ROI-A) are separate layer ids with separate labels. The UI must never label the ROI-A HiRISE drape as an analysis input.
- The HiRISE ortho is **orthographic** (lat_0 18.4663, lon_0 77.4298). It is always warped through its own CRS (GDAL), never by an affine offset.

## 2. 2D and 3D share one geometry

- One texture per extent, rendered once, is used by both the 2D canvas and the 3D drape. Each texture carries its grid: x0, y0, dx, dy, nx, ny, CRS.
- 2D map pixel = `(E - x0) / dx`, `(y0 - N) / dy` (pixel-edge coordinates, row 0 north).
- 3D = `core/coords.projToScene` on the **same** analysis grid that produced the route.
- Route vertices are always `cellCenter()` of the route cells on that grid, so 2D polyline, 3D polyline and profile are the same points.
- **Required tests** before any integration RC:
  - V-1 asymmetric test texture orientation;
  - V-2 2D and 3D vertices identical (≤ 1e-9 m);
  - V-3 vertical-exaggeration label;
  - a regional-to-extent check that catalog features drawn on the regional basemap and on the extent texture fall on the same geographic point (≤ 1 regional pixel).

## 3. Layer definition (one definition, one renderer, used in 2D and 3D)

```ts
interface LayerDef {
  id: string;                 // e.g. "m0a.slope_deg"
  extent: "regional" | "roi_a" | "m0a";
  role: "REAL_OBSERVED" | "DERIVED_FROM_REAL_DEM" | "MODELLED_CONDITIONAL";
  title: string; units: string | null; legend: { kind: "image" | "ramp" | "classes"; stops?: [number, string][] };
  source_ids: string[]; resolution_m: number; coverage: { bounds_geo: {lat_min: number; lat_max: number; lon_min: number; lon_max: number} };
  processing: string; uncertainty: string;
  available: boolean; unavailable_reason: string | null;   // unavailable layers are listed, greyed, never faked
}
```

### Layer availability matrix

| Layer | Role | Regional | ROI-A | M0–A | Units / legend | Source / processing / uncertainty |
|---|---|---|---|---|---|---|
| CTX imagery | REAL OBSERVED | **yes** (6 m) | yes (5 m) | context only | DN, stretched | controlled CTX mosaic / JPL CTX ortho; display only |
| HiRISE imagery | REAL OBSERVED | no (coverage not shown regionally) | yes, display only | **yes** (1 m texture) | DN, stretched | USGS HiRISE ortho soc_007, warped from orthographic |
| Catalog waypoints / rover positions | REAL OBSERVED | **yes** | — | yes (endpoints) | point; "rover position, not a tube or rock point" | ARES-1 catalog `572fba1ce61f` |
| MEDA sol 516 | REAL OBSERVED | **point record only** | — | — | Pa vs LMST (chart) | rover-local time series; **never** interpolated into a surface |
| Colour elevation | DERIVED | no | yes | yes | m (ramp) | DEM of that extent; vertical datum UNVERIFIED |
| Slope | DERIVED | no | yes | yes | degrees | Horn 3 × 3 on ground spacing |
| Hillshade | DERIVED | no | yes | yes | unitless | display only |
| Roughness | DERIVED | no | not built | not built | m (std of detrended elevation, 3 × 3) | planned; must state window size; not a hazard map |
| Contours | DERIVED | no | not built | not built | m interval | planned; from the analysis DEM only |
| Validity / NoData | DERIVED | no | yes | yes | classes 0–3 | NoData never filled |
| Steepness mask | DERIVED (analytical) | no | yes | yes | ≥ threshold ° | labelled "analytical steepness mask, **not a certified hazard**" |
| Solar illumination | MODELLED / CONDITIONAL | no | **not available** | **not available** | — | needs Mars24 geometry (Allison & McEwen 2000) and a chosen time; not implemented |
| Shadows | MODELLED / CONDITIONAL | no | **not available** | **not available** | — | blocked until illumination is validated |
| Temperature, dust, weather, minerals, radiation | MODELLED / CONDITIONAL | **not available** | **not available** | **not available** | — | no gridded dataset ingested; inventing or interpolating values is prohibited |

## 4. Single selection and route state (mine; Cursor only renders)

```
typed text ──parseMarsCoordinate()──┐
map click (pixel) ──extent grid → geo┤──> inspectDestination(source, lat, lon, grids) ──> mission.destination
                                     │       (core/src/destination.ts, tested)
mission.destination.routable_in ? requestRoute() → planRoute() on that grid : show not_routable_reason
```

- `parseMarsCoordinate(text)`:
  - accepts "lat, lon" in decimal degrees, latitude first, with optional N/S/E/W;
  - rejects ambiguous input and degree-minute input with a message;
  - normalises 180–360° east longitudes.
- `inspectDestination()` samples every analysis grid containing the point (cell, validity, elevation, slope, sources, dataset version). It decides `routable_in`, or gives `not_routable_reason`:
  - outside every grid, so inspect only;
  - NoData at the point;
  - the grid is not accepted for routing in this release.
- **Only one store slice owns this:** `mission = { destination, route_state: "idle" | "not_routable" | "routing" | "ok" | "no_route", routes }`. There is no routing code in React components.
- `m0a` is passed with `routable: false` until you accept the M0–A bundle.

## 5. Cursor component contract (frozen)

Files Cursor may create: `web/src/ui/CoordinateInput.tsx`, `web/src/ui/DestinationCard.tsx`, `web/src/ui/OrbitalMagnifier.tsx`, plus their tests and CSS.
Everything else is out of scope, including `core/`, `contracts/`, `pipeline/`, `analysis/`, the store, routing and all coordinate math.

| Component | Props (exact) | Behaviour | Must not |
|---|---|---|---|
| `CoordinateInput` | `{ onSubmit(text: string): void; error: string \| null; disabled?: boolean }` | text field + submit; shows `error` verbatim; Enter submits; label "Latitude, longitude (planetocentric °N, °E)" | parse, round or validate coordinates |
| `DestinationCard` | `{ info: DestinationInfo \| null; onRoute(): void; onClear(): void }` (`DestinationInfo` from `core/src/destination.ts`) | shows lat/lon (6 decimals) and frame; one row per `samples[]` entry (grid id, elevation m or "No data", slope ° or "undefined", validity, source ids, dataset version); Route button enabled **only** if `info.routable_in !== null`; otherwise shows `not_routable_reason` verbatim | compute distances, sample rasters, invent values, or enable routing when `routable_in` is null |
| `OrbitalMagnifier` | `{ image: { url: string; nx: number; ny: number }; view: { x: number; y: number; w: number; h: number }; onSelect(rect: { x: number; y: number; w: number; h: number }): void; onPick(p: { x: number; y: number }): void }`, all in **basemap pixel-edge coordinates** | draws the regional basemap, a resizable rectangle (min 32 px) and a magnified inset of the same pixels; emits pixel rectangles and points only | convert pixels to lat/lon, assume WMTS tiles, or flip axes (row 0 = north) |

**Acceptance tests Cursor must supply:**
- props render;
- the disabled Route button when `routable_in` is null;
- `error` is shown verbatim;
- the magnifier emits pixel coordinates for a known click on an asymmetric test image;
- keyboard operation and focus order;
- no network requests.

## 6. Remaining before an integration RC

1. Your acceptance (or not) of M0–A bundle `f8de9017164a`. Until then `m0a.routable = false`.
2. Integration RC branch from `s3-rc1` (mine), containing:
   - the regional basemap asset copied byte-for-byte into `web/public/data/regional/<version>/`, with its own index;
   - a Regional view in Mission Control with footprints of `roi_a` and `m0a`;
   - the selection pipeline wired to the store;
   - Cursor's three components;
   - V-1 to V-3 and the regional/extent tests;
   - the full regression suite (`s3-rc1`'s 13 browser tests must stay green).
3. **Not in scope before submission:** illumination/shadow models, roughness/contours, any environmental surface.
