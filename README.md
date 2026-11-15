# Ares Wayfinder

NASA Space Apps Challenge 2026 — *Interplanetary Survival Guide: Martian Map* (Konya).

**Live demo: https://poyqraz.github.io/** — opens in any desktop browser, no login, no install.

Ares Wayfinder is a "Marswalk" planning prototype for Jezero crater, built on real NASA and USGS
data. It follows **ARES-1, a hypothetical crewed expedition**: it shows where the science targets
are, compares candidate walking routes over real terrain, and previews the walk in 3D and through
a simulated visor. Every layer and number shows its source, resolution and limits. It is a
decision-support demonstration, **not** an EVA safety system.

## What you can do in the demo

Use the buttons at the top, or the Left and Right arrow keys, to move between the six scenes.

| Scene | What it shows |
|---|---|
| Orbital | Jezero crater from orbit (MRO CTX) and the analysis areas. |
| Mission control | Four science missions on a regional map, with a read-only Science Atlas built from Mars 2020 PDS records. |
| Planning | Three candidate routes on a real elevation grid, with elevation, slope and NoData layers and a "why this route" explanation. |
| 3D terrain | The same grid and the same routes in 3D, with a labelled vertical exaggeration (×1, ×2.5, ×10). |
| EVA HUD | A first-person walk along the selected route. |
| Provenance | Every dataset, its version hash, its source and its known limits. |

**Missions.** M0: Three Forks sample depot. A: Skinner Ridge / Wildcat Ridge. B: Amalik /
Enchanted Lake. C: Bright Angel (can be inspected, but not routed: there is no analysis grid there
yet).

**Routes.** *Shortest distance*, *terrain-aware* (lowest relative terrain cost) and *conservative
terrain* (stays away from steep ground, and fails closed if it cannot). Routes are candidate
corridors, not surveyed paths.

## What is real and what is simulated

- **Real:** the terrain, imagery, rover positions, sample records and the MEDA pressure series.
  They come from public NASA / USGS / PDS products, and the app checks each data file against a
  SHA-256 manifest when it loads.
- **Hypothetical:** the ARES-1 expedition, its base and its missions. They are a scenario, not a
  NASA plan.
- **Simulated:** the suit indicators in the EVA HUD (heart rate, oxygen, pressure) are fixed demo
  values, not sensor readings. The dust storm alert is a planned event of the scenario, not a
  weather forecast.
- **Not claimed:** EVA safety, travel time or energy, obstacle clearance, hazard certification,
  weather or radiation maps, life detection. Endpoints are rover positions, not exact rock or
  sample-tube locations. The 24.2° step cutoff is an experimental algorithm setting, not a safety
  limit.

## For reviewers

| Document | Content |
|---|---|
| [Project description](docs/submission/PROJECT_DESCRIPTION.md) | The problem, what we built, how it works, limitations |
| [NASA data and resources](docs/submission/NASA_DATA_AND_RESOURCES.md) | Every NASA / USGS product used, with product IDs, URLs and DOIs |
| [AI use disclosure](docs/submission/AI_USE_DISCLOSURE.md) | Which AI tools were used, for what, and how their output was checked |
| [Latest release report](docs/checkpoints/s15-rc1/S15_RC1_REPORT.md) | Test results and evidence for the current build |
| [Decision records](docs/decisions/) | Architecture decisions and change requests |

The submission documents are team drafts. Lines marked `[TEAM TO CONFIRM]` are still open, and
some sections describe an earlier release (two routes, older test counts). This README and the
live demo describe the current build.

## Run it locally

Needs Node.js 22 or newer and pnpm. All data ships with the app; it makes no external network
requests.

```bash
pnpm install
pnpm --dir web dev
```

Then open http://localhost:5173. For the production build, use `pnpm --dir web build` and then
`pnpm --dir web preview`.

## Run the tests

```bash
pnpm --dir core test
pnpm --dir web test
pnpm --dir web test:e2e
cd pipeline && uv run pytest
```

## Repository layout

| Path | Content |
|---|---|
| `contracts/` | Frozen data and interface contract (`CONTRACT.md`, `types.ts`) |
| `core/` | Coordinate transforms and the route search (TypeScript, runs in the browser) |
| `pipeline/` | Data preparation, validation gates and an independent Dijkstra oracle (Python) |
| `web/` | The app: Mission Control, planning map, 3D terrain, EVA HUD |
| `ares1/` | The ARES-1 science catalog, built from Mars 2020 PDS records |
| `analysis/` | Route, sensitivity and coverage analyses with their recorded results |
| `science/` | Source register and area validation |
| `docs/` | Decisions, release reports, reviews and submission documents |

## How the routes are checked

The route search (A* on an 8-connected grid, no corner cutting, never across NoData) runs in the
browser. A separate Python implementation (Dijkstra, SciPy) is used as an independent oracle, and
the two agree. The data bundles can be rebuilt byte for byte from the public source rasters.

## Data

Mars Reconnaissance Orbiter CTX and HiRISE elevation models and orthomosaics (USGS Astrogeology;
Mangold et al. 2021, doi:10.1126/science.abl4051; Fergason et al. 2020), and Mars 2020 Perseverance
sample, waypoint and MEDA records (NASA PDS). The full list is in
[NASA data and resources](docs/submission/NASA_DATA_AND_RESOURCES.md).

## AI use

AI coding assistants (Claude Code, Cursor) were used for research help, code, tests and
documentation, under human direction and review. Details are in the
[AI use disclosure](docs/submission/AI_USE_DISCLOSURE.md).

## License

Apache-2.0. NASA data credits are listed per source. No NASA logos are used.
