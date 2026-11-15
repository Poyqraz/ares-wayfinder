# ARES-1 science catalog — canonical entity and evidence schema (`ares1-science-catalog/1`)

Development catalog. **Not integrated in the live application.** Separate from the CTX/HiRISE terrain
bundles, the routing contract (v1.0.0 + CR-004) and `@ares/core`.

## 1. Conventions

| Topic | Rule |
|---|---|
| Coordinates | planetocentric latitude, east-positive longitude, decimal degrees, Mars. Never WGS84 / Web Mercator. |
| Distances | great-circle on a sphere R = 3 396 190 m (the radius of the PDS/USGS Jezero products) |
| Unknown | `null` = unknown. Never 0, never a copied substitute. |
| Text from PDFs | fields ending in `_raw` keep PDF text-extraction artefacts (split words); numbers were parsed after removing whitespace and typography only |
| Keys | PDS **Sample Designation** (`M2020-SSSSS-NN`) is the sample key. Joins never use names. NASA's public sample cards carry no designation and are joined by the Initial Report **sealing sol** (unique in this catalog); names are only a post-join cross-check. |

## 2. Evidence record (attached to entities and claims)

| Field | Values |
|---|---|
| `confidence` | `high` (directly stated in a primary NASA/PDS record), `medium` (evidence-based interpretation or inference), `low` (hypothesis; alternatives remain), `pending` (source identified, value not obtained) |
| `evidence_kind` | `identity` (names, IDs, events), `observation`, `measurement`, `interpretation`, `hypothesis`, `rationale` |
| `sources` | ids from the bundle's `source_register` (URL, bytes, SHA-256, retrieval date; `cited_not_retrieved` where only cited) |

Identity can be `high` while an interpretation about the same object is `low`. Both are stored separately.

## 3. Position record

`{lat_deg, lon_deg_east, elev_m, frame, elevation_reference, semantics, source, locator, precision_note?}`

`semantics` always states **whose** position it is: the rover during a drop, the rover during sampling,
or a NASA end-of-drive waypoint. A rover position is never stored as a tube, core or rock position.

Spatial precision vocabulary:
- `pds_rover_position_at_event`: the rover pose from PDS; the target lies near, not at, it;
- `approximate_rover_waypoint`: an MMGIS end-of-drive point used as a regional reference;
- `not_available`.

## 4. Entities

| Kind | Id pattern | Key fields |
|---|---|---|
| `region` | `region:three_forks_depot`, `region:western_delta_front`, `region:bright_angel` | name, mission, spatial (precision + bbox or reference waypoint), evidence |
| `outcrop` | `outcrop:skinner_ridge`, `outcrop:wildcat_ridge` | geologic unit (team), abrasion patch, `cores[]`, rock type + science reason (team), spatial (rover positions at sampling), evidence per aspect (rock type / interpretation / core ids) |
| `rock` | `rock:cheyava_falls` | `is_not` ("a waterfall or a sample"), region, `cores[]`, spatial, evidence |
| `abrasion_patch` | `abrasion:thornton_gap`, `abrasion:berry_hollow` | name, outcrop |
| `sample` | `sample:<designation>` | designation, sample name, alternate names, designation sol, designation tube number, NASA public sample number, classification (team class + NASA type/rock type), origin, `sampling_event` (designation sol, date of coring, rover position), `sealing_event` (sol, LMST, Ls, `independently_documented`, sources), current location, Initial Report volume/page |
| `depot_drop_event` | `drop:<designation>` | drop sol, drop time + **time basis**, RMC site/drive, **rover position (not the tube)**, tube azimuth + definition, drop zone, tube id, serial numbers, planning targets, `tube_center` |
| `tube_center` (inside a drop) | — | `status: NOT_AVAILABLE`, `lat_deg/lon_deg_east/uncertainty_m: null`, reason, named glove/seal targets |
| `reference_waypoint` | `waypoint:M0/A/B` | position (MMGIS), `coordinate_status: approximate_rover_waypoint` |
| `science_claim` | `claim:B-01…B-09` | category, claim text (verbatim from the team), confidence, `evidence_kind`, limitation, primary source |
| `measurement_series` | `series:meda_sol0516_ps` | instrument, product LID, processing level, sol, UTC span, Ls span, `data_kind: observed_historical`, rows/QA files, status counts, `not_to_be_presented_as[]` |

`relations[]`: `{from, rel, to, via?}` with `dropped_at`, `cored_from`, `located_in`,
`same_sol_as_sealing_of`.

Mission B carries `flags`: `life_detected: false`, `biological_origin_confirmed: false`,
`possible_biosignature_hypothesis: true`.

## 5. Bundle

`ares1/bundle/index.json` → `{catalog: {version, path, manifest_sha256, role: "development_only"}}`.
`version` = the first 12 hex of SHA-256(manifest bytes). The manifest lists every bundle file (bytes,
SHA-256) and the full source register.

Files:
- `catalog.json`;
- `meda_sol0516_der_ps_rows.csv`: every source row, values as published, plus `status` / `flags` / `data_kind`;
- `meda_sol0516_der_ps_qa.json`.
