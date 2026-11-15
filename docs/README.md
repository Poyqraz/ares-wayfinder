# Documentation map

Start with the [project README](../README.md). This page says what each folder under `docs/` holds.

| Folder | What it holds | Status |
|---|---|---|
| [`submission/`](submission/) | Project description, NASA data list, AI use disclosure, demo runbook, slide and video outlines | Current, except the slide and video outlines (marked as drafts) |
| [`images/`](images/) | Screenshots of the current build, used by the README | Current |
| [`decisions/`](decisions/) | Architecture decision records (ADR-001, ADR-002), change requests (CR-001 to CR-009), the M0–A terrain gate and the map-layer contract | Current |
| [`checkpoints/`](checkpoints/) | One folder per release candidate: its report and its evidence screenshots | Historical record; the latest is [`s15-rc1`](checkpoints/s15-rc1/S15_RC1_REPORT.md) with its `s15-rc2` update |
| [`audit/`](audit/) | Route and traversability audits | Historical record |
| [`review/`](review/) | Material prepared for the geology review of terrain feature F01 | Open: the review is not finished |
| [`research/`](research/) | Sources for the hypothetical base site | Reference |
| [`handoff/`](handoff/) | Working notes passed between development streams, with their pictures and recordings | Historical record |

Historical records describe the build as it was at that time. Where they differ from the README, the
README and the live demo are right: for example, older reports mention two routes, a ×5 vertical
exaggeration step, or Bright Angel as mission B.

Related material outside `docs/`:

| Path | What it holds |
|---|---|
| [`contracts/CONTRACT.md`](../contracts/CONTRACT.md) | The frozen data and interface contract |
| [`science/`](../science/) | Source register and area validation reports |
| [`ares1/README.md`](../ares1/README.md) | The ARES-1 science catalog and how it is built |
| [`analysis/`](../analysis/) | Route, sensitivity and coverage analyses with their recorded results |
