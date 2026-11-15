# S7 RC1: mission experience, hypothetical base and landing zone, route information, visual system

| Item | Value |
|---|---|
| Baseline (preserved) | `s6-rc2` @ `deb74dd`; `main` @ `2d255d6`; all earlier tags and bundles unchanged |
| Branch / worktree | `integ/s7` in `ares-wayfinder-wt-s7` |
| New data | Base scenario `da61f17b64b0` (`analysis/base/`, served from `web/public/data/base/`), rebuilt twice identically |
| Research record | `docs/research/BASE_SITE_SOURCES.md` (every claim marked verified or not, with how) |
| Merge to main | not done; needs approval |

## Landing zone, base and camps (hypothetical; not evaluated or approved by NASA)

Rules were written in `pipeline/base_scenario.py` before running. Inputs are the verified terrain bundles only.

| Site | Position | Rule | Result | Routing |
|---|---|---|---|---|
| **ARES Base** (habitat, expedition start) | 18.455683° N, 77.409640° E | flattest 60 m patch on the HiRISE 2 m grid, ≥ 40 m from the grid edge, ≥ 120 m from every tube drop position | slope median 2.0°, p95 4.3°, max 7.2°; 190 m to the M0 waypoint, 274 m to the A waypoint | **real routes** to M0 and A on the M0–A grid |
| **Landing zone** | 18.444854° N, 77.452327° E | flattest 400 m disc (40 m regional relief) 1.0–2.5 km from the base | p95 2.6°; 2.5 km from the base; **82 m from Perseverance's 2021 touchdown** | inside ROI-A only; base link is a straight-line 2.5 km (no connecting terrain grid) |
| **Camp Delta** (temporary, mission A) | 18.456189° N, 77.405794° E | flattest 30 m patch within 150 m of the A waypoint | p95 6.4° | routable (M0–A grid) |
| **Camp Neretva** (temporary, mission B) | 18.504913° N, 77.320736° E | flattest 300 m disc within 1 km of the B waypoint, 40 m relief only | p95 6.2°, relief 42 m | **provisional; not routable** |

**Compared landing candidates** (p95 slope within 400 m, 40 m grid):

| Candidate | p95 slope |
|---|---|
| LZ-1, selected | 2.6° |
| Octavia E. Butler site | 2.9° |
| Three Forks depot area (excluded to protect the tubes) | 10.5° |
| Delta top near Belva | 13.4° |
| Neretva Vallis at Bright Angel | 23.0° |

**Published context used** (shown in each site card under "Published context and sources"):
- NASA's 2015 Exploration Zone limits: latitude ±50°, elevation ≤ +2 km. Jezero was a proposed zone.
- A plume-ejecta hazard zone of about 1 km around a lander, in a NASA study deck.
- Three Forks was chosen as level, rock-free ground.
- Perseverance's landing ellipse and divert capability.
- Curiosity's 0.67 mSv/day at Gale crater.
- MEDA pressure, wind and dust records.
- A NASA power study that used Jezero as its example.

**Limits:**
- Slope only. Not evaluated: rocks, dust and bearing strength, plume effects, radiation (no Jezero measurement or map), thermal and wind conditions, power, communications, planetary protection.
- No numeric NASA slope or rock limit for a human landing zone was found, so the flatness rule is our own.
- The landing-zone minimum lies at the outer edge of the search ring.

## Mission relationships

- **M0 and A:** staged from the base. "Plan base → M0 depot" and "Plan base → Western Delta" compute new routes on the M0–A grid.
  - The rover-to-rover reference route (416.426 m / 664.390) is unchanged and still the grid's default.
- **B:** exploration only. Camp Neretva and the 6.4 km base-to-B link are straight-line relationships.
- **Landing zone:** opens the ROI-A terrain at that point. No route joins it to the base.

## What changed in the app

- **Mission map** (`RegionalCanvas`):
  - mission colours: gold M0, orange A, blue B;
  - teal base square, dashed landing-zone circle drawn to scale (400 m), camp triangles (dashed when provisional), dotted relationship lines;
  - magenta feature diamonds;
  - the M0–A grid shown as the available corridor area;
  - a cluster label at regional zoom.
- **Site cards** in the in-view inspector: role, slope statistics, distances, compared candidates, published context, what was not evaluated, and actions.
- **Route-information markers:** numbered points on the selected route, each computed from the route itself: start, steepest step, longest climb, highest and lowest point, destination.
  - A card shows distance along the route, DEM elevation, cell slope, climb so far and what is not modelled.
  - Opening and closing a marker does not move the map or change the route.
- **Orbital:** a regional entry scene with the mission map, the five-step expedition sequence, and entry into Mission Control. Any marker opens in Mission Control.
- **EVA HUD:** a simulated preview along the computed route (distance walked and remaining, elevation, next-step slope, climb so far, next marker, profile scrubber).
  - It is labelled as simulated.
  - The environment is stated as historical MEDA only.
  - It is unavailable at B.
- **Provenance:** a table of every dataset version with source and limit, the open scientific limits, then the source records.
- **Visual system** (`web/src/s7.css`): cool basalt chrome so the Mars imagery is the warm centrepiece; Bahnschrift/DIN-style type with tabular numerals; sentence-case headings; one accent; visible keyboard focus; reduced-motion respected.
- **Header:** shows the scenario and the active terrain dataset.
- **Test config:** the preview suite accepts `PREVIEW_PORT`, so it can run beside a preview already open on 4173.

## Data used versus unavailable

| Used (real) | Unavailable (stated, never invented) |
|---|---|
| CTX 6 m mosaic; HiRISE DTM 2 m and ortho (M0–A); JPL CTX DEM 20 m (ROI-A); TRN CTX DTM 40 m relief (display only) | spatial radiation, dust, temperature, wind, illumination |
| slope, elevation, hillshade, NoData; the catalog (tubes, cores, claims, MEDA sol 516) | rock abundance; trafficability; B detailed terrain |
| F01 automated transect (review pending) | F02, F03 measurements |

## Tests (final state of `integ/s7`)

| Suite | Result |
|---|---|
| core | 41/41 |
| web unit | 62/62 (+3: base loader and tampering, base routing vs reference route, route markers) |
| M0–A analysis | 8/8 |
| pipeline | 43/43 (+3 base scenario) |
| ARES-1 | 14/14 |
| build | OK |
| Playwright, dev | 23/23 |
| Playwright, production preview, DNS disabled (port 4273) | 23/23 |
| Performance | 2/2 |

The new walkthrough test visits every scene and checks:
- the base and landing-zone cards, and the candidates table;
- a base route that differs from the reference route;
- marker open and close;
- the EVA "simulated" label;
- 3D, regional relief and the datasets table;
- the 416.426 m and 969.161 m regressions;
- no external requests and no page errors.

## Screenshots

**After** (this folder):

| File | Scene |
|---|---|
| `s7-01-orbital.png` | Orbital |
| `s7-02-mission-control.png` | Mission Control |
| `s7-03-base-card.png` | Base card |
| `s7-04-landing-zone-card.png` | Landing-zone card |
| `s7-05-planning-base-route-marker.png` | Planning with a base route and a marker card |
| `s7-06-3d-terrain.png` | 3D terrain |
| `s7-07-eva-hud.png` | EVA HUD |
| `s7-08-regional-relief.png` | Regional relief |
| `s7-09-provenance.png` | Provenance |
| `s7-10-science-atlas.png` | Science Atlas |

**Before:** `docs/checkpoints/s6-rc1/` (`s6-01` … `s6-10`). Orbital, EVA HUD and the Provenance table had no S6 equivalent: Orbital was a ROI-A overview and EVA HUD a placeholder.

## Remaining limits

- **Science:**
  - F01 awaits geology review; F02 and F03 are literature only.
  - DEM registration, vertical datum and the walking-cost model are open.
  - B has no validated detailed terrain.
  - CR-005 and CR-006 await formal approval.
- **Base scenario:** slope-only and hypothetical. The landing zone is assessed at 40 m only.
- **Engineering:**
  - At regional zoom the M0–A grid label and the F01 label still crowd the base cluster.
  - Route markers are on the 2D map and in the EVA preview, not yet in 3D.
  - The Science Atlas kept its content and layout, restyled only.
  - Build size is about 19 MB.
- **Physical network-off reload:** still to be done by a person.

## Human acceptance checklist

- [ ] Orbital: the map shows the base, landing zone, camps, three missions; "Open Mission Control" works.
- [ ] Mission Control: clicking the base, the landing zone and a camp opens a card in view; candidates and published context open.
- [ ] "Plan base → Western Delta" shows a new route (not 416.426 m); the markers open and close; `R` restores the reference route.
- [ ] EVA HUD follows that route and says "Simulated preview".
- [ ] 3D, Fit terrain, Regional relief (display only) all work; B shows no route and no detailed 3D.
- [ ] Provenance lists seven datasets with versions.
- [ ] ROI-A still shows 969.161 m and 1058.299.

## Recommendation

**GO** for s7-rc1 as the submission demo after your manual pass.

**NO-GO** for presenting the base or landing zone as NASA-evaluated or safe, and for merging to `main` without approval.
