# ARES-1 catalog v1 — acceptance notes (frozen bundle `572fba1ce61f`)

Status: **conditionally approved for READ-ONLY Science Atlas integration** (technical lead, 2026-11-14).
The bundle is **frozen**: `ares1/bundle/572fba1ce61f/`, manifest SHA-256
`572fba1ce61fa89f441cb89dc30b0a7fe7c1b72ebecd750aa37be97e26df378f`. Nothing in it was changed for these
notes. The items below that the bundle states imprecisely are fixed by the **binding UI contract** in
`HANDOFF_SCIENCE_ATLAS.md`, not by a rebuild.

## 1. The 144 "consistency checks" are not 144 scientific validations

They are **38 check types**, most repeated once per sample:
- 8 types × 10 M0 tubes;
- 2 types × 9 cards;
- 3 types × 4 A cores;
- the rest single checks.

They test that **related records agree and were joined correctly**: same designations, names, sols,
timestamps and serial numbers, classes consistent with NASA cards, and team pins equal to NASA waypoints.
They do not independently validate any scientific fact. Several compared sources are not independent:
- the team table was transcribed from the Analyst's Notebook;
- the team pins were copied from MMGIS;
- the Initial Reports, depot tables and NASA cards are all Mars 2020 mission records.

A passing check means "**consistent and correctly joined**", never "**scientifically confirmed**".

## 2. Tube centers

All ten are `tube_center.status = NOT_AVAILABLE`, with `lat_deg`, `lon_deg_east` and `uncertainty_m`
`null`. This is enforced by `test_tube_centres_are_never_invented`.

## 3. Rover positions vs rock/tube locations

Every position states its semantics:
- depot drops: "ROVER position during the tube drop … NOT the tube location";
- sampling: "rover position … for the sampling activity (not the rock/core point)";
- waypoints: "regional reference only, not a sample or tube point".

There is no rock, core or tube coordinate anywhere in the catalog.

## 4. Time terminology (as published; nothing invented)

| Event | Field(s) | Source term | Not present |
|---|---|---|---|
| Acquisition | `designation_sol` (sol encoded in the PDS designation), `date_of_coring_raw` (Earth date as printed) | Initial Report "Date of Coring" | no acquisition LMST or UTC |
| Sealing | `sealing_event.sol`, `.lmst`, `.ls_deg`, `.date_of_sealing_raw` | Initial Report "Mars Time of Sample Core Sealing: hh:mm[:ss] LMST, Sol N, Ls x" (the LMST label is the source's own) | no sealing UTC |
| Depot drop | `drop_sol`, `drop_time` + `drop_time_basis` | Analyst's Notebook "Sample drop timestamp: Sol N hh:mm:ss.sss" (the time scale is **not named**; the team's "LMST" is reported, not adopted) | no drop LMST label, no UTC |
| MEDA | per row: `SCLK`, `LMST`, `LTST` as published | PDS4 label fields | no per-record UTC (only the product start/stop UTC) |

## 5. Witness tube (Amalik Witness, WB3, M2020-00586-18): sealing uncertainty

- The catalog records sealing sol 586, LMST 19:16:40, Ls 321.03 and `date_of_sealing_raw`
  "12 -Octber-2022" from the Initial Report only. It sets `independently_documented: false`, with the note
  "Witness tube: sealing documented only by its Initial Report".
- **Additional conflict, not in the frozen bundle:**
  - NASA's Mars Rock Samples page says the third witness tube was sealed on "Sol 586 (Oct. 14, 2022)";
  - the Initial Report prints "Date of Sealing: 12 -Octber-2022" (sic), "Date of Initial Witness
    Exposure: 10-October-2022" and "Date of Activation: 10-October-2022".

  The Earth date of sealing is therefore **unresolved (Oct 12 vs Oct 14, 2022)**. The sol (586) agrees.
  The UI must show the sol and both dates with this note.
- The witness tube is a contamination control, not a sample of Mars material. It has no "Date of Coring";
  `sampling_event.date_of_coring_raw` is correctly `null`.

## 6. MEDA QA: parser validity is not scientific QA

- `status: valid` in `meda_sol0516_der_ps_rows.csv` and `status_counts` means **parser/format validity
  only**:
  - the row has the declared width;
  - the fields parse as their label types;
  - pressure is present;
  - pressure is inside the 100–1500 Pa **sanity screen**;
  - the transducer is 1 or 2;
  - SCLK is increasing.
- It does **not** mean that calibration, sensor health, environmental context or the PDS science team's
  quality assessment was reviewed. The product has no quality-flag column, and no such review was done.
- The frozen QA file does not state this explicitly. The UI must label the column "Parser status"; see
  the handoff.
- Preserved as published:
  - `PRESSURE_UNCERTAINTY` is empty in all 7 440 rows ("Not provided in source");
  - the label's unit for it is "kelvin" (an inconsistent source unit, recorded in `label_anomalies`, not
    corrected);
  - the header spelling differs from the label.

## 7. Sol 516 rover location

`rover_location_context.confidence = "medium"`, `evidence_kind = "interpretation (absence of logged
drives)"`. The basis is that no MMGIS drive is logged between sol 502 (RMC 26_1222) and sol 535. This
stays medium.

## 8. Bright Angel

All nine claims B-01 to B-09 are preserved verbatim, with confidence, limitation and primary source. This
is enforced by `test_b_entities_and_claims`. Mission B flags: `life_detected: false`,
`biological_origin_confirmed: false`. B-08 is `hypothesis`/`low`.

## 9. Fresh-checkout loading and rebuild (verified 2026-11-14)

In a fresh detached worktree of `312b6ae` (`core.autocrlf=true`):
- all 19 locally stored sources match their SHA-256;
- `python ares1/ingest/build_catalog.py` reproduces `572fba1ce61f` **byte-for-byte**;
- `pytest ares1/tests` passes 14/14;
- there is no dependency on `pipeline/cache/`, on network access or on undeclared files;
- the build needs only the Python standard library, and the tests need `pytest`.

The 7 441 CR bytes in the hashed files are the MEDA CSV's native CRLF record delimiters (declared in its
label), preserved by `ares1/sources/** -text`.

Online retrieval is needed only for:

| Step | Needs | Committed substitute |
|---|---|---|
| Regenerate `sources/extracted/initial_reports_extract.json` | the five PDS Initial Report PDFs (≈ 535 MB; URLs + SHA-256 in the source register) and `pypdf` | the extract JSON is committed and hashed |
| Re-run `ingest/dem_coverage.py` | HTTP range reads of the USGS/JPL DEM GeoTIFFs and `rasterio` | `docs/dem_coverage.json` (not part of the bundle) |
| Refresh any primary source | the URLs in the source register | the raw bytes are committed |
| Read cited papers and articles | `cited_not_retrieved` entries | none; they are cited, not ingested |

## 10. Scientific release blockers

**None** for a read-only Science Atlas, **provided the UI contract is followed**. Three wording gaps in the
frozen bundle are compensated there:
- MEDA "valid" → "Parser status";
- the witness Earth-date conflict;
- consistency checks ≠ validations.

Embedding these three texts in the data would need a v1.1 bundle with a new version. That needs your
approval and is not required for the Atlas.

Known limitations (not blockers):
- tube centers unknown;
- exact rock/core points unknown;
- drop-time scale not named by its source;
- no MEDA per-record UTC or uncertainty;
- vertical-datum consistency unverified;
- B lies in the HiRISE CR_SOUTH stereo pair (parallax caveat).
