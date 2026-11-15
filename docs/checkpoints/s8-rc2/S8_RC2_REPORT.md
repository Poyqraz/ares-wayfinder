# s8-rc2: review fixes on s8-rc1

Base `s8-rc1` (d376d41), branch `integ/s8`. See `docs/checkpoints/s8-rc1/S8_RC1_REPORT.md` for the feature description;
its smoothed-line numbers are superseded by the table in `docs/audit/S8_ROUTE_AUDIT.md`.

1. Smoothed line: removed the 80-step reach limit that left needless bends on long routes. M0-A reference is now the
   straight line (387.5 m, cost 645.1, 0 heading changes; was 388.2 m, 645.8, 2). Audit JSON and table regenerated.
   Worst measured time 0.7 ms per call.
2. Compass: the HUD heading is now the gaze from `walkPose`, the same one the first-person camera uses. The browser
   test compares the two at every checkpoint.
3. New unit test: `surfaceHeight` against the triangles `buildTerrainMesh` really emits, on both grids.
4. New browser test: with WebGL blocked the HUD shows the flat map by itself.
