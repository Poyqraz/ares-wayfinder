# CR-009: a wider HiRISE analysis grid (M0-A-B) so mission B can be routed

Status: **G4 and G5 signed off by the owner on 15 Nov 2026 for prototype analysis (`analysis/m0ab/validation/signoff.json`).** Merged to `main` in 57856e5 on 15 Nov 2026, with the owner's approval.
Requested in conversation on 15 Nov 2026 ("Yes, widen grid"), after S14 showed Amalik 81 m outside the M0-A grid.

## What was added
- A second HiRISE 2 m analysis bundle, `m0ab` / `5b2abdb8bb70`, built by the existing M0-A pipeline with
  `ARES_AREA=m0ab` (`pipeline/m0a_area.py` selects the box, the endpoints and the output folder).
- The frozen bundle `f8de9017164a`, its gate record and every reference route are **unchanged**. With no
  `ARES_AREA` set, the pipeline behaves as before (its 43 tests pass).
- In the app, mission B plans on the wider grid (M0 -> B by default). M0 and A stay on the frozen grid.

## Why it is acceptable as a prototype
See `analysis/m0ab/validation/GATES_REPORT.md`: automated gates G1, G2, G3 and G6 pass, the G4 numbers meet their
limits, the wider grid holds the frozen grid bit for bit, and it reproduces the frozen M0 -> A reference exactly.

## What needs the owner
1. ~~G4 (registration) and G5 (analysis grid) sign-off for the wider box.~~ **Done, 15 Nov 2026.** The bundle's gate
   record carries the decision (same dataset version, `5b2abdb8bb70`; only `terrain.json` changed) and the app no
   longer shows a pending label.
2. Whether, after sign-off, M0 and A should move to the wider grid too (they need not: the numbers are identical).
3. If the decision is ever withdrawn: remove `web/public/data/m0ab/` and set mission B back to inspection only
   (`MISSIONS.B.planning`), as it was in s14-rc1. Nothing else depends on the wider grid.

## Not changed
`core/`, `contracts/`, the ARES-1 catalog, the regional bundles, ROI-A, the cost model and the Conservative Terrain
parameters.
