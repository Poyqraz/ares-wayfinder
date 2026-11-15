# S2 waypoint validation, HiRISE acceptance review, scientific controls (2026-11-14)

Read-only on every branch except this report and its probe scripts (`pipeline/probes/s2/`,
`pipeline/probes/hirise/s4_*.py`). No bundle, `core/`, `contracts/`, frontend or `main` change.

## 1. S2 — waypoint verification

**Method.** Primary sources were located by a research subagent. I re-checked the key numbers myself:
- PDS PLACES `best_interp.csv` / `best_tactical.csv`, downloaded and parsed;
- PDS Sample Dossier Initial Reports volume 1, text extracted from the PDF.

Grid cells come from `@ares/core` `geoToProj` / `projToCell` / `cellCenter`
(`pipeline/probes/s2/s2_cells.mts`).

**Coordinate convention (verified).**
- PLACES columns are `planetocentric_latitude` and `longitude` (east-positive). Elevation is relative
  to the areoid; the label says "relative to the datum", and an `areoid` radius column is given.
- The Initial Reports print "Latitude (N), Longitude (E), Elevation" and agree with PLACES to ≤ 0.3 m.
- No conversion was needed.
- **All values are rover positions** (SITE origin or parked pose) during the activity, **not the
  position of the rock or abrasion patch.** The workspace reach is a few metres.

**Base-map frame (verified).** PLACES `dem_pixel` / `map_pixel` steps between Site 1 and Site 7 match a
1 m DEM and a 0.25 m map in an equirectangular frame with lat_ts ≈ 18.47°:
- the line differences equal my HiRISE pixel math (823.2 px DEM, 3 292.77 px map);
- the sample differences scale by 0.9486 = cos 18.44°.

The mission localized the rover on HiRISE-class 1 m / 0.25 m products, so these coordinates are in the
HiRISE frame.

| Target | Primary source (opened) | Printed lat N, lon E, elev (areoid) | Working coord Δ | 2nd source Δ | Event | CTX cell (row, col), validity | HiRISE 2 m cell | HiRISE h − PDS elev | CTX h − PDS elev | Confidence |
|---|---|---|---|---|---|---|---|---|---|---|
| Octavia E. Butler landing | PDS `urn:nasa:pds:mars2020_rover_places` `best_interp.csv`, frame SITE, site 1 | 18.444627146, 77.450885729, −2569.910 m | 0.4 m | `best_tactical` SITE 1: 3.6 m | landing sol 0 (2021-02-18, date REPORTED) | (22, 42), 0 VALID; 10.5 m from the cell centre | (220, 427) | −0.01 m | +2.55 m | **High** (position); ±3.6 m between PLACES versions |
| Roubion (sample #2, atmosphere only) | PDS `urn:nasa:pds:mars2020_sample_dossier` Initial Report M2020-164-2, p. 16 | 18.42769340, 77.45165066, −2584.96 m | 0.2 m | PLACES SITE 6: 0.28 m | Guillaumes abrasion/coring sols 157–168; sealed sol 164 | (72, 44), 0 VALID | (722, 448) | +0.06 m | +1.32 m | **High** |
| Rochette / Montdenier (#3), Montagnac (#4) | Initial Reports M2020-190-3 and M2020-196-4, pp. 36 and 59 | 18.43074132, 77.44436502, −2574.553 m | 0.3 m | PLACES SITE 7: 0.24 m | Bellegarde abrasion sol 182; Montdenier cored sol 190, sealed sol 194; Montagnac sol 196 | (63, 24), 0 VALID | (631, 243) | +0.01 m | −3.32 m | **High** |
| Sid / Hahonih (#9), Atsah (#10) | Initial Reports M2020-371-9 and M2020-374-10, p. 128 | 18.44386406, 77.45242176, −2568.357 m | 0.26 m | PLACES ROVER 11/108 parked pose: 2.6 m | Alfalfa abrasion sol 367; Hahonih sol 371; Atsah sol 374, sealed sol 377 | (24, 47), 0 VALID | (242, 470) | −0.24 m | −0.20 m | **High**; the 2.6 m pose difference is unexplained |

Also verified by the subagent:
- Simon et al. 2023, JGR Planets, doi:10.1029/2022JE007474, Table 1, prints 4–5 decimal roundings of the
  same values. Sid is printed longitude-first.
- MMGIS `M20_waypoints.json` sol 13 equals the landing position.

**Geology** (from Simon et al. 2023 and the Initial Reports; I did not re-read every sentence):
- **Rochette:** Máaz formation, Rochette member, Artuby ridge. Fine-grained mafic igneous rock, likely
  basalt (plagioclase, pyroxene, Fe-Ti oxides), with Fe oxides, Ca-sulfates, phosphate and minor
  carbonate. These are the first two rock cores of the mission. **Crater-floor igneous, not a delta
  sample.**
- **Roubion:** lower Máaz, basalt or microgabbro; Fe oxides, sulfates, perchlorate, possibly halite. The
  rock disaggregated during coring, so sample #2 holds atmosphere only.
- **Sid:** upper Máaz, Ch'al member, likely basaltic andesite. The least altered crater-floor samples;
  limited Fe oxide, carbonate, possible phyllosilicate/chlorite.
- **Landing:** on the crater floor. The geologic unit exactly at the landing point was not checked
  against a primary source.

**What the height agreement means.** HiRISE heights match the PDS elevations within 0.01–0.24 m. This
confirms our HiRISE ingest equals the frame the mission used. It is **not** independent proof of the
vertical datum, because PLACES itself was localized on HiRISE-class products.

### UNVERIFIED label: recommendation

All four **coordinates** may lose "UNVERIFIED". Replace it with:
"PDS-verified rover position during sampling (PLACES / Sample Dossier), not the rock itself; ≤ 4 m
between PDS products". Conditions that remain:
1. **S-4 (below):** the CTX DEM may be offset from the HiRISE/image frame by about 20–30 m north–south
   (weak evidence). A POI's *CTX cell* could therefore be one row off. Keep the note "CTX grid
   registration unverified (S-4)" on the cell, not on the coordinate.
2. The Landing role stays "historical landing site used as a hypothetical mission reference point;
   not a verified habitat site".

**Required data correction (not applied; needs your approval).** `science/pois.json` and the CTX bundle
copy `roi_a/fc22a0c8a91f/pois.json` still say "Coordinates UNVERIFIED until task S2". Landing cites NTRS
instead of PDS PLACES, and no claim names the member or sample numbers. Fixing this changes the CTX
`dataset_version`. That cascades to `hirise/index.json` and the manifest `aligned_to_ctx_*` fields (a
HiRISE rebuild), and to any frontend test that pins the CTX version. Route numbers would not change. I
recommend one approved data release that does all of it together.

## 2. HiRISE display integration — review of `feat/hirise-display` @ `a6caaca` against CR-003 @ `483cb10`

Scope: 14 files. No change to `core/`, `contracts/`, `pipeline/`, `science/`, the CTX bundles or
`data/index.json`. `main` = `2d255d6`. No agent-memory or transcript files committed. An untracked
`AGENTS.md` exists in the worktree and is not git-ignored.

| Check | Result | Reference |
|---|---|---|
| Bundle identity | `web/public/data/hirise` tree `f1d8dea…` is identical on `a6caaca` and `feat/data-core`: copied, not merged | git tree hash |
| Discovery + SHA-256 | index → role → CTX version → manifest hash/prefix → schema/layer_role → CTX version → adjusted flags → extent → per-file bytes + hash | `web/src/hirise.ts:124-241` |
| CTX compatibility | `aligned_to_ctx_dataset_version` and the manifest version must equal the loaded CTX | `hirise.ts:139`, `:162` |
| Float32 decoding | `DataView.getFloat32(i*4, true)`, little-endian, length `nx·ny·4` checked | `hirise.ts:113-118`, `:189` |
| Mesh/texture | `buildTerrainMesh({...grid, h_min: CTX h_min})`, same `cellUv` + `flipY=false` path as CTX | `TerrainView.tsx:512`, `configureTexture` |
| Orientation (rendered) | same camera, low-pass brightness of CTX vs HiRISE views: r = 0.556 as rendered vs −0.323 rotated 180° | my headless check |
| Draping | barycentric on the mesh's SW–NE split (weights hand-checked at 3 corners); ≤ 1 m densification; one missing sample rejects the whole line (no CTX/HiRISE mixing) | `hirise.ts:266-331`, `TerrainView.tsx:504` |
| CTX numbers unchanged | 969.161 m / 1093.229 / 1058.299 / LOWER identical before and after HiRISE mode and in every failure case | my headless check |
| Fallback | tampered `dtm_2m`, `ortho_0p5m`, HiRISE manifest and HiRISE index each give CTX + notice; also `MAX_TEXTURE_SIZE`, texture error, context loss | headless check; `TerrainView.tsx:532-584`, `:665` |
| CTX default | the 3D scene opens in "Visualization DEM: CTX 20 m ortho" | `TerrainView.tsx:491` |
| Tests | core 33/33, web 28/28, build OK, Playwright 12/12 twice | |

**Findings (no blockers).**
1. *Should fix:* the labels print the CR-003 placeholder brackets literally ("median [+1.66] m",
   "[1.24] m E", "[21] … artifacts") and hard-code the "+" sign before the median, so a negative median
   would read "+-…". See `TerrainView.tsx:57-66`. Fix: drop the brackets and use a signed format.
2. *Nice to have:* the `webglcontextlost` listener is never removed (`TerrainView.tsx:665`).
   "2006–2017" is hard-coded; the same text is in `manifest.credit`.
3. *Note:* JS heap was ≈ 364 MB in a HiRISE 2 m session (`performance.memory`, headless Chromium).
   Check on the demo laptop.
4. *Note:* `AGENTS.md` should be git-ignored in that worktree before anyone runs `git add -A`.

**Recommendation:** accept the display-only HiRISE integration after finding 1 (cosmetic, one function).

## 3. Scientific controls

| Item | Status | New evidence |
|---|---|---|
| G1 / S-4 (CTX DEM ↔ CTX ortho registration) | **OPEN, now with a weak signal** | HiRISE ortho ↔ CTX ortho = 1.2 m E, 4.3 m S (strong, NCC 0.72). HiRISE DTM ↔ HiRISE ortho ≤ ~2 m. HiRISE DTM ↔ CTX DEMs, by terrain correlation: HiRISE terrain sits **18–34 m north** of both the JPL CTX DEM and the USGS TRN CTX DTM. The two CTX DEMs are ~10 m apart. Peaks are shallow (Δr 0.015–0.06; plateau ≈ 28 m), but the shift appears in two metrics and against two references. That points to a possible ~1–1.5 cell north–south offset between the CTX DEM and the imagery. **Not applied, not claimed as measured.** Needs a feature-based check (crater rims) by the science lead. Scripts: `pipeline/probes/hirise/s4_dem_offset.py`, `s4_trn_offset.py`. |
| S6 (Minetti coefficients) | **OPEN** | No change; coefficients still from secondary sources (ADR-002). |
| Vertical datum | **OPEN (label stays UNVERIFIED)** | Supporting, not independent: HiRISE = PDS areoid elevations within 0.24 m at four sites. CTX (JPL) differs by −3.3 … +2.6 m at the same points. |
| CR-001 / CR-002 | **PROPOSED**, awaiting decision | No change; tests still green (core 33/33). |
| CR-003 | **Approved in principle**; implementation reviewed above | — |
