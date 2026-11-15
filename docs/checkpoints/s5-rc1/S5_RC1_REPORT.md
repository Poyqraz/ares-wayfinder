# S5 RC1: S4 acceptance corrections + F01 three-raster verification

| Item | Value |
|---|---|
| Branch / worktree | `integ/s5-rc` in `ares-wayfinder-wt-s5`, from `s4-rc1` (`98534de`, unchanged) |
| Untouched | `main` `2d255d6`; `s4-rc1`, `s3-rc1`, all `ckpt/*`; Cursor's worktrees; ARES-1 catalog `572fba1ce61f`; M0–A bundle `f8de9017164a`; ROI-A/ROI-B/HiRISE display bundles and `web/public/data/index.json` |
| Data versions | M0–A `f8de9017164a`; regional basemap `d3d62fc34c56`; terrain-feature layer `1c0248bfeda3` (new; rebuilt twice from the official rasters, byte-identical) |
| Merge to main | not done; needs your approval |

## Priority 0: root causes and corrections

### 1. The 5.4 % east-west stretch (M0–A)

- **Cause:** both displays used projected metres as display metres.
  - 2D: `map.tsx` set the viewBox width to `nx·dx_proj`, and the map frame took its shape from the cell counts.
  - 3D: `core/coords.projToScene` set `x = E − E_c`.
  - On the lat_ts 0 M0–A grid, one projected metre east-west is 1/cos 18.456° = 1.054 ground metres.
- **Fix (CR-005, `docs/decisions/CR-005-scene-ground-scale.md`, contract §1 and change log):** `groundScaleX = dx_ground_m/dx_proj` is applied in:
  - `projToScene` and `sceneToProj`;
  - the 2D SVG x axis (`web/src/mapGeometry.ts`);
  - the map frame;
  - the 3D camera span.
- **What stays the same:**
  - ROI-A's factor (1.00006) is under the 0.1 % threshold, so its coordinates are bit-identical;
  - the route engine, cells, vertices, lengths, profiles and costs (M0–A 416.426 m / 664.390; ROI-A 969.161 m / 1058.299).
- **Tests:**
  - 100 m east-west and 100 m north-south control distances, in 2D and in 3D;
  - the rendered map aspect is within 1 % of ground;
  - click ↔ ground round trips land in the same DEM cell;
  - the route start meets the rover-position marker within 4 px;
  - the scale bar is in ground metres.

### 2. "POI evidence record invalid; showing legacy statuses"

- **Cause:** the M0–A rover-position evidence I built in S4 had an empty `url`, so the whole record failed validation.
- **Data fix:** real source URLs and printed elevations are now copied from catalog `572fba1ce61f`:
  - NASA MMGIS M20 waypoints, RMC 32_774;
  - PDS Initial Reports volume 2, p. 14.
- **Logic fix:** `evidenceKind()` now separates four cases:
  - missing (legacy POI, no notice);
  - incompatible (another schema, with its own notice);
  - invalid (the CR-004 golden text is kept, with details from `evidenceProblems()`);
  - valid.
- **Result:** both M0–A POIs show "Coordinates VERIFIED" (source position / PDS rover position) and "Target location: APPROXIMATE". Their names say "not a tube location" and "not a rock centre".

### 3. "validity 0" on the destination card

- **Cause:** the raw mask code was shown as text. Code 0 means VALID, but users read it as "invalid". The routing logic was already correct: codes 0 and 3 route; 1 and 2 do not.
- **Fix:** the card now uses the contract convention:
  - 0: valid DEM cell (routable);
  - 1: NoData (not routable);
  - 2: outside the grid (not routable);
  - 3: valid elevation, slope undefined (routable).
- **Tests:** all four codes are checked against routability.

## Priority 1–2: terrain-feature evidence (team plan v0.9)

**Layer:** `analysis/features/1c0248bfeda3` (schema `ares-terrain-feature/1`), served by the app from its own hash-checked index.

| Feature | Anchor (NASA MMGIS, exact match) | Geometry | Raster status | Measurements |
|---|---|---|---|---|
| F01 Western delta fan front / Hawksbill Gap | sol 501, RMC 26_1154 | algorithmic crest/foot candidates + transect | AUTOMATED_MEASUREMENT_PENDING_REVIEW | see below |
| F02 Belva crater | sol 770, RMC 39_650 | null | PENDING | null (published ~0.9 km kept as literature) |
| F03 Neretva Vallis / Bright Angel | sol 1210, RMC 56_0 | null | PENDING | null |

- Feature IDs are separate from missions M0/A/B.
- Anchors are flagged `is_feature_centre: false`.
- Features are never used for routing, and `validated_for_human_eva` is false.

### F01: one real three-raster verification

**Sources** (explicit selection, all eqc lat_ts 0, R 3 396 190 m; window pixels read, 0 % NoData in every window; window SHA-256 values in `F01_qa.json`):

| Code | Product | DOI |
|---|---|---|
| CTX-2020 | `JEZ_ctx_B_soc_008_orthoMosaic_6m` | 10.5066/P9GV1ND3 |
| DEM-2020 | `JEZ_hirise_soc_006_DTM_…_1m_…_blend40` | 10.5066/P9REJ9JN |
| HIRISE-2020 | `JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first` | 10.5066/P9QJDP48 |

- HIRISE-2020 is pixel-aligned with the DTM (same origin, 4 × 4 pixels per DTM pixel). It is **not** the `soc_007 Ortho_blend120` display product.
- The DOIs are taken from the team document; the file names and headers were verified here.

**Window and outputs:**
- A ±350 m window around the anchor, the same window in all three rasters, at ground aspect.
- Four panels: CTX, hillshade 315°/45°, hillshade 90°/45°, HiRISE.
- Geometry, numeric profile (401 samples, mosaic plus stereo pairs C/W/DL), profile plot, and a machine-readable QA file.

**Boundary:** algorithmic break-in-slope crest and foot along 25 transects (slope threshold 10°, 10 m baseline). This is a candidate, not a hand-digitised contact. It is visible in all four panels.

**Nominal transect through the anchor:**

| Measure | Value | Range across independent stereo DEMs | Range across picking thresholds (8–12°) |
|---|---|---|---|
| Δz | 8.36 m | 8.15–8.62 m | 8.20–8.89 m |
| Horizontal span | 23 m | — | 22–27 m |
| Mean transect slope | 20.0° | 19.5–20.0° | 18.2–20.5° |
| Local cell slope p50 / p95 / max | 9.9° / 31.8° / 32.5° (193 cells) | p95 29.6–31.8° | — |

**Reported separately:**
- **Resolution:** DEM 1 m posting / 2 m cells; effective resolution several metres.
- **Vertical:** inter-DEM ranges above; per-edge grade noise ≤ 0.048; datum UNVERIFIED.
- **Registration:** CTX vs HiRISE 0.73 m E / −0.92 m N (NCC 0.91); DTM vs HiRISE 1.56 m E / 0.08 m N (NCC 0.55).
- **Interpretation limits:** a multi-part front; a geologist may place the contact differently.

**Status:**
- `qa_status = LITERATURE_CONFIRMED`; `reviewer = null`;
- the next step is `THREE_LAYER_VISUALLY_CONFIRMED` by the geology teammate;
- **submitted for review; not self-certified.**

## Priority 3: presentation

- **Orbital map:** full width, with a ground-metre scale bar, clear magnifier instructions, and F01–F03 anchor diamonds.
- **Planning map:** larger (grid row ≥ 420 px, narrower side panel, 160 px profile) in a ground-aspect frame.
- **Legends:** source, resolution, processing and limitation are folded into an expandable section.
- **Destination card:** compact (coordinate, elevation, routing), dismissible, with region context and details one click away.
- **Measured frame rate** (headed Chrome on this machine): M0–A 3D 144 fps, ROI-A HiRISE 140 fps; floor 30. The likely cap is the display refresh rate.
- **Offline:** the production-preview suite runs with `--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1` (no host name resolves except the local server), plus a page reload. A real network-adapter disconnect was not done, because it changes system settings; the manual check is in `docs/submission/DEMO_RUNBOOK.md`.

## Tests (commit `c88725b` plus report/docs)

| Suite | Result |
|---|---|
| core | 41/41 (incl. CR-005 scene scale) |
| web unit | 57/57 (incl. aspect/E-W/N-S, evidence states, validity mask, feature layer, golden CR-004) |
| M0–A analysis | 8/8 |
| pipeline | 33/33 (incl. F01 source, pixel, geometry, measurement and QA tests) |
| ARES-1 | 14/14 |
| build | OK |
| Playwright, dev | 15/15 |
| Playwright, production preview with DNS disabled | 15/15 |
| Performance (headed Chrome) | 2/2 |

## Screenshots (this folder)

| File | Shows |
|---|---|
| `s5-01-regional-map.png` | Orbital map with scale bar |
| `s5-02-magnifier-m0a.png` | Magnifier at M0–A |
| `s5-03-mission-control.png` | Mission Control |
| `s5-04-m0a-planning-layers.png` | M0–A Planning with layers, ground aspect and scale bar |
| `s5-05-destination-card.png` | Compact destination card |
| `s5-06-m0a-3d.png` | M0–A 3D |
| `s5-07-roi-a-legacy.png` | Legacy ROI-A |
| `s5-08-terrain-features.png` | F01–F03 panel with the F01 evidence |

## Open limitations

- **F01 review:** the measurement needs geology review and possibly a hand-drawn boundary plus a second independent tracing.
- **F02 / F03:** raster measurements pending; B also needs a check of the CR_SOUTH stereo parallax.
- **Science items:** G1/S-4 DEM registration, vertical datum and S6 cost curve remain open. The ortho image matches (1.2 m, 0.7–0.9 m) do not validate DEM registration.
- **CR-005:** needs your formal contract approval; it is implemented and documented.
- **Build size:** about 20 MB (target 5 MB).
- **Physical offline:** a real network-off reload must be done by a person on the demo machine.

## Recommendation

**GO** for internal acceptance of s5-rc1 and as the demo build for submission. **NO-GO** for claiming F01–F03 as scientifically verified, and for merging to `main` without your approval.
