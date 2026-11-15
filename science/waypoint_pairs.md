# Demo waypoint pairs — what the route comparison can honestly show

Generated 2026-11-14 from bundles roi_a `e7c8cb43f83a` and roi_b `43038eec7103` with the real engine
(`core/scripts/route_pairs.ts`; full tables in `waypoint_pairs_raw.md`). POI coordinates are
**UNVERIFIED** (S2 open). ROI-B passed the automatic S-3 check on real pixels (100 % routable,
`roi_validation_roi_b.md`); its S-4/S-5/S-6 are not signed off.

## Findings

1. **Length never changes.** For all 12 ordered POI pairs, in both ROIs, with both curves, the terrain
   route has exactly the same horizontal length as the distance route (Δlen = 0). Grades along these
   paths stay ≤ 0.114, so the cost model never pays extra distance to avoid a slope.
2. **Shape can differ, but that is lattice degeneracy, not a trade-off.** On an 8-connected grid many
   paths share the minimum length. Distance mode returns one of them by tie-breaking (effectively
   arbitrary); terrain mode returns the least-cost one among them. Largest differences:
   Rochette → Landing (ROI-A) 295 m apart, 5 % shared cells, 10.1 m less climb; Landing → Rochette
   (ROI-B) 320 m apart, 10.5 m less climb. The "less climb" figure depends on the baseline's arbitrary
   tie-break, so it must **not** be headlined as a saving.
3. **Real relief exists, but away from the science points.** ROI-B has one cluster of slopes > 15°
   (222 cells, max 31.2°), centred near lat 18.46571, lon 77.42321 (planetocentric, east-positive), at
   the north-west edge of ROI-B, ~2 km from the landing site; it likely continues beyond the ROI. No
   current POI lies across it. The feature has **not** been identified; that is a science task.
4. No cost was distorted. Thresholds and curves are unchanged (g_max 0.45, Minetti/Tobler as in ADR-002).

## Proposal

- **Demo pair now (honest framing):** Rochette/Montdenier → Landing on ROI-A. Message: "Both routes
  are equally short. Among the many equally short paths, the terrain model picks the one with the
  lowest relative terrain cost." Show both elevation profiles; do not claim a climb saving or safety.
- **For a real distance-versus-terrain trade-off:** the science lead identifies the steep feature at
  ~18.466 N, 77.423 E and, if a scientifically justified target lies across or beyond it, supplies
  its coordinates with a primary source. Then extend the ROI (new T03 read + G1 checks) to cover it.
- **Not proposed:** inventing a target near the slope, raising costs, or lowering g_max to force a detour.
