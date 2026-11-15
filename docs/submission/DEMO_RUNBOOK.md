# Demo runbook: run Ares Wayfinder offline

> The same build is online at **https://poyqraz.github.io/**. Use this runbook when there is no
> internet at the venue.

This runbook is for the team member who gives the live demo or records the video.

- **Build to use:** the `main` branch of this repository.
- **Where the commands come from:**
  - `web/package.json` (scripts `dev`, `build`, `preview`, `test`, `test:e2e`, `test:perf`);
  - `web/playwright.preview.config.ts` (preview host and port);
  - the repository `README.md` (core and pipeline tests).
- **Note:** commands marked *inferred* are not written in any repo file. Check them before demo day.

## 1. Before demo day (needs internet once)

1. **Install Node.js and pnpm.**
   - The repo is a pnpm workspace (`pnpm-workspace.yaml`, `pnpm-lock.yaml`).
   - The test script uses `node --experimental-strip-types`, so use a recent Node.js.
     The build was made and tested with Node.js 22.
2. **Install dependencies** from the repository root. *Inferred* from the lockfile; this command
   is not written in the README:

   ```bash
   pnpm install
   ```

3. **Build the production app** in `web/`. This runs `tsc --noEmit && vite build`:

   ```bash
   cd web
   pnpm build
   ```

   The build is about 22 MB because it includes the image data and basemaps. All data ships inside
   the build; nothing is downloaded at run time.

## 2. Start the demo (no internet needed)

Run this in `web/`, after `pnpm build`. Host and port are taken from `web/playwright.preview.config.ts`.

```bash
pnpm preview --host 127.0.0.1 --port 4173 --strictPort
```

Then open **http://127.0.0.1:4173** in Chrome. The performance tests were run in Chrome.

**Backup option:** the development server, also in `web/`.

```bash
pnpm dev
```

Vite prints the local address it uses. The release candidate's offline check was run on the
production preview, so use the preview for the real demo.

## 3. Optional: re-run the automated checks (all in `web/` unless noted)

| Check | Command | Source |
|---|---|---|
| Web unit tests | `pnpm test` | `web/package.json` |
| Browser tests on the dev server (includes "no external requests") | `pnpm test:e2e` | `web/package.json` |
| Browser tests on the production preview | `pnpm build` first, then Playwright with `-c playwright.preview.config.ts`. *Inferred* command: `pnpm exec playwright test -c playwright.preview.config.ts` **[TEAM TO CONFIRM]** | `web/playwright.preview.config.ts` |
| Performance (headed Chrome) | `pnpm test:perf` | `web/package.json` |
| Core tests (repo root) | `pnpm --dir core test` | `README.md` |
| Pipeline tests | `cd pipeline && uv run pytest` | `README.md` |

The browser tests need Playwright's browsers to be installed. Do that while you are still online.

## 4. Physical offline checklist (do this on the demo laptop)

**A. Go offline for real**
- [ ] Turn off Wi-Fi.
- [ ] Unplug any Ethernet cable.
- [ ] Turn off phone tethering or hotspot.
- [ ] Optionally, turn on airplane mode.
- [ ] Prove you are offline: open any public website in a new tab. It must fail to load.

**B. Start and reload**
- [ ] Start the preview server (section 2) if it is not running.
- [ ] Open http://127.0.0.1:4173.
- [ ] Do a hard reload: Ctrl+Shift+R on Windows/Linux, Cmd+Shift+R on macOS.
- [ ] Optionally, open DevTools → Network, reload, and check that every request goes to
  `127.0.0.1` only.

**C. Verify the demo path.** These checks come from the human acceptance checklists of the release candidates.
- [ ] **Mission Control** shows the regional CTX map north up, with M0, A, B (Amalik), C (Bright Angel), the ROI-A box and
  the M0–A footprint in plausible places: the delta to the west, the crater floor to the east.
- [ ] **Magnifier:** dragging a box over M0–A opens the detail view, and "Open M0–A planning" opens
  Planning on M0–A.
- [ ] **M0–A Planning:**
  - the shortest and terrain-aware routes show **416.426 m**, the conservative route **453.513 m**;
  - the terrain cost shows **LOWER**;
  - the corridor and limitation texts are visible.
- [ ] **Layers:** the elevation, slope and steepness legends show source, units and limitation
  text. The steepness legend says "NOT a certified hazard". Nothing unavailable is shown as data.
- [ ] **Destination, typed:** enter latitude `18.458931` and longitude `77.406171`, then click
  "Select destination". The card shows a HiRISE elevation, "vertical datum UNVERIFIED" and
  "routing available".
- [ ] **Mission B:** selecting B in Mission Control and opening planning shows three routes of
  **438.587 m** on the wider M0–A–B grid.
- [ ] **Mission C:** C (Bright Angel) can be inspected, and routing and detailed 3D are disabled with a reason.
- [ ] **3D terrain (M0–A):** the terrain and the three routes are visible, and the caption names the
  M0–A grid ("Analysis DEM: HiRISE 2 m").
- [ ] **ROI-A:**
  - the routes show **969.161 m** and **1058.299 flat-equivalent m**;
  - the S-4 registration line is visible.
- [ ] **Science Atlas** (in Mission Control) shows the depot tubes and the MEDA sol 516 section.

**D. If something fails**
- **M0–A is disabled and a reason is shown.** A data file does not match its hash.
  - Rebuild from a clean checkout of `main` (section 1, step 3).
  - Do not edit files in `web/public/data/`.
- **The page is blank after reload.** Check that the preview server is still running in the
  terminal, and that you are using the `127.0.0.1:4173` address.
- **Last resort:** use the screenshots in `docs/images/` and the slides.

## 5. What to say during the demo

- **Always say:**
  - "candidate route corridor, not a surveyed path";
  - "the endpoints are rover positions, not tube or rock locations".
- **Never say:** "safe", "verified path", "saves energy" or "hazard map".
- **EVA HUD:** open it only after planning a route in M0–A or ROI-A. Say that the heart rate, oxygen and suit
  pressure are fixed demo values and that the dust-storm notice is a fictional scenario event. For C the tab states that no walk is available.
