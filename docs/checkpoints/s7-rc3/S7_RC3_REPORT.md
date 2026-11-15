# s7-rc3: final visual and interaction acceptance

Branch `integ/s7-rc3`, based on `s7-rc2` (4ff76f8). No dataset, route algorithm or contract change. Not merged, not pushed.

## Fixes
- **EVA HUD**
  - Guidance chevrons on the ground along the computed route (fixed points every few metres, amber on steps of 15 degrees
    or more, fading with distance). They are drawn on the route itself; nothing decorative.
  - Elevation profile strip with a position line and route-marker ticks, vertical exaggeration x3 (default, labelled) or
    x1 true scale. Elevations are DEM values; vertical datum is still unverified.
  - Turn hint ("Route bears left about N degrees in 20 m"), arrival state ("Destination reached"), Resume / Walk again,
    and a route switch (Lowest cost / Shortest) that restarts the walk.
  - Next route marker highlighted in the visor, mini-map and profile.
  - Wider ground view (42 % of the grid instead of 30 %) and weaker perspective, so source pixels are stretched less.
    The ground is a flat tilted image at source resolution (1 m HiRISE, 5 m CTX); no relief is modelled in the HUD.
  - Fixed: heading snapped to north on the last step; a one-cell route would have crashed the HUD.
- **3D terrain**: "Fit terrain" used a bounding-sphere fit that left the grid small; it now frames the grid.
- **Planning**: constraints/limitations and the layer legend are collapsed by default; tighter table and paragraph spacing.
  Nothing was removed.
- **Orbital**: the map box takes the mosaic's ground-true proportions, so no empty bands inside the frame.
- **Regional map**: closer than 6 km across, the validated HiRISE 1 m ortho is drawn inside the M0-A grid and labelled.
- **Provenance**: long source links show host and file name (full address in the link and tooltip); text wraps.

## Science Atlas
The rc2 screenshot showing only "Reading the ARES-1 catalog." was captured during normal loading: the catalog is fetched
and hash-checked when the Atlas opens, and the test took the picture immediately. Probed after every scene: the Atlas
loads completely each time (10 M0 rows, A, B, MEDA with 7440 points and 24 sessions, source register). No defect; the
screenshot test now waits for the loaded table.

## Browser verification (Playwright, real Chromium, dev server and production preview with DNS disabled)
- Complete walk from 0 m to the destination by playback: remaining 0 m, "Destination reached", walked length equals the
  planned route length. Pause holds position; scrubbing, route change and restart work; mini-map dot equals the visor
  position at start, mid-walk, after route change and at the destination.
- x1 / x3: drawn profile is exactly three times flatter at x1.
- Bright Angel: EVA preview refused, no routing.
- 1440 x 900, 1024 x 768 and 768 x 1024: every scene renders without sideways scroll.
- No external request and no page error in any test.

## Tests
core 41/41, web unit 62/62, build OK, Playwright dev 27/27, production preview offline 27/27, perf 2/2,
pipeline 43/43, ARES-1 14/14, M0-A analysis 8/8. Reference routes unchanged: ROI-A 969.161 m, M0-A 416.426 m / 664.390.

## Remaining issues
Blockers: none found.

Nonblockers:
- Physical network-off reload on the demo machine not done (needs a person; switching the adapter is a system setting).
- HUD ground imagery is soft near the walker; this is the 1 m source limit.
- HUD ground has no relief; chevrons follow the route in plan only.
- Orbital mosaic can show black for a fraction of a second while the image decodes after a scene change.
- Planning side panel is hidden by default below about 1100 px width (existing behaviour; "Show panel" opens it).
- Route markers are not shown in the 3D scene.
- Carried over: F01 geology review, F02/F03 measurements, DEM registration and vertical datum, CR-005/CR-006 approval,
  no detailed terrain for B, build about 19 MB.

## Recommendation
GO for final human acceptance, with the network-off reload as the one manual check to do first.
