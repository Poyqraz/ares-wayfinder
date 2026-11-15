# 30-second demo video: shot list

## Rules this video must meet

- **Length:** 30 seconds or less.
- **Language:** English.
- **Link:** a public link. **[TEAM TO ADD link]**
- **No NASA logos.**
- **AI watermark:** any AI-generated image, video, voice or music must carry a visible
  "AI-generated" watermark. The plan below uses none.
- **Footage:** record the real app with a screen recorder, offline, from a production build (see
  `DEMO_RUNBOOK.md`).
- **Reference frames:** the screenshots in `docs/checkpoints/s5-rc1/` show what each shot should
  look like. Recorded in the real app, they are not AI images.
- **Captions** are short so they can be read at normal speed. Keep each one on screen for its full
  shot.

## Shot list (total 30 s)

| # | Time | Length | Reference screenshot | What happens on screen | On-screen caption |
|---|---|---|---|---|---|
| 1 | 0:00–0:04 | 4 s | `s5-01-regional-map.png` | Mission Control: the regional CTX map of Jezero, north up. Slow push-in; M0, A and B markers visible. | **Plan a Marswalk in Jezero crater, on real NASA data.** Small source line: *USGS controlled CTX 6 m mosaic (MRO)* |
| 2 | 0:04–0:08 | 4 s | `s5-02-magnifier-m0a.png` | Drag a box over the M0–A footprint. The detail view opens; click "Open M0–A planning". | **Zoom from orbit to a 2 m HiRISE terrain grid.** |
| 3 | 0:08–0:11 | 3 s | `s5-03-mission-control.png` | Scroll the Science Atlas: depot tubes, sample cores, MEDA pressure chart. | **Science Atlas: tubes, cores and rover pressure data, from PDS and NASA records.** |
| 4a | 0:11–0:15 | 4 s | `s5-04-m0a-planning-layers.png` | M0–A Planning: both routes drawn between the two rover positions; route table visible. | **Two routes between rover positions. Both 416.4 m.** |
| 4b | 0:15–0:19 | 4 s | `s5-04-m0a-planning-layers.png` | Toggle the slope layer on; its legend with source and units is visible. | **Terrain-aware route: every 2 m step ≤ ~18°. Shortest: up to 22°.** |
| 5 | 0:19–0:22 | 3 s | `s5-05-destination-card.png` | Enter latitude `18.458931` and longitude `77.406171` (the Skinner Ridge sampling rover position), then click "Select destination". The destination card shows elevation, coverage and "routing available". | **Pick any point: elevation, coverage, can we route there?** |
| 6 | 0:22–0:26 | 4 s | `s5-06-m0a-3d.png` | Open "3D terrain": the same grid and both routes in 3D; short flyover. | **Same grid in 3D. Every layer shows its source and limits.** |
| 7 | 0:26–0:30 | 4 s | End card (text on a dark background, or over a dimmed frame of shot 6) | Hold the end card. | **Prototype. Candidate route corridor, not a surveyed path. Not an EVA safety tool.** Small line: *Data: NASA PDS, USGS Astrogeology, MRO CTX & HiRISE, Mars 2020. Built with AI assistance (see disclosure).* |

`s5-07-roi-a-legacy.png` is not used in the video. It goes on the slides instead (slide 6).

## Required caveat caption

The caveat must be visible in two places.

1. **A small lower-third label during shots 4a to 6 (0:11–0:26):**

   > Candidate route corridor, not a surveyed path

2. **The full end card in shot 7 (0:26–0:30):**

   > Prototype. Candidate route corridor, not a surveyed path. Not an EVA safety tool.

Do not shorten or remove either one.

## Do not say or show

- Do not call the route "safe", "the safest" or "verified".
- Do not say it saves energy or time.
- Do not call the steepness mask a "hazard map".
- Do not mention life detection.
- Do not say the route ends "at the sample tube" or "at the rock". The endpoints are rover
  positions.
- Do not say the named terrain features F01–F03 have been "measured" or "verified". Their
  measurements are still pending.
- Do not show the "EVA HUD" tab. It is a placeholder.

## Optional voice-over (about 70 words; record with a human voice, or watermark it if it is AI-generated)

> Ares Wayfinder plans a Marswalk in Jezero crater, on real NASA and USGS data. Zoom from orbit to
> a two-metre HiRISE terrain grid. The Science Atlas comes from PDS and NASA records. Two routes
> between real rover positions: both 416 metres, but the terrain-aware one keeps every step at or
> below about 18 degrees, where the shortest reaches 22. Every layer shows its source and limits. It is a
> prototype route corridor, not a safety tool.
