// s7-rc3 acceptance: the complete EVA walk, mini-map sync, the HiRISE inset on the regional map, and narrower viewports.
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name, exact: true }).click();
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/rc3-${name}.png` });
const metres = async (page: Page, id: string) => Number(((await page.getByTestId(id).textContent()) ?? "").replace(" m", ""));
const guard = async (page: Page) => {
  const external: string[] = [], errors: string[] = [];
  await page.route(/https?:\/\/(?!127\.0\.0\.1)/, (r) => { external.push(r.request().url()); return r.abort(); });
  page.on("pageerror", (e) => errors.push(e.message));
  return { external, errors };
};
const baseRoute = async (page: Page) => {
  await page.goto("/");
  await page.getByTestId("open-site-base").click();
  await page.getByTestId("plan-base-A").click();
  await expect(page.getByTestId("route-marker-start")).toBeAttached(); // the side panel is collapsed on narrow viewports; the route markers are not
};
/** The mini-map dot and the visor share one position: both must report the same point. */
const miniInSync = async (page: Page) => {
  const pos = (await page.getByTestId("eva-hud").getAttribute("data-pos"))!.split(",").map(Number);
  const dot = page.getByTestId("eva-mini-self");
  expect(Number(await dot.getAttribute("cx"))).toBeCloseTo(pos[0], 1);
  expect(Number(await dot.getAttribute("cy"))).toBeCloseTo(pos[1], 1);
  return pos;
};

test("EVA: the whole walk from start to destination, pause, scrub, route change, restart", async ({ page }) => {
  test.setTimeout(150_000); // the whole walk in real time on a software renderer: 90 s ran out once with the full suite running beside it
  const seen = await guard(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await baseRoute(page);
  const planned = Number(((await page.getByTestId("len-terrain").textContent()) ?? "").replace(" m", ""));
  await nav(page, "EVA HUD");
  await expect(page.getByTestId("eva-sim-label")).toContainText("Simulated preview");
  await expect(page.getByTestId("eva-suit")).toContainText("Simulated demo values · not sensor readings");
  await expect(page.getByTestId("eva-done")).toHaveText("0 m");
  expect(await metres(page, "eva-remaining")).toBe(Math.round(planned)); // the HUD walks the planned route, not another line
  expect(Number(await page.getByTestId("eva-hud").getAttribute("data-guidance"))).toBeGreaterThan(3);
  const start = await miniInSync(page);

  // play, then pause: the position holds while paused
  await page.getByTestId("eva-play").click();
  await expect(page.getByTestId("eva-play")).toHaveText("Pause");
  await expect.poll(() => metres(page, "eva-done")).toBeGreaterThan(10);
  await page.getByTestId("eva-play").click();
  await expect(page.getByTestId("eva-play")).toHaveText("Resume");
  const held = await metres(page, "eva-done");
  await page.waitForTimeout(400);
  expect(await metres(page, "eva-done")).toBe(held);
  expect((await miniInSync(page))[0]).not.toBe(start[0]);

  // scrubbing moves visor, mini-map and readouts together
  await page.getByTestId("eva-scrub").fill("350");
  expect(Math.abs((await metres(page, "eva-done")) - planned * 0.35)).toBeLessThan(1.5);
  await miniInSync(page);
  await page.getByTestId("eva-view-toggle").click(); // flat-map fallback: the walker arrow sits inside the visor, clear of the profile strip
  await expect(page.getByTestId("eva-hud")).toHaveAttribute("data-mode", "flat");
  const visor = (await page.locator(".hud-visor").boundingBox())!;
  const self = (await page.locator("path.hud-self").boundingBox())!;
  expect(self.y).toBeGreaterThan(visor.y + visor.height * 0.3);
  expect(self.y + self.height).toBeLessThan((await page.getByTestId("eva-profile-box").boundingBox())!.y);
  await page.getByTestId("eva-view-toggle").click();
  await expect(page.getByTestId("eva-world")).toHaveAttribute("data-texture", "ready");
  await page.waitForTimeout(500);
  await shot(page, "eva-walking");

  // elevation profile: ×1 is true scale, ×3 is labelled as exaggerated
  await expect(page.getByTestId("eva-ve-readout")).toContainText("vertical exaggeration ×3");
  const shape = async () => { const b = (await page.getByTestId("eva-profile").locator("polyline").boundingBox())!; return b.height / b.width; };
  const x3 = await shape();
  await page.getByTestId("eva-ve-1").click();
  await expect(page.getByTestId("eva-ve-readout")).toContainText("×1 (true scale)");
  expect(x3 / (await shape())).toBeCloseTo(3, 0); // the drawn profile is exactly three times flatter at true scale
  await page.getByTestId("eva-ve-3").click();

  // changing the route restarts the walk on the other computed route
  await page.getByTestId("eva-route-distance").click();
  await expect(page.getByTestId("eva-route-distance")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("eva-done")).toHaveText("0 m");
  await miniInSync(page);
  await page.getByTestId("eva-route-terrain").click();
  await expect(page.getByTestId("eva-done")).toHaveText("0 m");

  // the complete walk, start to destination
  await page.getByTestId("eva-play").click();
  await expect(page.getByTestId("eva-arrived")).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId("eva-remaining")).toHaveText("0 m");
  await expect(page.getByTestId("eva-next")).toContainText("Destination reached");
  await expect(page.getByTestId("eva-play")).toHaveText("Walk again");
  expect(await metres(page, "eva-done")).toBe(Math.round(planned));
  const end = await miniInSync(page);
  expect(end[0] !== start[0] || end[1] !== start[1]).toBe(true);
  await shot(page, "eva-arrived");

  // restart from the destination
  await page.getByTestId("eva-play").click();
  await expect(page.getByTestId("eva-play")).toHaveText("Pause");
  await expect(page.getByTestId("eva-arrived")).toHaveCount(0);
  await expect.poll(() => metres(page, "eva-done")).toBeLessThan(planned / 2);
  await page.getByTestId("eva-play").click();

  // Bright Angel has no validated terrain: no walk is offered there
  await nav(page, "Mission control");
  await page.getByTestId("mission-tab-C").click();
  await nav(page, "EVA HUD");
  await expect(page.getByTestId("eva-unavailable")).toContainText("Bright Angel");
  expect(seen.external).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test("regional map shows the HiRISE 1 m ortho inside the M0-A grid when zoomed in, and 3D frames the terrain", async ({ page }) => {
  const seen = await guard(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("regional-sites")).toBeAttached();
  await expect(page.getByTestId("regional-m0a_analysis-detail")).toHaveCount(0); // regional zoom: CTX 6 m only
  const base = (await page.getByTestId("site-base").boundingBox())!;
  await page.mouse.move(base.x + base.width / 2, base.y + base.height / 2);
  for (let k = 0; k < 40 && (await page.getByTestId("regional-m0a_analysis-detail").count()) === 0; k++) await page.mouse.wheel(0, -300);
  await expect(page.getByTestId("regional-m0a_analysis-detail")).toBeAttached();
  await expect(page.getByTestId("regional-m0a_analysis")).toContainText("HiRISE 1 m imagery");
  for (let k = 0; k < 6; k++) await page.mouse.wheel(0, -300);
  await page.waitForTimeout(300);
  await shot(page, "regional-hirise-detail");

  await nav(page, "Orbital");
  await expect(page.getByTestId("orbital-svg")).toBeVisible();
  for (const id of ["site-base", "site-landing_zone", "site-camp_b", "regional-waypoint-C"]) await expect(page.getByTestId("orbital-scene").getByTestId(id)).toBeInViewport();
  await shot(page, "orbital");

  await page.getByTestId("enter-mission-control").click();
  await page.getByTestId("open-site-base").click();
  await page.getByTestId("plan-base-A").click();
  await shot(page, "planning");
  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await page.waitForTimeout(700);
  await shot(page, "3d-default");
  await page.getByTestId("fit-terrain").click();
  await page.waitForTimeout(700);
  await shot(page, "3d-fit");
  await nav(page, "Provenance");
  await expect(page.locator(".src-link").first()).toBeVisible();
  await shot(page, "provenance");
  expect(seen.external).toEqual([]);
  expect(seen.errors).toEqual([]);
});

for (const [w, h] of [[1024, 768], [768, 1024]] as const) {
  test(`every scene fits a ${w} x ${h} viewport`, async ({ page }) => {
    test.setTimeout(180_000); // seven scenes in software-rendered WebGL while other workers are busy
    const seen = await guard(page);
    await page.setViewportSize({ width: w, height: h });
    await baseRoute(page);
    const fits = async (name: string) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${name}: no sideways scroll`).toBeLessThanOrEqual(1);
      await shot(page, `${w}-${name}`);
    };
    await fits("planning");
    await nav(page, "EVA HUD");
    await page.getByTestId("eva-scrub").fill("400");
    await expect(page.getByTestId("eva-sim-label")).toBeVisible();
    await expect(page.getByTestId("eva-minimap")).toBeVisible();
    await expect(page.getByTestId("eva-play")).toBeVisible();
    await page.getByTestId("eva-view-toggle").click(); // the flat map stays available as a fallback view
    const self = (await page.locator("path.hud-self").boundingBox())!;
    expect(self.y + self.height).toBeLessThan((await page.getByTestId("eva-profile-box").boundingBox())!.y);
    await page.getByTestId("eva-view-toggle").click();
    await expect(page.getByTestId("eva-world")).toHaveAttribute("data-texture", "ready");
    await page.waitForTimeout(500);
    await fits("eva");
    await nav(page, "3D terrain");
    await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
    await page.waitForTimeout(600);
    await fits("3d");
    await nav(page, "Provenance");
    await expect(page.getByTestId("dataset-table")).toBeVisible();
    await fits("provenance");
    await nav(page, "Orbital");
    await expect(page.getByTestId("orbital-svg")).toBeVisible();
    await page.getByTestId("regional-reset").click();
    await page.waitForTimeout(500);
    const map = (await page.getByTestId("orbital-svg").boundingBox())!;
    expect(map.width / map.height, "the Orbital map keeps the mosaic's proportions").toBeGreaterThan(1.2);
    await fits("orbital");
    await nav(page, "Mission control");
    await expect(page.getByTestId("regional-sites")).toBeAttached();
    await fits("mission-control");
    await page.getByTestId("open-atlas").click();
    await expect(page.getByTestId("m0-row")).toHaveCount(10);
    for (const id of ["atlas-m0", "atlas-a", "atlas-b", "atlas-c", "atlas-meda"]) await expect(page.getByTestId(id)).toBeAttached();
    await fits("atlas");
    expect(seen.external).toEqual([]);
    expect(seen.errors).toEqual([]);
  });
}
