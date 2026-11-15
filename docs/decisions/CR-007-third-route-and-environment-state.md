# CR-007: a third route in the web state, and an environmental-context layer switch

Status: **approved by the owner (Poyraz) on 15 Nov 2026** ("Yes, mark approved"). Merged to `main` in 57856e5.

## What changes
Contract v1.0.0 §9.4 (visualization state) lists `routes{distance,terrain}` and a `selectedRouteId` with two values.
S13 adds, in the web state only:

- `routes.conservative`: a `RouteResult` like the other two (same fields, same units).
  `algorithm_version` is `conservative-1.0.0`. `cost_flat_equiv_m` keeps its contract meaning (step length times
  the Minetti-type slope factor), so the three routes can be compared; the strategy's own objective is reported in
  `constraint_notes`, not in a contract field.
- `selectedRouteId` may be `"conservative"`.
- `envLayer`: `"dust" | "weather" | "radiation" | null`. Which reference cards are on show. It selects text only.

## What does not change
- `core/` (the frozen planner), `contracts/types.ts`, every bundle, the Route API (§9.3) and its statuses.
- The two existing strategies and their reference outputs.
- No environmental quantity enters any route: there is no gridded dust, weather or radiation product in the build.

## Why a CR and not a contract edit
The contract is owner-controlled. This change request records the approved extension of §9.4; the contract text
itself (`contracts/CONTRACT.md`, v1.0.0) has **not** been edited. Folding the extension into a contract revision is a
separate change with its own version number. The third route and the layer switch live in `web/src/conservative.ts`,
`web/src/environment.ts`, `web/src/EnvironmentPanel.tsx` and their call sites; core, pipeline and data are untouched.
