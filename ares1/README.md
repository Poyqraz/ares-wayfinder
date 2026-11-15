# ARES-1 science catalog (development, isolated)

A versioned, source-traceable catalog for the ARES-1 scenario. It covers:
- **M0**: the Three Forks depot;
- **A**: Skinner Ridge and Wildcat Ridge;
- **B**: Bright Angel / Cheyava Falls / Sapphire Canyon;
- one real **MEDA** sol 516 pressure series.

It is separate from the CTX/HiRISE terrain bundles and the routing engine, and is **not loaded by the
application**. Bundle `572fba1ce61f` is frozen and conditionally approved for a read-only Science Atlas
only (see `docs/HANDOFF_SCIENCE_ATLAS.md`).

| Path | Content |
|---|---|
| `sources/raw/` | original bytes of the PDS/NASA sources (Three Forks tables + labels, MEDA CSV + label, MMGIS waypoints, NASA/AN page snapshots) |
| `sources/team/` | the science team's three archives, verbatim (their two scripts are kept for provenance and are **not executed**) |
| `sources/extracted/initial_reports_extract.json` | designation-keyed fields from the PDS Initial Reports PDFs (`ingest/extract_initial_reports.py`) |
| `ingest/` | `build_catalog.py` (catalog + bundle), `meda_ps.py` (label-driven MEDA parser), `extract_initial_reports.py`, `dem_coverage.py` |
| `bundle/<version>/` + `bundle/index.json` | integrity-checked bundle (manifest SHA-256 → files + source register) |
| `docs/` | `SCHEMA.md`, `INGESTION_REPORT.md`, `CATALOG_ACCEPTANCE_v1.md` (acceptance notes for frozen bundle `572fba1ce61f`), `HANDOFF_SCIENCE_ATLAS.md` (read-only Atlas UI contract), `dem_coverage.json` |
| `tests/` | parser edge cases, real-product checks, catalog invariants, integrity, deterministic rebuild |

To rebuild and test (Python with `pytest`; `dem_coverage.py` also needs `rasterio`):

```bash
python ares1/ingest/build_catalog.py
```

```bash
pytest -q ares1/tests
```

Rules followed:
- exact key joins, never name matching;
- a rover position is never a tube or rock position;
- unknown means `null`;
- the supplied research is kept verbatim and annotated, not replaced;
- MEDA is rover-local and historical: no map, no forecast, no EVA risk;
- no life claim.
