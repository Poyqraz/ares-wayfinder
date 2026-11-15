# Ares Wayfinder

**NASA Space Apps Challenge 2026 · Challenge: Interplanetary Survival Guide: Martian Map**

> Draft for the team. Every claim below is implemented and tested in release candidate s4-rc1
> (commit `98534de`). Do not add claims that are not in that build.

## Summary

Ares Wayfinder is an offline web app for planning a "Marswalk" in Jezero crater with real NASA and
USGS data. Mission Control shows a controlled orbital map with three science areas and a read-only
Science Atlas built from Mars 2020 PDS records. Planning compares two routes between two sourced
rover positions on a 2 m terrain grid made from a HiRISE elevation model: shortest distance and
lowest relative terrain cost. Both are 416.4 m long, but the terrain-aware route keeps every 2 m
step at or below about 18° of slope, while the shortest route reaches 22°. Every layer and number
shows its source, resolution and limits. It is a planning prototype, not a safety tool.

## The problem

When people walk on Mars, someone has to decide where they walk. Orbital maps of Mars are public,
but they are large, hard to read and easy to misuse. A pretty map can hide the most important
facts: how sharp the data really is, where it came from, and what it cannot tell you. A planning
tool that hides these facts is worse than no tool at all.

We asked: can a small team turn real NASA data into a route planner that is useful *and* honest
about every number it shows?

## What we built

An offline web app with three main views.

**1. Mission Control**
- A regional orbital map of Jezero crater from the controlled USGS CTX 6 m orthomosaic
  (`JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0`), shown north up.
- Four ARES-1 science missions:
  - **M0**: Three Forks sample depot (recover the ten tubes);
  - **A**: Western delta front (Skinner Ridge / Wildcat Ridge);
  - **B**: Amalik / Enchanted Lake, where Perseverance drilled the Shuyak and Mageik cores. Mageik is
    one of the ten depot tubes, so B, M0 and A belong to one compact delta-front investigation;
  - **C**: Bright Angel (the former B), the more distant investigation.
- A magnifier: drag a box on the map to see the native pixels and open planning for that region.
- A read-only **Science Atlas** built from PDS and NASA records:
  - the 10 Three Forks depot tubes;
  - the four sample cores from Skinner Ridge and Wildcat Ridge;
  - the Amalik outcrop and its two cores, with coring, sealing and depot drop kept as separate events;
  - 9 Bright Angel claims, each with its confidence, limitation and source (no life-detection claim);
  - the MEDA weather station pressure series for sol 516.

**2. Planning**, with two analysis regions:
- **ROI-A**: an engineering demo on the JPL CTX 20 m elevation model (Mangold et al. 2021).
- **M0–A**: a prototype analysis grid made from the USGS HiRISE 1 m elevation model (soc_006),
  averaged to 2 m.

In both regions you get:
- two route policies, *shortest distance* and *lowest relative terrain cost*;
- scientific layers: imagery, hillshade, elevation, slope, an experimental steepness mask and
  NoData. Each layer shows its source, units, resolution and limitations;
- layers we do not have (illumination, shadows, weather, temperature, dust, minerals, radiation)
  are listed as "not available". They are never faked.

**3. 3D terrain**
- A flyover of the same grid the routes were computed on, with both routes drawn in 3D.

**Destination tool**
- Type a coordinate or click the map.
- The app reports the DEM elevation, the data coverage at that point, and whether routing is
  available there (and why not, if it is not).

## How it works

1. **Data preparation (Python).**
   - We read windows of the public USGS/JPL rasters and build small versioned data bundles.
   - For M0–A, each 2 × 2 block of the 1 m HiRISE elevation model is averaged into one 2 m cell.
     If any of the four pixels is missing, the cell is marked NoData. Nothing is filled in.
   - Slope is computed with the standard Horn 3 × 3 method on true ground spacing.
2. **Bundles.**
   - Each bundle has a manifest with SHA-256 hashes.
   - The app checks the hashes when it loads. If one byte is changed, M0–A stays disabled and the
     app tells you why.
   - The bundles can be rebuilt byte-for-byte.
3. **Routing (TypeScript, in the browser).**
   - An A* search runs on an 8-connected grid, with no corner cutting and no crossing NoData.
   - *Shortest distance* minimises length.
   - *Lowest relative terrain cost* weights each step by a slope cost curve (Minetti; Tobler as an
     alternative).
   - Steps steeper than 24.2° are removed. This is an experimental algorithm setting, not a safety
     limit.
4. **Independent check.** A separate Python Dijkstra oracle (SciPy) gives the same answers. The
   largest relative difference is 1.4e-16.
5. **Offline.** All data ships with the app. The browser tests check that the app makes no
   external network requests.

### Key result (M0–A)

- **Endpoints.** Both are rover positions taken from mission records:
  - start: the M0 Bearwallow depot-drop rover position;
  - goal: the Skinner Ridge sampling rover position.
- They are 387 m apart in a straight line.

| Route | Length on the 2 m grid | Steepest 2 m step | Relative model cost |
|---|---|---|---|
| Shortest distance | 416.4 m | 22° (22–29° on independent stereo DEMs) | reference |
| Lowest terrain cost | 416.4 m | about 18° | 1.4 % lower (same model) |

The terrain-aware route is just as short on the grid, but it avoids the steepest steps.

## Scientific traceability

- **Every number has a source.**
  - Each layer, endpoint and Atlas record names its dataset, product and version.
  - The data bundles in this build are:
    - M0–A analysis `f8de9017164a`;
    - regional map `d3d62fc34c56`;
    - ARES-1 catalog `572fba1ce61f`;
    - ROI-A `7ec72147790e`.
- **Positions mean what they say.**
  - Endpoints are rover positions, not tube or rock locations.
  - The exact tube positions are not published, so the app shows "not available" rather than a
    guess. A test enforces this.
- **Checks, not just claims.**
  - Automated test suites all pass in s4-rc1:
    - core 38/38;
    - web unit 49/49;
    - M0–A analysis 8/8;
    - pipeline 27/27;
    - ARES-1 catalog 14/14;
    - browser tests 15/15 on both the dev server and the production preview.
  - The route engine matches the independent oracle.
- **Sensitivity tested.** We moved the endpoints, changed the threshold and swapped in independent
  HiRISE stereo elevation models to see how much the result changes (see Limitations).
- **Honest labels.**
  - The steepness mask is labelled "NOT a certified hazard".
  - The vertical datum is labelled "UNVERIFIED".
  - The MEDA "valid" column is labelled "Parser status", because it is a format check, not a
    science quality check.

## Limitations

- **A corridor, not a path.**
  - The route is a *candidate route corridor*, not a surveyed path.
  - On independent HiRISE stereo elevation models, the line moves by up to about 39 m, while the
    cost changes by about 0.5 % or less.
- **Endpoints** are rover positions, not tube or rock locations.
- **The 24.2° cutoff** is an experimental algorithm setting, not an astronaut safety limit.
- **The cost curves** (Minetti, Tobler) come from Earth walking data. They are not validated for a
  suited astronaut on Mars. "Flat-equivalent metres" are a relative model quantity, not energy or
  time.
- **The vertical datum** of the elevation models is unverified.
- **B (Amalik)** is routed on a wider HiRISE grid built from the same source as the M0–A grid. Its automated
  checks pass, it contains the M0–A grid cell for cell, and it was approved for prototype analysis on
  15 November 2026. The candidate corridor from the depot is 438.6 m.
- **C (Bright Angel)** can be inspected but not routed: there is no analysis grid there yet.
- **What we do not claim:**
  - EVA safety;
  - energy or time savings;
  - obstacle clearance;
  - life detection;
  - hazard certification;
  - weather maps;
  - radiation maps.

## What's next

- **Named terrain features (in progress).** We have confirmed three features from published
  sources:
  - F01: western delta fan front / Hawksbill Gap;
  - F02: Belva crater;
  - F03: Neretva Vallis / Bright Angel.

  For F01 we ran one automated three-raster check (CTX imagery, HiRISE elevation model, HiRISE
  imagery in the same window). It is waiting for review by our geology teammate and is not yet
  scientifically confirmed. F02 and F03 raster measurements are still pending.
- Validate or replace the slope cost curve for suited EVA, and verify the vertical datum.
- Build an analysis grid for Bright Angel (C).
- Let the user type a start point, not only a destination.
- Add solar illumination and shadows only once they can be computed from validated geometry.
