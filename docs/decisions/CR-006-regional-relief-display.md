# CR-006: display-only regional relief bundle and 3D mode

**Request:** "Integrate regional 3D" (technical lead, 2026-11-15), after the gate evaluation on `feat/regional-dem`
(`analysis/regional_dem/GATES.md` written before computing; `REGIONAL_DEM_REPORT.md`).

**Bundle:** `5c4dd158f4cf`
- **Source:** USGS TRN CTX DTM 20 m, 2 × 2 mean to a 40 m posting, 341 × 178 cells.
- **Frame:** eqc lat_ts 0, lon_0 0, R 3 396 190 m, the same as the regional CTX image `d3d62fc34c56`.
- **Values:** no NoData, nothing filled.
- **Labels carried:**
  - registration to the imagery UNRESOLVED (a 10–20 m north offset is plausible);
  - vertical reference UNVERIFIED (the file name and metadata disagree).

**Contract change (additive):** a terrain bundle may carry `role: "display_only_regional_relief"`, plus these fields:

| Field | Purpose |
|---|---|
| `texture` | placement of the regional image in map coordinates |
| `crs_proj4` | the projection string |
| `gates` | the gate results |
| `validity_counts` | counts per validity code |

- Such a bundle has **no slope file**, is **never routable**, and is never used for hazards or traversability.
- Existing TerrainMeta fields keep their meaning.
- `CONTRACT_VERSION` stays 1.0.0, because the ROI-A and M0–A bundles are unaffected.

**Web integration:**
- **Loader:** `web/src/regionalRelief.ts` hash-checks the index, manifest, files and `terrain.json`. It requires the display-only role and the same CRS, and requires the texture to be the loaded basemap version.
- **View:** `web/src/RegionalRelief.tsx`.
  - Mesh via the existing `buildTerrainMesh` and `projToScene` (CR-005 ground scale).
  - Texture coordinates come from map coordinates, because the image extent differs from the grid by a few metres.
  - Mission waypoint pillars sit at the catalog positions.
  - ×1 vertical exaggeration by default.
  - Labels always visible: display only, coarse, UNRESOLVED registration, UNVERIFIED datum.
- **Entry points:**
  - the Mission Control header;
  - the local 3D controls;
  - the B 3D notice. B's *detailed* 3D stays disabled; regional relief is coarse orientation only.
- **Not done:** no route is drawn on regional relief, and the 2 m M0–A grid is never stretched regionally.
