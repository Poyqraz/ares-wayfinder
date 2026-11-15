// S8 acceptance: Mission Control -> objective -> Planning -> 3D Terrain -> Start EVA -> walk the route -> back,
// with the first-person view on the DEM mesh, on both routable grids. Bright Angel stays without routing.
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name, exact: true }).click();
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/s8-${name}.png` });
const num = async (page: Page, id: string) => Number(((await page.getByTestId(id).textContent()) ?? "").replace(/[^\d.-]/g, ""));
const canvas = (page: Page, key: string) => page.getByTestId("eva-canvas").getAttribute(`data-${key}`);
const guard = async (page: Page) => {
  const external: string[] = [], errors: string[] = [];
  await page.route(/https?:\/\/(?!127\.0\.0\.1)/, (r) => { external.push(r.request().url()); return r.abort(); });
  page.on("pageerror", (e) => errors.push(e.message));
  return { external, errors };
};
/** At a scrub position the 3D camera, the readouts and the mini-map must all describe the same point, above the terrain. */
async function checkpoint(page: Page, fraction: number, total: number, name?: string) {
  await page.getByTestId("eva-scrub").fill(String(Math.round(fraction * 1000)));
  await expect.poll(async () => Math.abs(Number(await canvas(page, "s")) - total * fraction)).toBeLessThan(0.75);
  expect(Math.abs((await num(page, "eva-done")) - total * fraction), "readout matches the camera").toBeLessThan(1.25);
  expect(Number(await canvas(page, "clearance")), "eye is above the drawn terrain").toBeGreaterThanOrEqual(1.69);
  expect(Math.abs(Number(await canvas(page, "heading")) - Number(await page.getByTestId("eva-hud").getAttribute("data-heading"))), "compass is the camera's gaze").toBeLessThan(0.1);
  const pos = (await page.getByTestId("eva-hud").getAttribute("data-pos"))!.split(",").map(Number);
  expect(Number(await page.getByTestId("eva-mini-self").getAttribute("cx"))).toBeCloseTo(pos[0], 1);
  if (name) { await page.waitForTimeout(700); await shot(page, name); } // let the gaze settle before the picture
}

test("M0-A journey: objective, planning, 3D route markers, Start EVA, the walk, and back with the mission intact", async ({ page }) => {
  test.setTimeout(150_000);
  const seen = await guard(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByTestId("mission-tab-A").click();
  await page.getByTestId("mission-plan").click();
  await expect(page.getByTestId("region-m0a")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("len-distance")).toHaveText("416.426 m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("664.390 flat-equivalent m");

  // Planning: the smoothed line is drawn beside the grid route, with its own recomputed numbers, never instead of it
  await expect(page.getByTestId("route-terrain")).toBeAttached();
  await expect(page.getByTestId("route-smooth")).toBeAttached();
  await page.getByTestId("smooth-block").locator("summary").click();
  expect(await num(page, "smooth-length")).toBeLessThan(416.5);
  expect(await num(page, "smooth-cost")).toBeLessThanOrEqual(664.4);
  expect(await num(page, "smooth-turns")).toBeLessThan(10);
  await expect(page.getByTestId("smooth-block")).toContainText("not a new optimum");
  await expect(page.getByText("excludes any step steeper than 24.2°")).toBeVisible();
  await shot(page, "01-planning-smoothed");

  // 3D Terrain: both routes, markers selectable there too
  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await page.waitForTimeout(800);
  await shot(page, "02-3d-routes");
  await page.getByTestId("marker3d-steepest").click();
  await expect(page.getByTestId("route-marker-card")).toContainText("Steepest step");
  await page.getByTestId("route-marker-next").click();
  await expect(page.getByTestId("route-marker-card")).not.toContainText("Steepest step");
  await page.waitForTimeout(400);
  await shot(page, "03-3d-marker");
  await page.getByTestId("route-marker-close").click();
  await page.getByTestId("fly-route-distance").click();
  await page.getByTestId("fly-route-terrain").click();

  // Start EVA from 3D: straight into the first-person walk on the same selected route, already moving
  await page.getByTestId("start-eva").click();
  await expect(page.getByTestId("eva-hud")).toHaveAttribute("data-mode", "first-person");
  await expect(page.getByTestId("eva-route-terrain")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("eva-play")).toHaveText("Pause");
  await expect(page.getByTestId("eva-world")).toHaveAttribute("data-texture", "ready");
  await expect(page.getByTestId("eva-sim-label")).toContainText("Simulated preview");
  await expect(page.getByTestId("eva-suit")).toContainText("Simulated demo values · not sensor readings");
  await expect.poll(() => num(page, "eva-done")).toBeGreaterThan(8);
  const total = 416.426; // the planned terrain-aware route; the HUD shows it in whole metres

  // frame rate while walking (software or hardware GL, whichever this browser has)
  const f0 = Number(await canvas(page, "frames")), t0 = Date.now();
  await page.waitForTimeout(3000);
  const fps = (Number(await canvas(page, "frames")) - f0) / ((Date.now() - t0) / 1000);
  console.log(`EVA_FPS dev-headless ${fps.toFixed(1)}`);
  expect(fps).toBeGreaterThan(1); // headless Chromium renders in software; the real figure comes from perf/eva.spec.ts on Chrome with the GPU

  // pause holds everything
  await page.getByTestId("eva-play").click();
  await expect(page.getByTestId("eva-play")).toHaveText("Resume");
  const held = await canvas(page, "s");
  await page.waitForTimeout(400);
  expect(await canvas(page, "s")).toBe(held);
  expect(Math.abs((await num(page, "eva-done")) + (await num(page, "eva-remaining")) - total), "walked plus remaining is the planned length").toBeLessThan(1.5);

  // the view from different points: start, the climb, a turn, near the destination
  await checkpoint(page, 0.02, total, "04-eva-start");
  await checkpoint(page, 0.35, total, "05-eva-mid");
  await checkpoint(page, 0.6, total);
  await checkpoint(page, 0.8, total, "06-eva-climb");
  const eyeA = await canvas(page, "eye");

  // other policy: the walk restarts on the shortest-distance route, with its own geometry
  await page.getByTestId("eva-route-distance").click();
  await expect(page.getByTestId("eva-done")).toHaveText("0 m");
  await checkpoint(page, 0.8, total);
  expect(await canvas(page, "eye")).not.toBe(eyeA);
  await page.getByTestId("eva-route-terrain").click();

  // finish the route by playback
  await page.getByTestId("eva-scrub").fill("880");
  await page.getByTestId("eva-play").click();
  await expect(page.getByTestId("eva-arrived")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("eva-remaining")).toHaveText("0 m");
  await expect(page.getByTestId("eva-next")).toContainText("Destination reached");
  await expect(page.getByTestId("eva-play")).toHaveText("Walk again");
  expect(Number(await canvas(page, "clearance"))).toBeGreaterThanOrEqual(1.69);
  await page.waitForTimeout(700);
  await shot(page, "07-eva-destination");

  // back to the 3D overview and to Planning: region, routes and numbers are still the planned mission
  await page.getByTestId("eva-to-3d").click();
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await expect(page.getByTestId("fly-route-terrain")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("start-eva").click();
  await expect(page.getByTestId("eva-done")).not.toHaveText("416 m");
  await page.getByTestId("eva-to-planning").click();
  await expect(page.getByTestId("region-m0a")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("len-distance")).toHaveText("416.426 m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("664.390 flat-equivalent m");
  expect(seen.external).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test("ROI-A journey on the CTX 20 m grid, and no walk at Bright Angel", async ({ page }) => {
  test.setTimeout(120_000);
  const seen = await guard(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await nav(page, "Planning");
  await expect(page.getByTestId("region-roi_a")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("len-distance")).toHaveText("969.161 m");
  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await page.getByTestId("start-eva").click();
  await expect(page.getByTestId("eva-hud")).toHaveAttribute("data-mode", "first-person");
  await expect(page.getByTestId("eva-world")).toHaveAttribute("data-texture", "ready");
  await page.getByTestId("eva-play").click(); // pause
  for (const f of [0.1, 0.5, 0.9]) await checkpoint(page, f, 969.161, f === 0.5 ? "08-eva-roi-a" : undefined);
  await page.getByTestId("eva-route-distance").click();
  await checkpoint(page, 0.5, 969.161);
  await page.getByTestId("eva-scrub").fill("1000");
  await expect(page.getByTestId("eva-arrived")).toBeVisible();
  await page.getByTestId("eva-to-planning").click();
  await expect(page.getByTestId("len-distance")).toHaveText("969.161 m");

  await nav(page, "Mission control");
  await page.getByTestId("mission-tab-C").click();
  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-3d-disabled")).toBeVisible();
  await expect(page.getByTestId("start-eva")).toHaveCount(0);
  await nav(page, "EVA HUD");
  await expect(page.getByTestId("eva-unavailable")).toContainText("Bright Angel");
  expect(seen.external).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test("without WebGL the EVA HUD falls back to the flat map by itself", async ({ page }) => {
  await page.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return /webgl/.test(type) ? null : (real as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof real;
  });
  await page.goto("/");
  await nav(page, "EVA HUD");
  await expect(page.getByTestId("eva-hud")).toHaveAttribute("data-mode", "flat");
  await expect(page.locator("path.hud-self")).toBeVisible();
  await expect(page.getByTestId("eva-sim-label")).toContainText("Simulated preview");
  await page.getByTestId("eva-scrub").fill("500");
  await expect(page.getByTestId("eva-done")).not.toHaveText("0 m");
});
