import { expect, test, type Page } from "@playwright/test";

async function inViewport(page: Page, testId: string) {
  const box = (await page.getByTestId(testId).boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + Math.min(box.height, 120)).toBeLessThanOrEqual(vp.height);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
}
const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name, exact: true }).click();

test("mission → map → evidence → planning, with B exploration and visible inspector cards", async ({ page }) => {
  const external: string[] = [];
  await page.route(/https?:\/\/(?!127\.0\.0\.1)/, (route) => { external.push(route.request().url()); return route.abort(); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("regional-svg")).toBeVisible();
  await expect(page.getByTestId("inspector-empty")).toBeVisible();
  await page.screenshot({ path: "test-results/s6-01-mission-control.png" });

  // a click on open ground opens the destination card in the visible viewport, with a marker
  const svg = page.getByTestId("regional-svg");
  const b = (await svg.boundingBox())!;
  await svg.click({ position: { x: b.width * 0.62, y: b.height * 0.72 } });
  await expect(page.getByTestId("inspector")).toHaveAttribute("data-kind", "destination");
  await inViewport(page, "inspector");
  await expect(page.getByTestId("regional-destination")).toBeAttached();
  await expect(page.getByTestId("destination-card")).toContainText("lat");
  await page.screenshot({ path: "test-results/s6-03-map-click-card.png" });
  await page.getByTestId("dismiss-card").click();
  await expect(page.getByTestId("inspector-empty")).toBeVisible();

  // selecting C by tab: mission inspector in view, map focused, state shared with Planning and 3D
  await page.getByTestId("mission-tab-C").click();
  await expect(page.getByTestId("inspector")).toHaveAttribute("data-kind", "mission");
  await inViewport(page, "inspector");
  await expect(page.getByTestId("inspector")).toContainText("C Bright Angel science objectives");
  await page.screenshot({ path: "test-results/s6-02-inspector-mission.png" });
  await page.getByTestId("mission-explore").click();
  await expect(page.getByTestId("explore-view")).toHaveAttribute("data-explore", "C");
  await expect(page.getByTestId("region-c")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("explore-route-disabled")).toContainText("Route planning at C is disabled");
  await expect(page.getByTestId("route-distance")).toHaveCount(0);
  await expect(page.getByTestId("regional-extra-sapphire")).toBeAttached();
  await expect(page.getByTestId("c-claims")).toContainText("9 source-backed claims");
  const bm = page.getByTestId("explore-map");
  const bb = (await bm.boundingBox())!;
  await bm.click({ position: { x: bb.width * 0.3, y: bb.height * 0.3 } });
  await expect(page.getByTestId("inspector")).toHaveAttribute("data-kind", "destination");
  await expect(page.getByTestId("destination-card")).toContainText("Outside every analysis grid");
  await expect(page.getByTestId("route-to-destination")).toBeDisabled();
  await expect(page.getByTestId("dest-set-start")).toBeDisabled();
  await page.screenshot({ path: "test-results/s6-04-b-explore.png" });
  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-3d-disabled")).toBeVisible();
  await expect(page.getByTestId("terrain-canvas")).toHaveCount(0);
  await page.screenshot({ path: "test-results/s6-05-b-3d-disabled.png" });

  // persistence: Mission Control still shows B selected; switching to A moves Planning to the M0-A corridor
  await nav(page, "Mission control");
  await expect(page.getByTestId("mission-tab-C")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("mission-tab-A").click();
  await nav(page, "Planning");
  await expect(page.getByTestId("region-m0a")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("len-distance")).toHaveText("416.426 m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("664.390 flat-equivalent m");
  await expect(page.getByTestId("route-conditions")).toContainText("Radiation");
  await expect(page.getByTestId("route-conditions")).toContainText("no validated spatial radiation dataset");
  await expect(page.getByTestId("context-image")).toBeAttached();
  await page.screenshot({ path: "test-results/s6-06-planning-m0a.png" });

  // ROI-A unchanged for identical endpoints
  await page.getByTestId("region-roi_a").click();
  await expect(page.getByTestId("len-distance")).toHaveText("969.161 m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("1058.299 flat-equivalent m");
  expect(external).toEqual([]);
});

test("layer switches change rendered pixels and legends", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByTestId("mission-tab-A").click();
  await nav(page, "Planning");
  await expect(page.getByTestId("len-distance")).toHaveText("416.426 m");
  const frame = page.locator(".map-frame");
  await page.waitForTimeout(300);
  const size = (await frame.boundingBox())!;
  const shot = async () => {
    const now = (await frame.boundingBox())!;
    expect([now.width, now.height]).toEqual([size.width, size.height]); // a layer switch must not resize the map
    return frame.screenshot();
  };
  let prev = await shot();
  for (const layer of ["hillshade", "elevation", "slope", "steep"] as const) {
    await page.getByTestId(`layer-${layer}`).click();
    await expect(page.getByTestId(`layer-${layer}`)).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(250);
    const now = await shot();
    expect(Buffer.compare(prev, now), `${layer} should change the map pixels`).not.toBe(0);
    await expect(page.getByTestId("layer-bar-legend")).toContainText(layer === "steep" ? "Steepness" : layer === "hillshade" ? "Hillshade" : layer === "elevation" ? "Elevation" : "Slope");
    await expect(page.getByTestId(`legend-${layer}`)).toBeAttached();
    prev = now;
  }
  await page.getByTestId("layer-ortho").click();
  await page.waitForTimeout(250);
  expect(Buffer.compare(prev, await shot()), "ortho off should change pixels").not.toBe(0);
  // NoData overlay: the M0-A grid has no NoData cells, so the legend updates and the pixels must stay identical
  const before = await shot();
  await page.getByTestId("layer-validity").click();
  await expect(page.getByTestId("layer-bar-legend")).toContainText("Coverage / NoData");
  await page.waitForTimeout(250);
  expect(Buffer.compare(before, await shot())).toBe(0);
});

for (const vp of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
  test(`layout ${vp.width}x${vp.height}: map-first Planning and in-view Mission Control card`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/");
    const map = (await page.getByTestId("regional-map").boundingBox())!;
    expect(map.width * map.height).toBeGreaterThan(vp.width * vp.height * (vp.width >= 1400 ? 0.4 : 0.3));
    await page.getByTestId("mission-tab-M0").click();
    await inViewport(page, "inspector");
    await nav(page, "Planning");
    await expect(page.getByTestId("grid-outline")).toBeAttached();
    const frame = (await page.locator(".map-frame").boundingBox())!;
    expect(frame.width * frame.height).toBeGreaterThan(vp.width * vp.height * (vp.width >= 1400 ? 0.35 : 0.2));
    const sideOpen = (await page.locator(".work aside.side").count()) > 0;
    await page.getByTestId("toggle-side").click();
    const after = (await page.locator(".map-frame").boundingBox())!;
    if (sideOpen) expect(after.width).toBeGreaterThan(frame.width); // hiding the panel widens the map
    else expect(after.width).toBeLessThan(frame.width); // laptop size starts collapsed; opening the panel narrows it
    await page.screenshot({ path: `test-results/s6-layout-${vp.width}.png` });
  });
}

test("M0-A 3D: x1 vertical exaggeration by default, full-height canvas and a working terrain fit", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByTestId("mission-tab-A").click();
  await nav(page, "3D terrain");
  await expect(page.getByTestId("analysis-dem")).toContainText("HiRISE 2 m");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await expect(page.getByText(/VERTICAL EXAGGERATION ×1\b/)).toBeVisible();
  const canvas = (await page.getByTestId("terrain-canvas").boundingBox())!;
  expect(canvas.height).toBeGreaterThan(900 * 0.6); // terrain gets most of the height on wide screens
  await page.waitForTimeout(500);
  const before = await page.getByTestId("terrain-canvas").screenshot();
  await page.getByTestId("fit-terrain").click();
  await page.waitForTimeout(600);
  const after = await page.getByTestId("terrain-canvas").screenshot();
  expect(Buffer.compare(before, after)).not.toBe(0);
  await page.screenshot({ path: "test-results/s6-07-m0a-3d-fit.png" });
});

test("regional relief 3D: display only, coarse, labelled, no route; reachable from Mission Control and the B notice", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByTestId("mc-open-relief").click();
  await expect(page.getByTestId("regional-relief")).toBeVisible();
  await expect(page.locator('[data-testid="relief-canvas"][data-texture="ready"]')).toBeAttached();
  await expect(page.getByTestId("relief-label")).toContainText("No routing, slope, hazard or traversability information");
  await expect(page.getByTestId("relief-limits")).toContainText("UNRESOLVED");
  await expect(page.getByTestId("relief-limits")).toContainText("UNVERIFIED");
  await expect(page.getByTestId("relief-ve-readout")).toHaveText("VERTICAL EXAGGERATION ×1");
  await expect(page.getByTestId("route-distance")).toHaveCount(0);
  await page.waitForTimeout(700);
  const c = page.getByTestId("relief-canvas");
  const box = (await c.boundingBox())!;
  expect(box.height).toBeGreaterThan(900 * 0.6);
  const ve1 = await c.screenshot();
  await page.getByTestId("relief-ve-3").click();
  await page.waitForTimeout(500);
  expect(Buffer.compare(ve1, await c.screenshot())).not.toBe(0);
  await page.getByTestId("relief-ve-1").click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/s7-01-regional-relief.png" });
  // leaving the 3D scene closes the regional view; B keeps its detailed 3D disabled but can open regional relief
  await page.getByTestId("relief-back").click();
  await nav(page, "Mission control");
  await page.getByTestId("mission-tab-C").click();
  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-3d-disabled")).toBeVisible();
  await page.getByTestId("open-relief").click();
  await expect(page.getByTestId("regional-relief")).toBeVisible();
  await expect(page.getByTestId("relief-back")).toContainText("C detailed 3D not available");
});
