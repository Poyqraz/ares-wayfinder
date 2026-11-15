# s14-rc1: missions M0, A, B (Amalik), C (Bright Angel), and a clearer EVA visor

Branch `integ/s14`, base and rollback checkpoint `s13-rc1` (71008c8). Not merged, not pushed.
No dataset, catalog, bundle, contract file or planner change. The frozen references are unchanged and re-tested:
ROI-A 969.161 m / 1093.229 / 1058.299 flat-equivalent m (LOWER), M0-A 416.426 m / 664.390, conservative 453.513 m.

## 1. Mission structure

| Mission | What it is | Routing |
|---|---|---|
| **M0** Three Forks | Recover the ten depot tubes | Prototype corridor on the M0-A grid (unchanged) |
| **A** Western Delta | Skinner Ridge and Wildcat Ridge outcrops | Prototype corridor on the M0-A grid (unchanged) |
| **B** Amalik / Enchanted Lake | Lower delta sediments where Perseverance drilled Shuyak and Mageik | **None: inspection only** (see section 3) |
| **C** Bright Angel | The former B: Cheyava Falls rock, Sapphire Canyon core, nine claims | None: no validated grid (unchanged) |

- **Bright Angel was renamed, not deleted.** All its records, claims and limitations are shown under C.
  The frozen catalog `572fba1ce61f` and basemap `d3d62fc34c56` still call it mission B / `waypoint:B` / claims B-01 to
  B-09; they were not edited, and the app says so ("Recorded as mission B in the frozen catalog").
- **Mageik and Shuyak are separate records.**
  - Shuyak `M2020-575-16`: cored and sealed on sol 575, 55.5 mm, on the rover.
  - Mageik `M2020-00579-17`: cored on sol 579, sealed on sol 619 (40 sols later, after sealing faults), placed at
    Three Forks on sol 655, 73.6 mm. It is one of M0's ten tubes; the M0 tube card now says
    "Collected at: Amalik (the outcrop of mission B)", and B's Mageik card points back to M0.
- **Positions are rover positions during sampling**, never the drill hole, the rock or an approved astronaut
  waypoint. Both cores share the Amalik marker; the two report positions differ by 0.28 m and no third point was made up.
- **Colours:** M0 gold, A orange, B blue, C lilac, features pink, hypothetical sites teal.

### Where it shows
- **Mission Control:** four mission tabs, cards and sequence chips; the map marks Amalik just west of the dashed M0-A
  grid box; selecting B frames M0, A and B together. The B card states the routing limit, gives the straight-line
  distances, and has folded panels for uncertainty, five sources and four NASA image links.
- **Orbital overview:** the cluster label reads "ARES Base · M0 · A · B"; Bright Angel is labelled C.
- **Planning:** the region selector has "B Amalik · no routing" and "C Bright Angel · no routing". Both open the
  inspection view (CTX 6 m image, markers, records). Clicking open ground there inspects that point and offers no route.
- **Regional Relief 3D:** a B pin and an Amalik marker with their evidence and limits; a C group for Bright Angel.
- **3D Terrain and EVA HUD:** for B and C a notice with the specific reason; no terrain or walk from another mission is shown.
- **Science Atlas:** a new "B Amalik / Enchanted Lake" section (outcrop description from the PDS report, a table with
  coring, sealing and depot-drop sols for both cores, uncertainty, sources, imagery) and the old section retitled
  "C Bright Angel".
- **Submission documents** (`docs/submission`): mission lists, the B limitation and the EVA HUD line updated.

## 2. Science sources and what was checked

| Claim | Source | Checked here |
|---|---|---|
| Shuyak: 18.45068954 N, 77.40143171 E, -2526.32 m; cored 2 Oct 2022; sealed sol 575; Novarupta patch 8 mm; lithology | PDS *Mars 2020 Initial Reports, Vol. 2*, sheet 16-1 | **Yes**, against the PDF (sha256 `914a4baa…b9f123`); digits match the hand-off |
| Mageik: 18.45068664 N, 77.40143554 E; sols 579 / 619 / 655 | ARES-1 catalog (from the same PDS volume and the Three Forks tables) | **Yes**, read from the frozen catalog at run time |
| Shuyak is Sample 14, on the rover; Mageik is Sample 15, in the depot | NASA Mars Rock Samples page | **Yes**, fetched today |
| Amalik: Enchanted Lake member, about 4 m below the rim of Cape Nukshak, olivine-bearing coarse mudstone, weak fluorescence | PDS sheet 16-1, summary description | **Yes** |
| Comparison with Skinner Ridge and Wildcat Ridge | Bosak et al. 2024 (AGU Advances), via the hand-off | **No**: cited, not re-read |
| "Amalik is about 5 m wide" | Bosak et al. 2024, via the hand-off | **Not used**: could not be checked |
| Straight-line distances 406 / 533 / 555 m | Hand-off (sphere of 3389.5 km) | **Recomputed**: 407 / 534 / 556 m on the catalog sphere (3396.19 km) |

- **Source disagreement kept visible:** the hand-off reports that Table 1 of Bosak et al. (2024) appears to swap
  which Amalik core went to the depot. NASA's list and the PDS depot records agree with each other and are followed;
  the note is shown under "What is uncertain".
- **Wording:** "potential to preserve biosignatures", never a detection. "No evidence of life has been established"
  appears on the B card, the B targets and the Atlas section. Tests scan for forbidden wording.
- **Imagery:** four NASA pages are linked (sol 424 Enchanted Lake view, sol 575 Shuyak drill site, the Shuyak and
  Mageik video, the depot panorama). No image was downloaded or bundled, so the app stays offline; the links need
  a connection and say so.

## 3. Can a route to B be supported? No.

`analysis/s14/b_coverage.ts` (results in `analysis/s14/results/b_coverage.json`), using the app's own projection code:

- M0-A grid `f8de9017164a` (HiRISE 2 m): Amalik falls at column -42.8 of 259. It is **81 m west of the grid's
  edge**, level with rows inside the grid. ROI-A (CTX 20 m): 1.9 km outside.
- So there is no validated elevation, slope, registration or NoData information at Amalik in this build, and none
  was extrapolated. B is an inspection target; the limit is stated wherever a route would be offered.
- The numbers shown for B are straight lines between recorded rover positions and are labelled "not walking distances".
- What it would take (not done, needs approval): a wider HiRISE bundle with its own validation gates. The existing
  bundle and reference routes would stay untouched. See `docs/decisions/CR-008-missions-m0-a-b-c.md`.

## 4. EVA visor

**Before:** five stacked text panels on the right, two long sentences at the top, a card that opened by itself.
**Now, inside the visor:**
- top: a small "Simulated preview" pill and the compass;
- left: distance to destination (large), then walked, elevation, slope ahead, climbed as one short list;
- right: the scenario dust-storm pill, the next waypoint with its distance, the suit strip, the mini-map;
- centre: only navigation and terrain callouts (steep step ahead, bend ahead, arrival);
- bottom: the elevation strip and the playback controls.

**Suit strip (new):** heart rate 88 bpm with a small beating heart, O2 reserve 84 %, suit pressure 29.6 kPa,
labelled "Simulated demo values · not sensor readings". The three numbers are constants; a test confirms they do not
change during playback. The heart icon pulses at a fixed rate and stops for users who ask for reduced motion.
The values are illustrative for a fictional ARES-1 suit and are described that way in the app.

**Moved out of the forward view:**
- route-marker explanations open only when the next-waypoint tile or a marker chip is pressed, and close again.
  Coming near a waypoint highlights the tile instead of opening a card;
- the storm explanation stays behind its pill;
- the long caption, the vertical-exaggeration note, the rendering notes, the suit note and the historical MEDA
  record are in "About this preview" under the visor, closed by default.

Measured in the browser test: the side panels cover under 20 % of the visor, the right column holds fewer than
240 characters, and the mini-map is whole at 1440 x 900 and 1024 x 768.

## 5. Found and fixed during review
- **Real defect, caught by an existing test:** an attribute I added to the inspection view made every click on its
  map re-select the mission instead of inspecting the clicked point. Fixed, and a new test covers it for B.
- The B selection first framed only Amalik and the depot; it now frames M0, A and B together.
- The mini-map was clipped by the visor edge at 1024 x 768; it is smaller there.
- Stale expectations in 9 older tests were updated on purpose (mission letters, marker counts 23 to 25, the removed
  "No telemetry" tile, the auto-opening marker card).

## 6. Tests (on the committed code, one full run)
- Web unit **105/105** (6 new), build OK; core 41/41, pipeline 43/43, ARES-1 14/14, M0-A analysis 8/8.
- Browser, Chromium: dev **46/46**, production preview with DNS disabled **46/46** (2 new tests).
- Real Chrome on NVIDIA RTX 4060: perf suite **9/9**; EVA 144 fps with the new visor at 1440 x 900.
- Screenshots of every affected scene were looked at (list below).

## 7. Limitations
- B has no route, no slope analysis and no detailed 3D. Its marker is a rover position, not an access point.
- The Shuyak record is a transcription in code, not a hashed catalog record. A catalog v2 through the ingest
  pipeline is the proper home (CR-008).
- The A-versus-B comparison and Table 1 of Bosak et al. (2024) were not re-read.
- The historical images are links, not bundled: no pictures of Amalik appear offline.
- The suit indicators are constants. There is no suit model and no telemetry.
- `docs/submission` was updated for the missions and the EVA line only; its screenshots and 30 s video script still
  describe the older two-route demo flow.
- Internal names kept to limit churn: the component file `BExplore.tsx` now serves B and C; the Atlas overview map
  keeps the frozen feature id for Bright Angel in its test id.
- Carried over: everything in the s13-rc1 report (conservative-route parameters, CR-007, DEM registration and
  vertical datum, Minetti coefficients, F01 to F03 reviews, physical network-off reload by a person).

## 8. Pictures
Real Chrome on the GPU (`s14-app-*.png`): `01` to `04` Mission Control (overview, B, Mageik, C), `05` Orbital,
`06` B inspection, `07` C exploration, `08` 3D notice, `09` to `12` Regional Relief (overview, B, Amalik, C),
`13` and `14` Atlas B and C, `15` Planning M0-A, `16` to `21` EVA visor (default, marker details, storm details,
Scientific View, About panel, 1024 x 768), `22` Mission Control at 1024 x 768.
Headless test shots: `s14-01` to `s14-06`.

## 9. Assessment: GO for human acceptance; merge needs two decisions
- **GO** as a release candidate: all suites pass, the references are intact, B's limit is explicit, C keeps its records.
- **Before merge:** approve or reject CR-008 (and CR-007 from S13); a science teammate should confirm the B wording
  and the Bosak Table 1 note.
