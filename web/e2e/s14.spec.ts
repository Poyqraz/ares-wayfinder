// S14 and S15: the M0-A-B-C mission structure (B Amalik, routed on the wider grid since S15; Bright Angel kept
// as C) and the redesigned EVA visor (short readouts, simulated suit strip, details on request).
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name, exact: true }).click();
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/s14-${name}.png` });

test("missions M0, A, B, C: Amalik is documented and routed on the wider grid, Bright Angel is C, the references are intact", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [], external: string[] = [];
  await page.route(/https?:\/\/(?!127\.0\.0\.1)/, (r) => { external.push(r.request().url()); return r.abort(); });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("targets-M0").getByRole("button")).toHaveCount(10);
  for (const [id, text] of [["M0", "M0 Three Forks"], ["A", "A Western Delta"], ["B", "B Amalik"], ["C", "C Bright Angel"]] as const) await expect(page.getByTestId(`mission-tab-${id}`)).toHaveText(text);
  await expect(page.getByTestId("targets-B").getByRole("button")).toHaveText(["Amalik", "Shuyak", "Mageik"]);
  await expect(page.getByTestId("targets-C").getByRole("button")).toHaveText(["Cheyava Falls", "Sapphire Canyon"]);
  for (const id of ["M0", "A", "B", "C"]) await expect(page.getByTestId(`regional-waypoint-${id}`)).toBeAttached();
  await expect(page.getByTestId("regional-m0ab_analysis")).toBeAttached(); // the wider grid is drawn as its own box
  await expect(page.getByTestId("map-legend")).toContainText("B Amalik outcrop: rover position at sampling (PDS)");
  await expect(page.getByTestId("map-legend")).toContainText("C rock and core: rover position at sampling (PDS)");

  // B: science purpose, the grid's status in words, straight-line distances that are not called routes
  const insp = page.getByTestId("inspector");
  await page.getByTestId("mission-tab-B").click();
  await expect(insp).toContainText("B Amalik / Enchanted Lake science objectives");
  await expect(insp).toContainText("potential to preserve ancient biosignatures");
  await expect(insp).toContainText("owner-approved for prototype analysis");
  await expect(insp).toContainText("81 m outside the frozen M0–A grid");
  await expect(page.getByTestId("readiness-pending")).toHaveCount(0); // nothing about B is waiting for a decision any more
  await expect(page.getByTestId("mission-no-route")).toHaveCount(0);
  await expect(insp.getByTestId("b-distances")).toContainText(/M0 reference waypoint 40\d m, Skinner Ridge sampling position 55\d m, Wildcat Ridge sampling position 53\d m/);
  await expect(insp.getByTestId("b-distances")).toContainText("not walking distances");
  await expect(insp.getByTestId("b-sources").locator("a")).toHaveCount(5); // inside a closed panel until asked for
  await shot(page, "01-mission-control-b");

  // Mageik and Shuyak are different records; Mageik links B to the depot
  await page.getByTestId("target-chip-sample:M2020-00579-17").click();
  await expect(insp).toContainText("Cored on sol 579; sealed on sol 619");
  await expect(insp).toContainText("Placed at the Three Forks depot on sol 655");
  await expect(page.getByTestId("target-position")).toContainText("rover position");
  await expect(page.getByTestId("target-limits")).toContainText("candidate corridors on the wider M0–A–B grid (prototype)");
  await expect(page.getByTestId("target-plan")).toBeEnabled();
  await page.getByTestId("target-chip-sample:M2020-00575-16").click();
  await expect(insp).toContainText("Cored on sol 575");
  await expect(insp).toContainText("on the rover (not in the Three Forks depot)");
  await page.getByTestId("target-chip-outcrop:amalik").click();
  await expect(insp).toContainText("Novarupta abrasion patch");
  await expect(insp).toContainText("No sign of life has been found here");
  await expect(page.getByTestId("target-limits")).toContainText("Not a surveyed astronaut waypoint");
  await page.getByTestId("target-chip-drop:M2020-00579-17").click();
  await expect(insp).toContainText("Collected at: Amalik (the outcrop of mission B)");

  // B in Planning: three candidate corridors from the depot on the wider grid, labelled as such
  await page.getByTestId("mission-tab-B").click();
  await expect(page.getByTestId("mission-plan")).toHaveText("Plan M0 → B corridor");
  await page.getByTestId("mission-plan").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("438.587 m");
  await expect(page.getByTestId("len-distance")).toHaveText("438.587 m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("615.136 flat-equivalent m");
  await expect(page.getByTestId("len-conservative")).toHaveText("438.587 m");
  await expect(page.getByTestId("cost-conservative")).toHaveText("619.149 flat-equivalent m");
  await expect(page.getByTestId("relation")).toHaveText("LOWER");
  await expect(page.getByTestId("region-b")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("region-m0a")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("header.top")).toContainText("Terrain: M0–A–B HiRISE 2 m (5b2abdb8bb70)");
  await expect(page.locator(".side")).toContainText("Amalik sampling rover position");
  await expect(page.locator(".side")).toContainText("candidate route corridor (prototype, wider grid)");
  await expect(page.getByTestId("conservative-note")).toContainText("Steepest ground under it 9.1°, against 15.4° on the terrain-aware route");
  for (const id of ["distance", "terrain", "conservative"]) await expect(page.getByTestId(`route-${id}`)).toBeAttached();
  await page.waitForTimeout(400);
  await shot(page, "02-b-planning");

  // 3D and EVA work on the same grid and route
  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await expect(page.getByTestId("terrain-3d-disabled")).toHaveCount(0);
  await expect(page.locator(".terrain-hud")).toContainText("wider M0–A–B HiRISE 2 m analysis grid");
  await page.getByTestId("start-eva").click();
  await page.getByTestId("eva-play").click();
  await page.getByTestId("eva-scrub").fill("1000");
  await expect(page.getByTestId("eva-arrived")).toContainText("439 m walked");
  await expect(page.locator(".hud-caption")).toContainText("Amalik sampling rover position");
  await expect(page.getByTestId("eva-storm-message")).toHaveText("Dust storm expected in 2 hours.");

  // back to A: the frozen grid and its reference, exactly as before
  await nav(page, "Mission control");
  await page.getByTestId("mission-tab-A").click();
  await page.getByTestId("mission-plan").click();
  await expect(page.locator("header.top")).toContainText("Terrain: M0–A HiRISE 2 m (f8de9017164a)");
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("664.390 flat-equivalent m");
  await expect(page.getByTestId("len-conservative")).toHaveText("453.513 m");
  await expect(page.getByTestId("region-m0a")).toHaveAttribute("aria-pressed", "true");
  // and from the region selector straight to the wider grid and back
  await page.getByTestId("region-b").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("438.587 m");
  await page.getByTestId("region-m0a").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");
  await expect(page.getByTestId("mission-tab-A")).toHaveCount(0); // Planning scene: tabs live in Mission Control

  // C from Planning: the Bright Angel records, inspection only, as before
  await page.getByTestId("region-c").click();
  await expect(page.getByTestId("explore-view")).toHaveAttribute("data-explore", "C");
  await expect(page.getByTestId("explore-route-disabled")).toContainText("Route planning at C is disabled");
  await expect(page.getByTestId("c-claims")).toContainText("9 source-backed claims");
  await expect(page.getByTestId("regional-extra-sapphire")).toBeAttached();
  // a click on open ground there still inspects that point, and offers no route
  const em = page.getByTestId("explore-map"), eb = (await em.boundingBox())!;
  await em.click({ position: { x: eb.width * 0.3, y: eb.height * 0.3 } });
  await expect(page.getByTestId("inspector")).toHaveAttribute("data-kind", "destination");
  await expect(page.getByTestId("route-to-destination")).toBeDisabled();
  await shot(page, "03-c-exploration");
  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-3d-disabled")).toHaveAttribute("data-mission", "C");
  await nav(page, "EVA HUD");
  await expect(page.getByTestId("eva-unavailable")).toContainText("C Bright Angel");
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("EVA visor: short readouts, a simulated suit strip that never changes, details only on request", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByTestId("mission-tab-A").click();
  await page.getByTestId("mission-plan").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");
  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await page.getByTestId("start-eva").click();
  await page.getByTestId("eva-play").click(); // pause

  // the suit strip: three labelled indicators, marked as simulated
  const suit = page.getByTestId("eva-suit");
  for (const text of ["88", "bpm", "Heart rate", "84", "O₂ reserve", "29.6", "kPa", "Suit pressure"]) await expect(suit).toContainText(text);
  await expect(page.getByTestId("eva-suit-tag")).toHaveText("Simulated demo values · not sensor readings");
  await expect(suit).toHaveAttribute("aria-label", "Suit status: simulated demo values, not sensor readings");
  const before = await suit.innerText();
  await page.getByTestId("eva-play").click();
  await page.waitForTimeout(1500);
  await page.getByTestId("eva-play").click();
  await page.getByTestId("eva-scrub").fill("700");
  expect(await suit.innerText(), "static: no invented changing measurement").toBe(before);

  // hierarchy: the right side is four compact items, the forward view is mostly clear
  const visor = (await page.locator(".hud-visor").boundingBox())!;
  const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
  expect((await page.locator(".hud-right").innerText()).length, "no paragraphs in the visor's right column").toBeLessThan(240);
  let covered = 0;
  for (const sel of [".hud-left", ".hud-storm", ".hud-next", ".hud-suit", ".hud-mini", ".hud-top"]) { const b = await box(sel); covered += b.width * b.height; }
  expect(covered / (visor.width * visor.height), "share of the visor under side panels").toBeLessThan(0.2);
  const mini = await box(".hud-mini");
  expect(mini.y + mini.height, "the mini-map is whole, inside the visor").toBeLessThan(visor.y + visor.height * 0.97);
  for (const id of ["eva-storm-message", "eva-next", "eva-minimap", "eva-remaining", "eva-profile"]) await expect(page.getByTestId(id)).toBeVisible();
  await expect(page.getByTestId("eva-storm-label")).toContainText("Scenario simulation");

  // marker explanations and caveats: closed until asked for
  await expect(page.getByTestId("eva-marker-card")).toHaveCount(0);
  await page.getByTestId("eva-next").click();
  await expect(page.getByTestId("eva-marker-card")).toBeVisible();
  await shot(page, "05-eva-marker-details");
  await page.getByTestId("eva-marker-close").click();
  await expect(page.getByTestId("eva-marker-card")).toHaveCount(0);
  const details = page.getByTestId("eva-details");
  expect(await details.getAttribute("open")).toBeNull();
  await expect(page.getByTestId("eva-suit-note")).toContainText("not connected to any sensor");
  await expect(page.getByTestId("eva-suit-note")).toContainText("no astronaut is being monitored");
  await expect(page.getByTestId("eva-env-note")).toContainText("MEDA sol 516 (2022), 770–804 Pa at the rover");
  await expect(page.getByTestId("eva-env-note")).toContainText("fictional ARES-1 scenario event");
  await shot(page, "04-eva-visor");

  // smaller window: everything essential still in view and apart
  await page.setViewportSize({ width: 1024, height: 768 });
  for (const id of ["eva-storm-message", "eva-next", "eva-suit", "eva-minimap", "eva-remaining"]) await expect(page.getByTestId(id)).toBeInViewport();
  const s = await box(".hud-suit"), m = await box(".hud-mini");
  expect(s.y + s.height, "suit strip and mini-map do not overlap").toBeLessThanOrEqual(m.y + 1);
  await shot(page, "06-eva-visor-1024");
});
