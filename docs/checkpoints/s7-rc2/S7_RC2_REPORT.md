# s7-rc2: presentation polish on top of s7-rc1

Base: `s7-rc1` (85762da). No data, routing or contract change. Not merged to `main`.

## Changes by scene
- **EVA HUD**: rebuilt as a helmet visor (`web/src/EvaHud.tsx`, `web/src/hud.css`). Heading-up tilted view of the real
  ortho, dashed route ahead, solid walked trail, numbered route markers, position arrow, compass, north-up mini-map,
  "Walk the route" playback and scrub bar, steep-step callout (15 degrees within 40 m; display cue, not a safety limit).
  Tiles: walked, remaining, elevation, slope ahead, climbed, next waypoint. Suit/crew and environment tiles state
  "No telemetry" / "Not measured"; nothing is simulated there. Banner: "Simulated preview".
- **Planning**: route-marker card has a badge, a lead line, Previous/Next and "n of N"; steepest marker is amber,
  start/goal teal.
- **Mission Control / Orbital**: area and F01 labels only appear when zoomed in; feature labels are the ID only;
  spacing pass on the side panel and mission cards.
- **3D terrain, Provenance, Science Atlas**: unchanged apart from shared spacing rules.

## Tests (all run on this commit)
core 41/41, web unit 62/62, build OK, Playwright dev 23/23, production preview with DNS disabled 23/23, perf 2/2,
pipeline 43/43, ARES-1 14/14, M0-A analysis 8/8. Reference routes unchanged: ROI-A 969.161 m, M0-A 416.426 m / 664.390.

## Open issues
- HUD ground imagery is soft close to the walker (1 m ortho stretched by the tilt).
- Route markers are not shown in the 3D terrain scene.
- Planning side panel is still dense at 1440 x 900.
- Carried over: F01 geology review, F02/F03 measurements, DEM registration and vertical datum, CR-005/CR-006 approval,
  no detailed terrain for B, build about 19 MB.
