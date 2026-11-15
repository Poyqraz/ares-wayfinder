# AI Use Disclosure

> **Draft.** The team must check every line marked **[TEAM TO CONFIRM]** before submitting. This
> draft was itself written with an AI tool (Claude Code) from the project's own files.

## Summary

- **The idea is human.** It comes from the team's own proposal of 2 October 2026.
- **AI tools helped build it.** We used AI coding assistants for research help, data engineering,
  code and documentation.
- **People stayed in charge.** People made the product decisions, set the scientific rules and
  approved every release gate.
- **AI output was checked.** We checked it with automated tests, an independent re-implementation
  of the route search, byte-for-byte data rebuilds and human review.

## Tools used

| Tool | Maker | Model(s) | Used for |
|---|---|---|---|
| Claude Code | Anthropic | [TEAM TO CONFIRM model names] | Research help (finding and reading NASA/USGS product labels and PDS records); data engineering (Python pipeline that builds the versioned data bundles, validation scripts); core code (coordinate transforms, routing engine, destination tool, layer registry); tests; technical reports; this submission draft |
| Cursor | Anysphere | [TEAM TO CONFIRM model names] | Web user interface components, including the coordinate input, the destination card, the orbital magnifier and the Science Atlas view; their tests |
| Other AI tools | — | [TEAM TO CONFIRM: any others, e.g. for translation, research notes, slides or video] | [TEAM TO CONFIRM] |

## What people did

- **The product idea.** It comes from the team proposal of 2 October 2026:
  - a Marswalk planning map for Jezero crater;
  - the ARES-1 science missions (M0, A, B; the team later moved B to Amalik and kept Bright Angel as C).
- **Science research.** The ARES-1 science team prepared the research package:
  - sample tables;
  - Bright Angel claims;
  - waypoint drafts;
  - a MEDA verification report.

  **[TEAM TO CONFIRM: whether AI tools were used to prepare these research documents, and how]**
- **Decisions and approvals.** A human technical lead:
  - chose which data to trust;
  - set the rules (for example, "never invent a tube position", "never fake a missing layer");
  - approved each gate, for example the M0–A terrain gates G4 and G5 on 14 November 2026.

  **[TEAM TO CONFIRM names and roles]**
- **Review and acceptance.** People reviewed the AI-written code and ran the human acceptance
  checklist for the release candidate. **[TEAM TO CONFIRM who and when]**

## How we checked AI-written work

- **Independent route check.** The TypeScript route engine is compared against a separate Python
  Dijkstra oracle (SciPy). The largest relative difference is 1.4e-16.
- **Automated tests.** All suites pass in release candidate s4-rc1:
  - core 38/38;
  - web unit 49/49;
  - M0–A analysis 8/8;
  - pipeline 27/27;
  - ARES-1 catalog 14/14;
  - browser tests 15/15.
- **Reproducible data.**
  - Every data bundle carries SHA-256 hashes and can be rebuilt byte-for-byte from the public
    source files.
  - The app refuses a bundle whose hash does not match.
- **Guards against invented values.**
  - A test checks that tube positions are never made up: they are not published, so the app shows
    "not available".
  - Layers we do not have, such as weather or radiation, are listed as unavailable and are never
    filled with made-up values.

## Data and images

- **No AI-generated data.** Every map, elevation, slope and science value shown in the app comes
  from a NASA or USGS product. These products are listed in `NASA_DATA_AND_RESOURCES.md`.
- **No AI-generated images or video.**
  - All screenshots in the slides and video are captures of the running app.
  - The app displays real orbital images and elevation data.
  - If the team adds any AI-generated image, video, voice or music, it will carry a visible
    "AI-generated" watermark, as the rules require. **[TEAM TO CONFIRM before submission]**
- **No NASA logos** are used.

## Team confirmation

- [ ] Tool list and model names are complete and correct.
- [ ] The description of what people did is accurate.
- [ ] We have stated whether AI was used in the science research documents.
- [ ] No unwatermarked AI-generated image, video or audio is in the demo.
- [ ] Confirmed by: [TEAM TO CONFIRM name(s)], date: [TEAM TO CONFIRM]
