# S4 RC1: integration release candidate (regional map, M0–A prototype planning, destination pipeline)

| Item | Value |
|---|---|
| Branch / worktree | `integ/s4-rc` in `ares-wayfinder-wt-s4`, from `s3-rc1` (`d7b8853`) |
| Inputs | `feat/m0a-terrain` @ `d3a7ef1` (fast-forward); Cursor `feat/ui-destination` @ `6da7a2d`, reviewed and cherry-picked as `b8a2edd`, then adapted |
| Untouched | `main` (`2d255d6`); `s3-rc1`; all `ckpt/*` tags; Cursor's worktrees; `web/public/data/index.json`, ROI-A/ROI-B/HiRISE bundles; `core/src/route.ts`, `core/src/coords.ts`; `contracts/` (`git diff s3-rc1..HEAD` on these paths is empty) |
| Merge to main | **not done; needs your approval** |

## Data versions and hash evidence (served byte-for-byte from the source bundles)

| Dataset | Version | Evidence |
|---|---|---|
| M0–A analysis bundle | `f8de9017164a` | manifest SHA-256 `f8de9017164a9129…ec21d76` (prefix = version); `terrain.json` `399a42a6…a115dbda` (in `data/m0a/index.json`, role `prototype_analysis`); 7 files hash-checked at runtime; offline rebuild reproduces it byte-for-byte |
| Regional basemap | `d3d62fc34c56` | manifest SHA-256 `d3d62fc3…7f67c7f69`; `regional.json` `fc949eb9…b2885f5f`; online rebuild from the USGS GeoTIFF reproduces it (git clean) |
| ROI-A (legacy) | `7ec72147790e` | unchanged; the existing 13 regression tests pass |
| ARES-1 catalog | `572fba1ce61f` | unchanged |

**Source rasters:** all under `https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/`:
- `HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif`
- `HiRISE/JEZ_hirise_soc_007_orthoMosaic_25cm_Ortho_blend120.tif`
- `CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif`

## What is integrated

- **Stage A, regional map** (Mission Control):
  - the controlled CTX 6 m mosaic, north up, shown at ground aspect (eqc lat_ts 0 corrected by cos lat);
  - markers for M0 Three Forks, A Skinner/Wildcat Ridge and B Bright Angel (approximate rover waypoints), plus the ROI-A box and the M0–A analysis footprint;
  - Cursor's `OrbitalMagnifier` is fed by `regionalPixelToGeo` from the verified sidecar (no screen-pixel guesses), and dragging a rectangle opens a native-pixel detail view with "Open M0–A planning" / "Open ROI-A planning".
- **Stage B, M0–A planning:**
  - an explicit region selector: ROI-A (CTX 20 m demo), M0–A (HiRISE 2 m prototype), and B (disabled);
  - M0–A becomes selectable only after `loadM0A` passes all runtime checks: index role and path, manifest hashes for the required M0–A files, `terrain.json` hash, accepted grid (2 m, lat_ts 0, R 3 396 190 m, cos lat applied once), endpoints re-snapping to their recorded cells, endpoints not on NoData;
  - a tampered byte keeps M0–A disabled with the reason shown, while ROI-A keeps working (tested);
  - the existing TS engine routes on the 2 m grid. Route notes are replaced with the M0–A limitations (the engine's generic "20 m" note does not apply);
  - an honest `NO_ROUTE` and no NoData bridging come from the engine and are tested in `analysis/m0a`.
- **Stage C, destinations:**
  - typed and clicked points both go through `parseMarsCoordinate` / `inspectDestination` (`core/src/destination.ts`);
  - the card shows coordinate, region context (grid footprint and distance to the nearest catalog waypoint), DEM elevation with dataset and "vertical datum UNVERIFIED", coverage cells, precision, slope and routing availability;
  - "Plan route to this destination" is enabled only when `routable_in` is set.
- **Stage D, layer registry** (`web/src/layers.ts`):
  - imagery (CTX or HiRISE per region), hillshade, elevation, slope, an experimental steepness mask (> 24.2°, "NOT a certified hazard") and coverage/NoData;
  - every active layer shows role, units, legend, source, resolution, processing and limitation;
  - unavailable layers (illumination, shadows, weather, temperature, dust, minerals, radiation) are listed as not available, never faked;
  - roughness and contours were not added.
- **Stage E, 2D/3D:**
  - M0–A 3D uses the same grid and `projToScene`. Every 2D route vertex appears in the 3D polyline at the same E/N, and the mesh is north-up (tested);
  - the texture is exactly 2 × 2 px per cell on the same footprint;
  - the legacy HiRISE display layer is hidden in M0–A (no CTX/HiRISE datum mixing), and all ROI-A 3D tests pass.

## Route metrics (M0–A, Minetti; matches `analysis/m0a/results/routes_f8de9017164a.json` to 1e-9)

| Route | Length | Steepest edge | Model cost |
|---|---|---|---|
| Shortest | 416.426 m | 22.0° | — |
| Terrain | 416.426 m | 18.2° | 664.390 flat-equivalent m, vs 673.498 for the shortest route under the same model (LOWER) |

**Limitations shown in the UI:**
- candidate route corridor, not a surveyed path;
- other independent stereo DTMs move the line by up to ~39 m at < 0.5 % cost change;
- rover positions, not tube or rock points;
- 24.2° is an experimental algorithm threshold;
- S6 cost curve, vertical datum and G1/S-4 remain open;
- the 1.2 m image match does not validate DEM registration.

## Tests (all on `integ/s4-rc`; full run at `bb63cd2`, affected suites re-run after the last UI change)

| Suite | Result |
|---|---|
| core | 38/38 |
| web unit | 49/49 (incl. new `m0a.test.ts` 8/8) |
| M0–A analysis (`node --test analysis/m0a/m0a.test.ts`) | 8/8 |
| pipeline (pytest) | 27/27 |
| ARES-1 | 14/14 |
| Bundle reproducibility | M0–A offline rebuild = `f8de9017164a`; Python oracle and sensitivity rerun byte-identical; regional online rebuild = `d3d62fc34c56` |
| Production build | OK |
| Playwright, dev server | 15/15 (13 previous + 2 new) |
| Playwright, production preview (`vite preview`) | 15/15 |
| Performance (headed Chrome) | 1/1 |

The new browser tests cover the regional map, the magnifier at M0–A, typed and clicked destinations, M0–A planning numbers and layers, M0–A 3D, legacy ROI-A, tampered-bundle fallback, and no external requests.

## Screenshots (this folder, from the real app)

1. `s4-01-regional-map.png`
2. `s4-02-magnifier-m0a.png`
3. `s4-03-mission-control.png`
4. `s4-04-m0a-planning-layers.png`
5. `s4-05-destination-card.png`
6. `s4-06-m0a-3d.png`
7. `s4-07-roi-a-legacy.png`

## Remaining defects and limits

1. **East-west stretch on lat_ts 0 grids.** The M0–A 2D map and 3D scene draw in projected metres (lat_ts 0), so east-west appears about 5.4 % wider than ground. Metrics, profiles and the scale bar are in ground metres, and 2D and 3D agree with each other. A proper fix changes the contract's SCENE definition: CR needed.
2. **Performance coverage:** the perf suite measures ROI-A only. M0–A 3D renders (texture "ready" in the browser test), but its frame rate is not measured separately.
3. **Build size:** 19 MB, against the plan's 5 MB target (HiRISE display packages and the basemaps).
4. **Route to a destination** keeps the region's default start and sets the destination as the goal. A typed start is not offered.
5. **Changes to Cursor's components** (Cursor should be told):
   - the local coordinate parser was removed, so the shared core parser is used;
   - the synthetic preview page with an invented elevation was removed;
   - native image drag no longer cancels the magnifier selection;
   - the card label "Named area" became "Region context";
   - the card shows the routing reason;
   - the magnifier's own "Open route planning" button is disabled with an explanation, because planning opens from the detail view.
6. **Not built:** roughness, contours, illumination and shadow models (by decision).
7. **Scientific items open:** G1/S-4, vertical datum, S6 cost curve, and the B analysis grid (B routing disabled).

## Human acceptance checklist

- [ ] Mission Control shows the regional CTX map north up, with M0, A, B, the ROI-A box and the M0–A footprint in plausible places (delta to the west, crater floor to the east).
- [ ] Dragging a rectangle over M0–A opens the detail view, and "Open M0–A planning" opens Planning on M0–A.
- [ ] M0–A Planning: 416.426 m for both routes, the terrain cost is LOWER, and the corridor and limitation texts are visible.
- [ ] Layers: elevation, slope and steepness legends carry source, units and limitation text, and nothing unavailable is shown as data.
- [ ] Destination: typing 18.458931, 77.406171 gives HiRISE elevation with "vertical datum UNVERIFIED" and routing available; clicking B gives "Outside every analysis grid" and routing disabled.
- [ ] M0–A 3D: terrain and both routes are visible, the HiRISE display toggle is absent, and the caption names the M0–A grid.
- [ ] ROI-A: 969.161 m / 1058.299 flat-equivalent m, the S-4 line, the HiRISE display toggle and flyover all unchanged.
- [ ] Network off: reload works.

## Recommendation

**GO** for human acceptance testing and for use as the submission demo candidate. All automated gates pass and the scientific limits are stated in the UI.

**NO-GO** for any claim beyond a prototype (safety, energy, surveyed path) and for merging into `main` until you have run the checklist and approved it.
