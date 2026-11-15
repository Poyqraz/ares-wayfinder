# Slides outline (7 slides maximum)

> The submitted deck is [ARES_WAYFINDER_SLIDES.pdf](ARES_WAYFINDER_SLIDES.pdf). Its photographs are credited on each slide
> (NASA/JPL-Caltech; ESA Mars Express for the Jezero image) and keep their own terms; they are not covered by the
> repository licence. This outline is an earlier plan.

> **Working draft from release s5-rc1.** It describes the earlier two-route demo and its screenshots.
> The current build has three routes, mission B (Amalik) and the EVA HUD; current pictures are in
> `docs/images/`. Update the shots before recording or presenting.

## Rules

- **Length and language:** at most 7 slides, in English.
- **Link:** a public link. **[TEAM TO ADD link]**
- **No NASA logos.**
- **Screenshots:** all come from `docs/checkpoints/s5-rc1/` and are captures of the real app.
- **AI watermark:** if the team adds any AI-generated picture, it must carry a visible
  "AI-generated" watermark.
- **Judging criteria:** Impact, Creativity, Validity, Relevance, Presentation. The line under each
  slide says which criterion it serves.

---

## Slide 1: Ares Wayfinder: plan a Marswalk on real Mars data

**Screenshot:** `s5-01-regional-map.png`

- The first people on Mars will need to know where they can walk, and how sure we are about the
  ground.
- Ares Wayfinder is an offline web app for planning a Marswalk in Jezero crater.
- It is built on public NASA and USGS data, with the source of every number visible.
- Challenge: *Interplanetary Survival Guide: Martian Map*.

*Criteria: Relevance, Impact*

## Slide 2: Real data, traceable to the record

**Screenshot:** `s5-03-mission-control.png`

- Regional map from the controlled USGS CTX 6 m mosaic (MRO), shown north up.
- Four ARES-1 science missions:
  - M0: Three Forks sample depot;
  - A: Western delta front (Skinner Ridge / Wildcat Ridge);
  - B: Amalik / Enchanted Lake (Shuyak and Mageik cores; Mageik lies in the M0 depot);
  - C: Bright Angel (the former B).
- One line for the jury on B: "We moved B to Amalik because NASA drilled two real sedimentary cores there and
  left one of them, Mageik, in the M0 depot, so A, M0 and B form one compact delta investigation."
- B is about 407 m from the M0 reference waypoint in a straight line. The candidate corridor on the wider
  terrain grid is 438.6 m (prototype).
- Read-only Science Atlas built from PDS and NASA records:
  - 10 depot tubes;
  - four sample cores;
  - 9 Bright Angel claims;
  - MEDA sol 516 pressure.
- Positions are rover positions. The exact tube positions are not published, so the app says "not
  available" instead of guessing.

*Criteria: Validity, Relevance*

## Slide 3: From orbit to a 2 m terrain grid

**Screenshot:** `s5-02-magnifier-m0a.png` (optionally next to a crop of `s5-04-m0a-planning-layers.png`)

- Drag a box on the orbital map to open a planning region.
- M0–A: the USGS HiRISE 1 m elevation model, averaged to a 2 m analysis grid. ROI-A: the JPL CTX
  20 m engineering demo.
- Layers: imagery, hillshade, elevation, slope, experimental steepness mask, NoData. Each one shows
  its source, units, resolution and limits.
- Layers we do not have (illumination, weather, radiation and others) are listed as "not
  available", never faked.

*Criteria: Creativity, Presentation*

## Slide 4: Two routes, one honest comparison

**Screenshot:** `s5-04-m0a-planning-layers.png`

- From the M0 depot-drop rover position to the Skinner Ridge sampling rover position: 387 m apart.
- Both routes are 416.4 m long on the grid.
- Terrain-aware route: every 2 m step at or below about 18°. Shortest route: up to 22° (22–29° on
  independent stereo elevation models).
- Model cost is 1.4 % lower for the terrain-aware route, under the same model.
- **This is a candidate route corridor, not a surveyed path.**

*Criteria: Impact, Validity*

## Slide 5: Ask about any point, see it in 3D

**Screenshots:** `s5-05-destination-card.png` and `s5-06-m0a-3d.png`

- Type a coordinate or click the map.
- The app reports elevation, data coverage and whether a route can be planned there. If not, it
  says why.
- The 3D flyover uses the same grid as the route, so 2D and 3D show the same points.
- The vertical datum is labelled "UNVERIFIED" on elevation readouts and legends.

*Criteria: Presentation, Creativity*

## Slide 6: How we know it works, and where it does not

**Screenshot:** `s5-07-roi-a-legacy.png` (it shows an open issue stated in the UI: "CTX DEM/image
registration UNRESOLVED (S-4)")

- **Independent check.** The TypeScript A* route engine matches an independent Python Dijkstra.
  The largest relative difference is 1.4e-16.
- **Data integrity.**
  - Hash-checked data bundles can be rebuilt byte-for-byte.
  - A changed byte disables the region.
  - All automated tests pass, and the app makes no network requests.
- **Sensitivity.** On other HiRISE stereo elevation models the line moves by up to about 39 m, at
  about 0.5 % cost change or less. That is why we call it a corridor.
- **Limits.**
  - The 24.2° cutoff is an algorithm setting, not a safety limit.
  - The cost curves come from Earth walking data.
  - The vertical datum is unverified.

*Criterion: Validity*

## Slide 7: Impact and what's next

**Screenshot:** none, or a small `s5-01-regional-map.png`

- **Impact:** a pattern for mission maps that show their evidence and their uncertainty, not only
  a line.
- **Next steps:**
  - finish the named terrain features: F01 automated check awaiting geology review, F02 and F03 pending;
  - validate the cost curve for suited EVA;
  - build an analysis grid for Bright Angel (C).
- **What we do not claim:** EVA safety, energy savings, life detection, hazard certification,
  weather maps or radiation maps.
- **Credits:**
  - Data: NASA PDS, USGS Astrogeology, MRO CTX & HiRISE, Mars 2020 (MEDA, sample records,
    MMGIS).
  - Built with AI assistance (Claude Code, Cursor); see the AI disclosure.

*Criteria: Impact, Presentation*
