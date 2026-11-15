# s10-rc1: mission objectives, route intelligence and EVA visual integration

Branch `integ/s10`, base and rollback checkpoint `s9-rc1` (8713c34). No dataset, contract, core-planner or reference-route
change (ROI-A 969.161 m / 1058.299, M0-A 416.426 m / 664.390). The S9 gates, cross-slope analysis, fail-closed routing
and stereo uncertainty are unchanged. Not merged, not pushed.

## Implemented

### Mission Control as a science-objective map
- `web/src/science.ts` builds 14 science targets from the frozen ARES-1 catalog `572fba1ce61f`, with no new coordinates:
  - **M0**: the ten Three Forks depot samples, each drawn at the PDS rover position of its own drop.
  - **A**: Skinner Ridge and Wildcat Ridge as separate outcrops (rover positions at sampling, 23.6 m apart), with their cores.
  - **B**: Cheyava Falls (rock) and Sapphire Canyon (core) as two identities sharing one recorded rover position.
- Each target opens a card: what it is, why go there, facts, the coordinate and what it is, and its limits.
- F01-F03 are selectable from a "Terrain features" card, labelled "measured, review pending" or "literature only"; the
  feature card now shows the observation, evidence level and related missions.
- Map: targets appear below 4 km view width, labelled closer in; one colour per investigation; a legend; selected
  mission's targets are highlighted and the others dimmed. Expedition sequence strip (landing zone, base, M0, A, B) with
  what is routable. The straight lines between sites were removed: nothing is drawn between areas without validated terrain.
- Fixed: clicking a marker on the regional map did not open it (the map captured the pointer, so the click reported the
  map as its target). Hit-testing now asks which element is under the pointer.
- Fixed: label outlines were a fixed 3 map units and became black blobs at deep zoom.

### Individual sample positions: what is shown and why
The PDS table `sample_tube_locations` gives, per tube, the **rover** position during the drop and the tube's own
orientation; it gives no tube-centre coordinate, and NASA's Three Forks depot map is an annotated image, not
georeferenced data. So each sample marker is the rover's recorded drop position, the card says the tube lies beside the
rover, and the tube itself is not plotted. Deriving tube centres needs the per-tube Navcam products and is not done.

### Route-information markers (one system in Planning, 3D Terrain and EVA)
- `web/src/routeMarkers.ts`: start, destination, steepest step, steepest ground, largest cross-slope, longest climb,
  sharpest turn, recorded positions within 15 m, highest and lowest point. At most eight, at least 5 % of the route
  apart. Every card gives distance, DEM elevation, terrain slope, the part of it across the path and climb so far.
  The steepest-ground card states the stereo uncertainty. Destination and start name the recorded position they sit on.
- `useRouteMarkers` feeds the same list to the 2D map, the 3D labels and button list, and the EVA HUD; the selected
  marker is shared, so it stays selected across the three views. With no valid route there are no markers.
- EVA: marker chips under the visor, the "Next waypoint" tile is clickable, and a card appears by itself when the walker
  is within 25 m (or 8 % of the route) of the next marker.
- Cards say they are navigation and science context, not a hazard or safety rating.

### EVA x3 display
- The first-person view draws ground, guidance chevrons, marker posts and the camera on one geometry whose heights are
  multiplied by 3 (or 1). Eye height stays 1.7 m above the drawn ground. Map position, distances, elevations, slopes,
  costs and the route are untouched; the readouts are identical in both modes (tested).
- Labelled on the visor ("visual exaggeration only. Every readout uses the true DEM") and in the caption. x1 selectable.

### Panels
- Mission Control, Planning and 3D Terrain side panels are wider on large screens, scroll as one piece, and no longer
  contain scroll boxes inside boxes. Objective cards are full-width with target chips; Planning sections are flat.
- Header shows an "EXPERIMENTAL n degree terrain gate" chip on every scene while a gate is on. 3D and EVA state plainly
  when a gate leaves no corridor, and nothing can be started.
- Flyover: eases in after Play or Resume and no longer jumps on a slow frame.

## Verification
- Unit: 87/87 (science targets against the catalog JSON; camera 1.7 m above the drawn ground at x1 and x3 on 600
  samples per route, both grids and policies; marker count, spacing and extremes).
- Browser (Chromium): dev 35/35, production preview with DNS disabled 35/35. New: the objective map for M0, A, B and
  features; one marker selection carried from Planning to 3D to EVA; approach card; x3 against x1 at the same place; the
  walk to the destination in both modes; a 15 degree gate blocking 3D and EVA; panels at 1280 x 720 and 1024 x 768.
- Real Chrome on NVIDIA RTX 4060 (D3D11): perf 5/5; EVA 144 fps on both grids, 144 fps with the x3 display.
- core 41/41, pipeline 43/43, ARES-1 14/14, M0-A analysis 8/8.

## Pictures (real Chrome, GPU): `s10-app-01` to `s10-app-13`; headless functional shots `s10-01` to `s10-08` and the
panel-size shots `s10-1280-*`, `s10-1024-*`.

## Limitations and open tasks
- Sample markers are rover positions, not tubes; outcrop and rock markers are rover positions, not rock or core points.
- Sample "why go there" lines are general sample-science reasons by class (ARES-1 scenario notes), not catalog text.
- B has no terrain grid: inspect only. No route between landing zone, base and B.
- On the M0-A reference route the largest cross-slope lies beside the steepest ground, so it is reported inside that
  card rather than as its own marker.
- The EVA walk still follows the grid route; x3 makes its slopes look three times steeper by design.
- 3D marker labels are clickable but only the button list is tested.
- Panels: the 3D display controls (HiRISE drape, exaggeration) were restyled, not regrouped.
- Carried over: F01 geology review, slope uncertainty method, DEM registration and datum, Minetti coefficients,
  CR-005/CR-006, physical network-off reload.

## Recommendation
GO for human acceptance as the demo candidate. NO-GO, as before, for presenting any route as terrain-suitable or safe.
