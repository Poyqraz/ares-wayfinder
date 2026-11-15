# Handoff to Cursor — ARES-1 Science Atlas (READ-ONLY), frozen catalog `572fba1ce61f`

Approved scope: a **source-backed, read-only Science Atlas**. **Not** M0/A/B route planning or
optimization. The CTX/HiRISE routing, the cost functions, `core/`, `contracts/` and the catalog bundle stay
unchanged. Read `CATALOG_ACCEPTANCE_v1.md` first.

## 1. Frozen input and entry points

| What | Value |
|---|---|
| Catalog source of truth | `feat/ares1-science` @ `312b6ae`, folder `ares1/bundle/572fba1ce61f/` |
| Manifest SHA-256 | `572fba1ce61fa89f441cb89dc30b0a7fe7c1b72ebecd750aa37be97e26df378f` |
| Files (bytes, SHA-256) | `catalog.json` (89 138, `c2313227…eae`), `meda_sol0516_der_ps_qa.json` (9 822, `38ff4ac0…964`), `meda_sol0516_der_ps_rows.csv` (631 463, `1fc865b5…4c0`), plus `manifest.json` |
| Served copy (app) | copy the four files **byte-for-byte** to `web/public/data/ares1/catalog/572fba1ce61f/` |
| App discovery file | `web/public/data/ares1/index.json` = `{"catalog": {"version": "572fba1ce61f", "path": "data/ares1/catalog/572fba1ce61f/", "manifest_sha256": "572fba1ce61fa89f441cb89dc30b0a7fe7c1b72ebecd750aa37be97e26df378f", "role": "development_only"}}` |
| Browser URLs | `/data/ares1/index.json`, then `/` + `path` + `manifest.json`, `catalog.json`, `meda_sol0516_der_ps_rows.csv`, `meda_sol0516_der_ps_qa.json` |

## 2. Canonical manifest schema (`ares1-catalog-bundle/1`)

```json
{
 "schema": "ares1-catalog-bundle/1",
 "catalog_schema": "ares1-science-catalog/1",
 "files": [ { "file": "catalog.json", "bytes": 89138, "sha256": "…" }, … ],
 "source_register": [ { "id": "pds_tf_locations_csv", "title": "…", "kind": "pds_table | pds_label | pds_pdf | pds_web | nasa_web | nasa_json | team_research | derived_extract | cited_not_retrieved",
                        "url": "… | null", "local_path": "ares1/sources/… | null", "bytes": 859, "sha256": "… | null", "retrieved": "2026-11-14 | null" }, … ]
}
```

Loader rules:
1. Require `sha256(manifest bytes) == index.catalog.manifest_sha256`, its first 12 hex == `version`
   == folder name, and `role == "development_only"`.
2. For every file, require bytes and SHA-256 to match its `files[]` entry.
3. Require `catalog.schema == "ares1-science-catalog/1"`. Ignore unknown fields.
4. **Any failure:** the Atlas panel shows `ARES-1 science catalog unavailable (<reason>)`. The rest of the
   app (CTX/HiRISE/routing) is unaffected.

The source register is shown in the provenance drawer: title, kind, URL, SHA-256 and retrieved date.
`cited_not_retrieved` entries are labelled "Cited (not retrieved or verified by ARES-1)".

## 3. Expected UI (labels are exact unless in ⟨angle brackets⟩)

**Global (always visible in the Atlas):**
- `Science Atlas (read-only). Historical NASA/PDS records; not a mission plan.`
- `Positions are rover positions or approximate rover waypoints, never exact rock or tube locations.`
- `Consistency checks confirm that related records agree; they are not independent scientific validations.`

**Missions:** three sections, `M0 Three Forks Depot`, `A Western delta front` and `B Bright Angel`. Each has
one regional pin:
`Approximate rover waypoint (NASA MMGIS, sol ⟨sol⟩, RMC ⟨rmc⟩). Not a sample or tube point.`

**M0:**
- A table, not pins. Columns:
  - Designation, Name, Class (team), NASA type/rock;
  - Drop sol, Drop time (`⟨hh:mm:ss.sss⟩ (sol-local; time scale not stated by source)`);
  - Sealing (`Sol ⟨n⟩, ⟨hh:mm[:ss]⟩ LMST`);
  - Tube center (`Not available`).
- The rover drop position may appear only in the row detail:
  `Rover position during drop (not the tube): ⟨lat⟩ N, ⟨lon⟩ E`.
- Witness row (WB3): `Witness tube (contamination control). Sealing: Sol 586, 19:16:40 LMST (Initial Report only; Earth date unresolved: 12 Oct 2022 per Initial Report, 14 Oct 2022 per NASA page)`.

**A:**
- Two cards, **Skinner Ridge** (Swift Run, Skyland) and **Wildcat Ridge** (Hazeltop, Bearwallow).
- Core badges: `In Three Forks Depot (M0)` (Skyland, Bearwallow) or `On the rover` (Swift Run, Hazeltop).
- Position line: `Rover position during sampling (outcrop extent unknown)`.
- Separation line: `Sampling positions 23.6 m apart`.
- Confidences shown separately for rock type, interpretation and core IDs.

**B:**
- Three entities: `Bright Angel (region)`, `Cheyava Falls (rock, not a waterfall or a sample)` and
  `Sapphire Canyon (core; NASA Sample No. 25 = designation M2020-1215-28; on the rover; not in M0)`.
- Claims B-01…B-09 grouped by evidence kind (Identity / Observation / Interpretation / Hypothesis /
  Rationale), each with confidence, limitation and source link.
- B-08 badge: `Hypothesis (low): abiotic pathways not excluded`.
- Fixed line: `No evidence of life has been established.`

**MEDA sol 516:**
- A chart of pressure (Pa) against LMST using all rows; session gaps are drawn as gaps.
- Point colour comes from the `Parser status` column (valid / flagged / missing / invalid).
- Caption: `Historical rover-local measurement (Perseverance MEDA PS, sol 516, 2022, PDS Derived). Not a weather map, not a forecast, not an EVA risk value.`
- Note: `"Parser status: valid" means the row passed format and sanity checks only; it is not a full scientific quality assessment.`
- Uncertainty column: `Not provided in source`.
- Label anomaly lines from `label_anomalies`, verbatim.
- Location note: `Attributed to the rover parked at the Wildcat Ridge workspace (medium confidence: no logged drives between sols 502 and 535).`

## 4. Disabled states (visible, with a reason)

| Control | State | Text |
|---|---|---|
| Route / navigate to M0, A, B or to any tube/rock | disabled | `Route planning to ARES-1 targets is not available: no validated terrain area covers them (current CTX ROI-A/ROI-B do not), and no exact target locations exist.` |
| Show 10 tube pins / zoom to tube | disabled | `Tube positions not available in the PDS records.` |
| "Exact location" for rocks/cores | disabled | `Only rover positions during sampling are published.` |
| MEDA uncertainty band | disabled | `Pressure uncertainty not provided in this product.` |
| MEDA UTC axis | disabled | `No per-record UTC in this product (SCLK/LMST/LTST only).` |
| Spatial weather / forecast toggles | not shown | (no such feature) |
| B terrain detail | caution chip | `B lies in the HiRISE CR_SOUTH stereo pair (USGS: uncompensated y-parallax).` |

## 5. Forbidden on screen

`safe`, `safest`, `life detected`, `life found`, `biological origin confirmed`, `confirmed biosignature`,
`forecast`, `EVA risk`, `tube location` (without "not available"), and any coordinate shown as a tube,
rock or core position.

## 6. Paste-ready prompt

```
GATED: technical lead approved a READ-ONLY ARES-1 Science Atlas. Not routing, not optimization.
Create your own worktree ../ares-wayfinder-wt-atlas on a new branch feat/science-atlas from tag s2-rc1
(git worktree add -b feat/science-atlas ../ares-wayfinder-wt-atlas s2-rc1). Do not touch other worktrees.
Do not edit core/, contracts/, pipeline/, science/, ares1/ (read-only), CTX/HiRISE bundles, routing or
cost code. No merge, no push, no rebase/reset of shared branches, local agent only.
Bring ares1/ over unchanged as your first commit: git checkout ares1-catalog-v1 -- ares1/ .gitattributes
(tag ares1-catalog-v1 = feat/ares1-science with frozen bundle 572fba1ce61f; check .gitattributes keeps the
s2-rc1 lines and adds the two ares1/** -text lines).
Read: ares1/docs/HANDOFF_SCIENCE_ATLAS.md (this contract), ares1/docs/CATALOG_ACCEPTANCE_v1.md,
ares1/docs/SCHEMA.md.
1) Copy ares1/bundle/572fba1ce61f/* byte-for-byte to web/public/data/ares1/catalog/572fba1ce61f/ and
   write web/public/data/ares1/index.json exactly as in §1. Verify hashes in a unit test.
2) Implement the loader rules (§2) with the failure message; never block the rest of the app.
3) Implement the UI of §3 with the exact labels and the disabled states of §4. 2D only.
4) Tests: integrity rejection (flip one byte in each of the 4 files, and in index manifest_sha256);
   10 M0 table rows and 0 tube pins; two A outcrops with four cores and correct depot badges; B three
   entities, nine claims, B-08 hypothesis badge, the no-life line; MEDA 7440 points, status colours,
   uncertainty "Not provided in source", UTC axis disabled; all disabled-state texts visible; forbidden
   words absent (§5); witness Earth-date conflict text present; offline load.
Report: branch, SHA, changed paths, raw test output, screenshots of each mission section and the MEDA chart.
```
