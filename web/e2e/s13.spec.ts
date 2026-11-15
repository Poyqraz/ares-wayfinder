// S13: the third route strategy (Conservative Terrain) in Planning, 3D Terrain and the EVA HUD, its fail-closed results,
// the environmental context layers with their four kinds of statement, and the scenario dust-storm indicator in the visor.
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name, exact: true }).click();
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/s13-${name}.png` });
const press = async (page: Page, id: string) => { await page.getByTestId(id).dispatchEvent("pointerdown", { button: 0, pointerId: 1 }); await page.getByTestId(id).dispatchEvent("pointerup", { button: 0, pointerId: 1 }); };

/** Click the centre of a cell of the M0-A grid on the 2D map (SVG x is ground metres, so the east-west scale applies). */
async function clickM0aCell(page: Page, row: number, col: number) {
  const index = await (await page.request.get("/data/m0a/index.json")).json();
  const meta = await (await page.request.get(`/${index.m0a.path}terrain.json`)).json();
  const x = meta.x0 + (col + 0.5) * meta.dx_ground_m, N = meta.y0 - (row + 0.5) * meta.dy_proj;
  const point = await page.getByTestId("map").evaluate((el, arg) => {
    const svg = el as SVGSVGElement, at = new DOMPoint(arg.x, Number(svg.dataset.ytop) - arg.N).matrixTransform(svg.getScreenCTM()!);
    return { x: at.x, y: at.y };
  }, { x, N });
  await page.mouse.click(point.x, point.y);
}

async function openM0a(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByTestId("mission-tab-A").click();
  await page.getByTestId("mission-plan").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");
}

test("three strategies in Planning, 3D Terrain and the EVA HUD; the frozen references stay as they were", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openM0a(page);

  // Planning: three columns, the two frozen strategies unchanged, the third one measured on the same terms
  await expect(page.getByTestId("len-distance")).toHaveText("416.426 m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("664.390 flat-equivalent m");
  await expect(page.getByTestId("len-conservative")).toHaveText("453.513 m");
  await expect(page.getByTestId("cost-conservative")).toHaveText("695.372 flat-equivalent m");
  const note = page.getByTestId("conservative-note");
  await expect(note).toContainText("37 m longer than the shortest route");
  await expect(note).toContainText("Steepest ground under it 18.1°, against 19.9° on the terrain-aware route");
  await expect(note).toContainText("9 m on ground over 15° (terrain-aware: 33 m)");
  await expect(note).toContainText("It is not a statement that the route is safe");
  await expect(note).toContainText("Weather, dust and radiation do not enter this route");
  for (const id of ["distance", "terrain", "conservative"]) await expect(page.getByTestId(`route-${id}`)).toBeAttached();
  await expect(page.locator(".hud-br.legend")).toContainText("Conservative");
  // the wider table still fits the side panel
  const wide = await page.locator(".side").evaluate((side) => { const edge = side.getBoundingClientRect().right; return [...side.querySelectorAll("*")].filter((el) => el.getBoundingClientRect().right > edge + 1).slice(0, 5).map((el) => `${el.tagName}.${el.className}`); });
  expect(wide).toEqual([]);
  await shot(page, "01-planning-three-routes");

  // selecting it: its own markers explain the detour, the terrain panel names it, and no straightened line is offered
  await page.getByTestId("use-conservative").click();
  await expect(page.getByTestId("use-conservative")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("traverse-panel")).toContainText("conservative terrain route");
  await expect(page.getByTestId("trav-max-slope")).toHaveText("18.1°");
  await expect(page.getByTestId("smooth-block")).toHaveCount(0);
  await expect(page.getByTestId("route-smooth")).toHaveCount(0);
  await expect(page.getByTestId("route-marker-detour")).toBeAttached();
  await press(page, "route-marker-detour");
  await expect(page.getByTestId("route-marker-card")).toContainText("Widest separation from the terrain-aware route: 94 m");
  await expect(page.getByTestId("route-marker-card")).toContainText("Steepest ground on this stretch 14.5°, against 19.9° on the terrain-aware route");
  await press(page, "route-marker-start");
  await expect(page.getByTestId("route-marker-card")).toContainText("A preference, not a safety rating");
  await shot(page, "02-planning-conservative-selected");

  // the experimental gate acts on the two frozen strategies only; switching it off restores them exactly
  await page.getByTestId("gate-20").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("417.566 m");
  await expect(page.getByTestId("len-conservative")).toHaveText("453.513 m");
  await page.getByTestId("gate-off").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("664.390 flat-equivalent m");

  // 3D Terrain: the selection carries over, all three can be flown
  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await expect(page.getByTestId("fly-route-conservative")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("route-legend")).toContainText("Conservative terrain");
  await page.getByTestId("fly-route-terrain").click();
  await expect(page.getByTestId("fly-route-terrain")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("fly-route-conservative").click();

  // EVA HUD: the same route, walked to the end
  await page.getByTestId("start-eva").click();
  await expect(page.getByTestId("eva-route-conservative")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".hud-caption")).toContainText("conservative terrain route");
  await expect(page.getByTestId("eva-marker-detour")).toBeVisible();
  await page.getByTestId("eva-scrub").fill("1000");
  await expect(page.getByTestId("eva-arrived")).toContainText("454 m walked");
  await expect(page.getByTestId("eva-remaining")).toHaveText("0 m");
  await page.getByTestId("eva-route-terrain").click();
  await expect(page.locator(".hud-caption")).toContainText("lowest terrain cost route");
  await expect(page.getByTestId("eva-marker-detour")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("no supported conservative corridor is reported, never relaxed", async ({ page }) => {
  test.setTimeout(150_000);
  await openM0a(page);
  await page.getByTestId("use-conservative").click();
  await page.getByTestId("arm-goal").click();

  // a destination beside ground steeper than the gate: the other two strategies still answer, the third says why it does not
  await clickM0aCell(page, 2, 77);
  await expect(page.getByTestId("len-terrain")).toHaveText("605.559 m");
  const note = page.getByTestId("conservative-note");
  await expect(note).toContainText("No supported conservative corridor: the destination lies on or beside ground steeper than 25° (27.9° nearby). Nothing was relaxed.");
  await expect(page.getByTestId("len-conservative")).toHaveText("no corridor");
  await expect(page.getByTestId("route-conservative")).toHaveCount(0);
  await expect(page.getByTestId("use-conservative")).toBeDisabled();
  await expect(page.getByTestId("use-terrain")).toHaveAttribute("aria-pressed", "true"); // a route that does not exist cannot stay selected
  await shot(page, "03-no-corridor-endpoint");

  // both ends acceptable, but gentle ground does not connect them
  await clickM0aCell(page, 2, 95);
  await expect(page.getByTestId("len-terrain")).toHaveText("597.247 m");
  await expect(note).toContainText("does not connect the two points within the step-grade limit. Nothing was relaxed.");
  await expect(page.getByTestId("route-conservative")).toHaveCount(0);

  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await expect(page.getByTestId("fly-route-conservative")).toBeDisabled();
  await expect(page.getByTestId("route-legend")).toContainText("Conservative terrain: no supported corridor");
  await page.getByTestId("start-eva").click();
  await expect(page.getByTestId("eva-route-terrain")).toBeVisible();
  await expect(page.getByTestId("eva-route-conservative")).toHaveCount(0);
});

test("ROI-A: the conservative route equals the terrain-aware one and says so; references unchanged", async ({ page }) => {
  await page.goto("/");
  await nav(page, "Planning");
  await expect(page.getByTestId("len-distance")).toHaveText("969.161 m");
  await expect(page.getByTestId("cost-distance")).toHaveText("1093.229 flat-equivalent m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("1058.299 flat-equivalent m");
  await expect(page.getByTestId("relation")).toHaveText("LOWER");
  await expect(page.getByTestId("len-conservative")).toHaveText("969.161 m");
  await expect(page.getByTestId("cost-conservative")).toHaveText("1058.299 flat-equivalent m");
  await expect(page.getByTestId("conservative-note")).toContainText("Same path as the terrain-aware route between these points");
  await expect(page.getByTestId("conservative-note")).toContainText("DEM uncertainty: not quantified for this grid");
  await page.getByTestId("use-conservative").click();
  await expect(page.getByTestId("route-marker-detour")).toHaveCount(0);
  await press(page, "route-marker-start");
  await expect(page.getByTestId("route-marker-card")).toContainText("the same path as the terrain-aware route here");
});

test("environmental layers: measured, modelled, scenario and not available are kept apart; nothing is drawn as an area", async ({ page }) => {
  test.setTimeout(150_000);
  const external: string[] = [];
  await page.route(/https?:\/\/(?!127\.0\.0\.1)/, (r) => { external.push(r.request().url()); return r.abort(); });
  await openM0a(page);

  // off by default; one layer at a time
  await expect(page.getByTestId("env-key")).toHaveCount(0);
  await expect(page.getByTestId("env-block")).toHaveCount(0);
  await page.getByTestId("layer-environment").click();
  const key = page.getByTestId("env-key");
  await expect(key).toContainText("Environment: reference only");
  await expect(page.getByTestId("env-layer-dust")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("env-key-note")).toHaveText("No gridded data covers this terrain, so no area is drawn and no route changes.");
  await expect(page.getByTestId("env-key-scenario-storm")).toContainText("ARES-1 scenario");
  await expect(page.getByTestId("env-key-scenario-storm")).toContainText("Not a forecast");
  await expect(page.getByTestId("env-key-dust-storm-2022")).toContainText("Measured");
  await expect(page.getByTestId("env-key-dust-season")).toContainText("Modelled");
  await expect(page.getByTestId("env-key-dust-now")).toContainText("Not available");
  await expect(page.getByTestId("env-legend").locator("li")).toHaveCount(4);
  await expect(page.getByTestId("env-card-dust-storm-2022")).toContainText("Lemmon et al. 2022");
  await expect(page.getByTestId("env-card-dust-storm-2022")).toContainText("It is not a dust map of this area");
  await expect(page.getByTestId("env-card-dust-now")).toContainText("There is no forecast and no live data. Dust does not enter any route cost.");
  await expect(page.getByTestId("env-meda-site")).toHaveCount(0);
  await shot(page, "04-planning-dust-layer");

  // weather: the one place a measurement belongs to is marked as a point, with what it is
  await page.getByTestId("env-layer-weather").click();
  await expect(page.getByTestId("env-layer-dust")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("env-meda-site")).toContainText("MEDA sol 516 record");
  await expect(page.getByTestId("env-meda-site")).toContainText("rover position, attributed");
  await expect(page.getByTestId("env-card-pressure-sol516")).toContainText("770–804 Pa");
  await expect(page.getByTestId("env-card-pressure-sol516")).toContainText("Not a weather map, not a forecast, not an EVA condition.");
  await expect(page.getByTestId("env-card-weather-now")).toContainText("No spatial weather data for this terrain");
  await shot(page, "05-planning-weather-layer");

  // radiation: measured somewhere else, and said so; nothing at Jezero
  await page.getByTestId("env-layer-radiation").click();
  await expect(page.getByTestId("env-meda-site")).toHaveCount(0);
  await expect(page.getByTestId("env-card-rad-gale")).toContainText("Gale crater");
  await expect(page.getByTestId("env-card-rad-gale")).toContainText("Not measured at Jezero");
  await expect(page.getByTestId("env-card-rad-jezero")).toContainText("No surface radiation measurement at Jezero");

  // the layers change no route
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");
  await expect(page.getByTestId("len-conservative")).toHaveText("453.513 m");

  // the same layer in 3D Terrain and in Mission Control
  await nav(page, "3D terrain");
  await expect(page.getByTestId("env-layer-radiation")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("env-key-rad-gale")).toContainText("another site");
  await nav(page, "Mission control");
  await page.getByTestId("mc-tab-environment").click();
  await expect(page.getByTestId("env-panel")).toHaveAttribute("data-layer", "radiation");
  await page.getByTestId("env-layer-dust").click();
  await expect(page.getByTestId("env-card-scenario-storm")).toContainText("not a verified NASA weather forecast");
  await shot(page, "06-mission-control-environment");

  // switching the layer off leaves the map as it was
  await nav(page, "Planning");
  await page.getByTestId("layer-environment").click();
  await expect(page.getByTestId("env-key")).toHaveCount(0);
  await expect(page.getByTestId("env-block")).toHaveCount(0);
  expect(external).toEqual([]);
});

test("EVA HUD: the dust-storm indicator is a scenario event, apart from playback and from every measured value", async ({ page }) => {
  test.setTimeout(150_000);
  await openM0a(page);
  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await page.getByTestId("start-eva").click();

  const storm = page.getByTestId("eva-storm");
  await expect(page.getByTestId("eva-storm-message")).toHaveText("Dust storm expected in 2 hours.");
  await expect(page.getByTestId("eva-storm-label")).toContainText("Scenario simulation");
  await expect(page.getByTestId("eva-storm-info")).toHaveCount(0);
  // upper right of the visor: right half, upper half, above the next-waypoint tile
  const visor = (await page.locator(".hud-visor").boundingBox())!, box = (await storm.boundingBox())!, next = (await page.getByTestId("eva-next").boundingBox())!;
  expect(box.x + box.width / 2).toBeGreaterThan(visor.x + visor.width * 0.6);
  expect(box.y + box.height).toBeLessThan(visor.y + visor.height * 0.4);
  expect(box.y + box.height).toBeLessThanOrEqual(next.y + 1);
  const labels = (await page.getByTestId("eva-sim-label").boundingBox())!;
  expect(box.x >= labels.x + labels.width || box.y >= labels.y + labels.height, "clear of the centred top labels").toBe(true);
  expect(box.width * box.height).toBeLessThan(visor.width * visor.height * 0.03); // small

  await page.getByTestId("eva-storm-toggle").click();
  const info = page.getByTestId("eva-storm-info");
  await expect(info).toContainText("It is not a verified NASA weather forecast");
  await expect(info).toContainText("does not run with the walk playback");
  await expect(info).toContainText("It changes nothing in the route");
  await shot(page, "07-eva-storm-open");
  await page.getByTestId("eva-storm-toggle").click();
  await expect(info).toHaveCount(0);

  // the scenario clock is not the playback: walking to the end leaves the message as it is
  await page.getByTestId("eva-play").click();
  await page.waitForTimeout(1500);
  await page.getByTestId("eva-scrub").fill("1000");
  await expect(page.getByTestId("eva-arrived")).toBeVisible();
  await expect(page.getByTestId("eva-storm-message")).toHaveText("Dust storm expected in 2 hours.");
  // everything else the HUD said before is still there
  await expect(page.getByTestId("eva-suit")).toContainText("Simulated demo values · not sensor readings");
  await expect(page.getByTestId("eva-sim-note")).toContainText("No live suit, sensor or environment data");
  await expect(page.getByTestId("eva-minimap")).toBeVisible();
  await expect(page.getByTestId("eva-next")).toContainText("Destination reached");

  // narrow window: still there, still readable
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByTestId("eva-storm-message")).toBeVisible();
  await expect(page.getByTestId("eva-storm-label")).toBeVisible();
  const small = (await storm.boundingBox())!, top = (await page.getByTestId("eva-sim-label").boundingBox())!;
  expect(small.x >= top.x + top.width || small.y >= top.y + top.height, "clear of the top labels at 1024 x 768").toBe(true);
  await expect(page.getByTestId("eva-minimap")).toBeInViewport();
  await shot(page, "08-eva-storm-1024");
});
