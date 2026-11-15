# s11-rc1: Regional Relief 3D mission map and the 3D route line

Branch `integ/s11`, base and rollback checkpoint `s10-rc1` (861ac57). Two visual items only. No dataset, catalog, contract,
planner, gate, EVA or Mission Control behaviour change; reference routes unchanged (ROI-A 969.161 m / 1058.299,
M0-A 416.426 m / 664.390). Not merged, not pushed.

## 1. Regional Relief 3D as a mission map
- The three anonymous bars are replaced by 23 markers built from the data the 2D map already uses
  (`web/src/reliefMarkers.ts`): ARES Base, landing zone, Camp Delta, Camp Neretva; M0, A, B; the ten depot drop
  positions; Skinner Ridge and Wildcat Ridge; Cheyava Falls (Sapphire Canyon shares its marker); F01 to F03; and the two
  dashed outlines of the terrain grids where routes can be computed (ROI-A, M0-A).
- Shapes say what a thing is: sphere on a pole = NASA rover position or waypoint; flag (and dome for the base) =
  hypothetical ARES-1 site; diamond = terrain-feature anchor; ground ring = the landing zone's scored 400 m disc at true
  size. One colour per investigation, the same as in Mission Control.
- Positions: `reliefScene` puts each latitude and longitude through the same map projection as the 2D map, on the height
  of its 40 m relief cell times the exaggeration. A unit test maps every marker back to its latitude and longitude and
  checks that x3 changes only the height.
- Label density follows the camera: from the whole-region view only the base cluster, landing zone, B and one or two
  others are labelled; investigations, outcrops, features and finally single samples appear as the camera closes in.
  Labels that would overlap are dropped in priority order; the selected marker's label is always kept.
- Selecting a marker (in the scene or in the panel) focuses the camera on it and opens a card: identity, why it matters,
  the coordinate and what it is, its limits, and "Open in Mission Control", which opens the same place there.
- Kept distinctions, all stated in the cards: rover positions are not tube, rock or core points; base, camps and landing
  zone are hypothetical and not NASA-evaluated; F01 is "measured, geology review pending", F02 and F03 "literature only";
  B has no routing grid; the scene is display only and "no route is validated between these regions". No line joins any
  two regions.
- The scene now draws only when the camera or content changes instead of continuously.

## 2. 3D route line
- Terrain-aware route: one continuous muted orange line (`#e0894a`); shortest-distance route: a thinner subtle cyan line
  (`#6cc3d8`). No dashes. The selected route is wider with a quiet dark casing; the other is drawn last, so it stays
  visible inside the wider line where they overlap.
- The lines no longer break up against the terrain: they are pulled forward in depth only, so the surface they lie on
  does not cut them while a ridge in front still hides them. Geometry is the same computed vertices as before.
- The S9 slope colouring (yellow 15 to 20 degrees, red above 20) is now the optional overlay "Inspect terrain slope
  under the selected route", off by default. The exaggeration warning and the Planning terrain panel are unchanged.

## Verification
- Unit 90/90 (3 new), build OK.
- Browser (Chromium): dev 37/37, production preview with DNS disabled 37/37 (2 new tests: the relief mission map; the
  route line and overlay at x1, x5, x10).
- Real Chrome on NVIDIA RTX 4060: perf suite 6/6; EVA 144 fps.
- core 41/41, pipeline 43/43, ARES-1 14/14, M0-A analysis 8/8.

## Pictures (real Chrome, GPU)
`s11-app-01` to `13`: relief from the whole region, rotated, each mission and target focused, a low angle, and x3.
`s11-app-20` to `24`: the route at x1, with the slope overlay, with the distance route selected, at x5 and x10, and from
a low angle.

## Remaining issues
- Marker labels are tested through the panel buttons; clicking a marker in the canvas works by hand-off to the same
  handler but is not exercised by a test.
- From far away, closely spaced labels are dropped rather than rearranged (for example Camp Neretva or F03 next to B).
- The relief is 40 m cells: markers stand on the coarse surface, and the depot's ten positions (within about 100 m) only
  separate at close range.
- Regional Relief keeps its own x1 / x3 exaggeration; it has no route and no slope information by design.
- Carried over from S10: all scientific limitations and open reviews.

## Recommendation
GO for human acceptance of the two visual items.
