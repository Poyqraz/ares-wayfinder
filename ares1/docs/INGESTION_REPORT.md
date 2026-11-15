# ARES-1 science data ingestion — report (2026-11-14)

Branch `feat/ares1-science` (worktree `ares-wayfinder-wt-ares1`), cut from `feat/data-core` @ `29e9034`.
Nothing in `main`, `release/s2`, Cursor's worktree, `core/`, the CTX/HiRISE bundles or the routing
contract was touched. **Not integrated in the live application.**

Bundle `ares1/bundle/572fba1ce61f/`. Rebuild: `python ares1/ingest/build_catalog.py` (offline, deterministic;
a test proves that a rebuild reproduces the committed `catalog.json` byte-for-byte).

## 1. Inputs read

All three team archives were read in full:
- `ARES1_M0_A_B_MEDA_Arastirma_Paketi.zip`;
- `ARES1_M0_MEDA_Verifikasyon_Paketi.zip`;
- `ARES-1_Yazilimci_Devir_Paketi.zip`.

Every file in them (CSV, GeoJSON, JSON, Markdown and Python) is stored verbatim in
`ares1/sources/team/`. Duplicates across the archives (the MEDA manifest, `download_validate_meda.py`,
the waypoint GeoJSON) are byte-identical.

Primary sources retrieved (bytes + SHA-256 in the bundle's `source_register`):

| Source | Use |
|---|---|
| PDS `urn:nasa:pds:mars2020_sample_depot_three_forks` `sample_tube_locations/identifiers/targets` (CSV + PDS4 XML) | M0 drop events, rover drop positions, tube azimuths, identifiers, targets |
| PDS Mars 2020 Sample Dossier Initial Reports, volumes 1–5 (PDF; hashes recorded, not committed) | sampling and sealing events, sampling rover positions, serial numbers, lithology |
| NASA Mars Rock Samples page (HTML snapshot) | public sample numbers, sample/rock type, sol sealed, current location |
| PDS Analyst's Notebook Three Forks page (HTML snapshot) | depot drop timestamps |
| NASA MMGIS `M20_waypoints.json` | M0/A/B reference pins; rover drives around sol 516 |
| PDS MEDA `WE__0516___________DER_PS__________________P01.CSV/.xml` | sol 516 pressure series |

## 2. M0 — Three Forks (10 tubes)

- **Joins:** exact `Sample Designation` across the 3 PDS depot tables, the team table, the Analyst's
  Notebook list and the Initial Reports. NASA cards are joined by sealing sol. **144 consistency checks
  pass** (`catalog.json → consistency_checks`):
  - same 10 designations everywhere;
  - identical names in the PDS tables;
  - drop sol PDS = Analyst's Notebook = team;
  - drop time Analyst's Notebook = team;
  - tube/seal/ferrule serials in the Initial Report = depot identifiers;
  - designation sol ≤ sealing sol;
  - team class consistent with the NASA type/rock type;
  - NASA display name contains the PDS name.

  These are 38 check types, mostly repeated once per sample. They show that the records agree and were
  joined correctly. They are **not** 144 independent scientific validations, because several sources
  copy one another (see `CATALOG_ACCEPTANCE_v1.md` §1).
- **Classes:** 4 igneous, 3 sedimentary, 1 regolith, 1 atmosphere, 1 witness (matches the team).
- **Drop events:** sol + time + RMC site/drive + **rover** position + tube azimuth + drop zone + targets.
- **Tube centers: `NOT_AVAILABLE` for all ten.** The PDS tables state that their coordinates are the
  rover's. The glove/seal ends exist only as named targets. Nothing was derived from the rover positions.
- **Sealing events:** independently documented (Initial Report + NASA card) for all nine samples. The
  witness tube (WB3) is documented by its Initial Report only. Its Earth date of sealing is unresolved:
  the Initial Report gives 12 Oct 2022, while NASA's sample page gives sol 586 = 14 Oct 2022. The sol
  agrees. This conflict is not in bundle `572fba1ce61f`; see `CATALOG_ACCEPTANCE_v1.md` §5.

## 3. A — Western delta front

- **Skinner Ridge:** Swift Run (#11, on the rover) and Skyland (#12, in M0).
- **Wildcat Ridge:** Hazeltop (#14, on the rover) and Bearwallow (#15, in M0). Each core is verified by
  its Initial Report and its NASA card (feature name = outcrop).
- **Spatial:** rover positions printed in the Initial Reports. Skinner Ridge sampling position
  18.458931 N, 77.40617078 E; Wildcat Ridge 18.4586371 N, 77.4058885 E. They are **23.6 m apart**: two
  distinct sites, consistent with the team's "~20 m". The outcrop extent and the exact core points remain
  unknown.

## 4. B — Bright Angel

- Separate entities: the region (Bright Angel, Neretva Vallis), the rock (Cheyava Falls, *not a
  waterfall or a sample*) and the sample (Sapphire Canyon, **not in M0**, on the rover).
- **Nine team claims preserved verbatim** with confidence, limitation and source. Each also has an
  evidence kind:
  - identity: B-01, B-02;
  - observation: B-07;
  - interpretation: B-03 to B-06;
  - **hypothesis: B-08 (low)**;
  - rationale: B-09.
- Flags: `life_detected: false`, `biological_origin_confirmed: false`.

## 5. MEDA sol 516 (retrieval succeeded)

| Item | Value |
|---|---|
| Product | `urn:nasa:pds:mars2020_meda:data_derived_env:we__0516…p` v1.0, Derived, MEDA PS |
| Bytes / SHA-256 | CSV 401 817 B `4d50e6a1…a01643`; XML 9 095 B `3388cd32…313e54` |
| Time span | UTC 2022-08-02T08:51:27.903Z – 2022-08-03T08:34:37.576Z; Ls 277.586–278.202° |
| Records | 7 440 declared = 7 440 parsed; **parser status: valid 7 440, flagged 0, missing 0, invalid 0** ("valid" = format and sanity checks only, not a scientific QA review; see `CATALOG_ACCEPTANCE_v1.md` §6) |
| Pressure (valid) | 769.75 – 803.51 Pa, mean 788.51, median 788.42 |
| Sessions | 24 (1 s sampling; gaps of ~3 390 s between sessions) |
| Uncertainty | **not provided**: empty in every row |
| Transducer | 1 for all rows |
| Location context | no MMGIS drive between sols 502 and 535, so the series is attributed to the rover parked at the Wildcat Ridge workspace (medium confidence, inference) |

**Label anomalies, recorded and not "fixed":**
- the label's unit for PRESSURE UNCERTAINTY is "kelvin";
- the CSV header spells `PRESSURE_UNCERTAINTY` where the label says `PRESSURE UNCERTAINTY`.

**Parser rules:**
- structure, types and units come from the PDS4 label;
- empty = missing, since the label defines no special constants;
- no row is ever deleted;
- the 100–1500 Pa screen only flags rows;
- SCLK, LMST and LTST are preserved;
- there is no per-record UTC, and no SPICE conversion was done.

**Not to be presented as:** a spatial weather map, a forecast, a future EVA condition or a validated EVA
risk.

## 6. Discrepancies found and how they were resolved (no team value overwritten)

| Finding | Resolution |
|---|---|
| Team B-02: "Sapphire Canyon sample #25"; PDS designation `M2020-1215-28` | Both are true: NASA's public numbering skips witness tubes. Both are stored (`nasa_public_sample_number: 25`, `designation_tube_number: 28`). |
| NASA spells "Atsá (aka Atsah)" and "Ha'ahóni (aka Hahonih)" | The PDS name is canonical; the NASA spelling is an alternate name. Name matching would have failed; key joins do not. |
| Mageik: designation sol 579, sealing sol 619 | Genuine (Initial Report + NASA card); kept as separate sampling and sealing events. |
| Drop "LMST" in the team table | The Analyst's Notebook calls it a "Sample drop timestamp" without naming the time scale; stored as sol-local with that note. |
| Team script `ingest_m0_locations.py` matches by substring name and sol | Replaced by exact key joins. The original is kept verbatim, not executed. |
| Team script `download_validate_meda.py` drops non-numeric and out-of-range rows | Replaced by a parser that keeps and flags every row. The original is kept verbatim, not executed. |
| Team M0 pin (RMC 32_774) | Verified against MMGIS; it equals the rover position at the **Bearwallow** drop. It is a regional reference only. |

## 7. DEM coverage for a potential M0-to-A routing area (`docs/dem_coverage.json`)

The area is the box around all M0/A points + ~180 m: lat 18.4495–18.4619 N, lon 77.4029–77.4116 E
(≈ 1.4 × 0.9 km).

| DEM | Valid pixels | Elevation (m) | Slope p50 / p95 / max |
|---|---|---|---|
| JPL CTX DEM 20 m | 100 % | −2555.5 … −2475.2 | 5.0° / 17.5° / 27.7° |
| USGS TRN CTX DTM 20 m | 100 % | −2555.6 … −2475.2 | 5.0° / 17.5° / 28.1° |
| USGS HiRISE DTM 1 m | 100 % | −2549.7 … −2470.5 | 4.7° / 22.0° / 56.9° |

- Every M0/A point lies on valid pixels in all three. HiRISE stereo pairs C, W and DL overlap there.
- **The current CTX ROI-A/ROI-B bundles do not cover M0, A or B** (all lie west of lon 77.42). A new,
  separately validated ROI would be needed. This is a feasibility check only; **no routing was done.**
- The area has ~80 m of relief and delta-front scarps. HiRISE shows slopes far above the current g_max
  model domain (24.2°) locally.
- **B spot check:** all three DEMs are 100 % valid. B falls in the HiRISE stereo pair **CR_SOUTH**, which
  USGS flags for uncompensated y-parallax.

## 8. Unknowns (explicit)

- Tube-center coordinates (all ten).
- Exact rock and core points for Skinner Ridge, Wildcat Ridge and Cheyava Falls.
- The time scale of the Analyst's Notebook drop timestamps.
- Per-record UTC and the pressure uncertainty for MEDA sol 516.
- Vertical-datum consistency between PLACES elevations, MMGIS `elev_geoid` and the CTX/HiRISE DEMs.
- Whether the CR_SOUTH parallax issue affects terrain near B at route scale.

## 9. Excluded claims

- Life detected, or biological origin confirmed.
- Any tube-center coordinate derived from rover positions.
- Weather maps, forecasts or EVA risk values derived from MEDA.
- A NASA-approved sample-return schedule.
- Routing M0/A/B on the current ROI-A terrain bundle.
