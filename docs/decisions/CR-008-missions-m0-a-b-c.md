# CR-008: ARES-1 missions become M0, A, B (Amalik), C (Bright Angel)

Status: **approved by the owner (Poyraz) on 15 Nov 2026** ("Yes, mark approved"). Merged to `main` in 57856e5.
The follow-ups listed at the end are still open.
Science hand-off: `ARES1_ARAZI_BILIMSEL_DOGRULAMA.md` v1.0 (15 Nov 2026).

## Decision
- **B** is now Amalik / Enchanted Lake: the outcrop at Cape Nukshak where Perseverance drilled Shuyak and Mageik.
- **C** is the former B, Bright Angel / Cheyava Falls, with all its records and limitations.

## How it was done without touching frozen data
The ARES-1 catalog `572fba1ce61f` and the regional basemap `d3d62fc34c56` are hash-checked and were not changed.
They still call Bright Angel mission `B`, its waypoint `waypoint:B` and its claims `B-01` to `B-09`.

- The web layer's mission `C` reads those records by their frozen ids and says so on screen
  ("Recorded as mission B in the frozen catalog").
- Mageik (`M2020-00579-17`) was already in the catalog as a depot tube, with its Amalik sampling position, coring sol,
  sealing sol and depot drop. Mission B reads it from there.
- Shuyak (`M2020-575-16`) is not in the catalog. Its record is in `web/src/missionB.ts`, transcribed from PDS
  *Mars 2020 Initial Reports, Volume 2*, sheet 16-1, and compared with the PDF (sha256 `914a4baa…b9f123`).
- The outcrop description, the uncertainty list, the source list and the imagery links are in the same module.

## Routing
Amalik's sampling position is **81 m west of the frozen M0–A grid** `f8de9017164a` and far outside ROI-A
(`analysis/s14/b_coverage.ts`, unit-tested). In s14-rc1 no route was offered to B.
**Since S15** mission B is routed on a wider grid built from the same source: see `CR-009-wider-m0ab-grid.md`.

## Follow-ups that need the owner
1. **Catalog v2**: add Shuyak, the Amalik outcrop and the Novarupta patch through the ingest pipeline with hashes,
   and decide whether the catalog's own mission ids should follow the new letters. Until then the Shuyak record is
   a transcription in code.
2. **A wider terrain grid** that includes Amalik: built in S15 (CR-009). Its G4 and G5 sign-off is the open item.
3. **Bosak et al. (2024), Table 1**: the hand-off reports that it appears to swap which Amalik core went to the
   depot. It was not re-read here. NASA's sample list and the PDS depot records agree with each other and are followed.
