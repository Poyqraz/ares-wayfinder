# s9-rc1: terrain-aware traversability audit and experimental slope gate

Branch `integ/s9`, base and rollback checkpoint `s8-rc2` (0e7836c). Full audit: `docs/audit/S9_TRAVERSABILITY_AUDIT.md`.
No dataset, contract or core-planner change. Reference routes unchanged (ROI-A 969.161 m / 1058.299, M0-A 416.426 m / 664.390).

## Added
- `web/src/traverse.ts`: per-step terrain (grade, terrain slope, cross-slope, 3x3 relief), gated planning through the
  core's existing `cell_slope_gate_deg`, optional one-cell clearance.
- `web/src/TraversePanel.tsx`: "Terrain under the route" in Planning, gate controls, no-corridor message.
- 2D and 3D: route outline yellow on 15-20 degree ground, red above 20; gate overlay; reference route kept in grey.
- 3D: warning when vertical exaggeration is not 1.
- Smoothing obeys the gate. Route-conditions table corrected.
- `analysis/s9/traversability_audit.ts`, `pipeline/traversability_check.py` and their result files.

## Tests
core 41/41, web unit 83/83, build OK, Playwright dev 31/31, production preview offline 31/31,
perf on real Chrome and GPU 4/4 (EVA 144 fps), pipeline 43/43, ARES-1 14/14, M0-A analysis 8/8.

## Pictures (real Chrome, NVIDIA RTX 4060)
`s9-evidence-*-2d-north-up-slope.png`, `*-3d-x1-overview.png`, `*-3d-x1-low-oblique.png`, `*-3d-x5-same-view.png`,
`*-terrain-panel.png` for the M0-A reference route and the base route; `s9-01` to `s9-03` for the gate states.
