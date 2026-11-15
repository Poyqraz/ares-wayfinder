// S13 pictures in real Chrome on the GPU: three route strategies in Planning and 3D Terrain, a fail-closed result,
// the environmental layers in Planning, Mission Control and 3D, and the scenario dust-storm indicator in the EVA visor.
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name, exact: true }).click();
const shot = async (page: Page, name: string) => { await page.waitForTimeout(900); await page.screenshot({ path: `test-results/s13-app-${name}.png` }); };

test("three routes, environmental layers, storm indicator", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await expect(page.getByTestId("targets-M0").getByRole("button")).toHaveCount(10);
  await page.getByTestId("mission-tab-A").click();
  await page.getByTestId("mission-plan").click();
  await expect(page.getByTestId("len-conservative")).toHaveText("453.513 m");
  await shot(page, "01-planning-three-routes");
  await page.getByTestId("use-conservative").click();
  await page.getByTestId("route-marker-detour").dispatchEvent("pointerdown", { button: 0, pointerId: 1 });
  await page.getByTestId("route-marker-detour").dispatchEvent("pointerup", { button: 0, pointerId: 1 });
  await shot(page, "02-planning-conservative-detour-marker");
  await page.getByTestId("conservative-note").scrollIntoViewIfNeeded();
  await shot(page, "03-planning-comparison-table");

  await page.getByTestId("layer-environment").click();
  await shot(page, "04-planning-dust-layer");
  await page.getByTestId("env-layer-weather").click();
  await shot(page, "05-planning-weather-layer-meda-site");
  await page.getByTestId("env-layer-radiation").click();
  await page.getByTestId("env-block").scrollIntoViewIfNeeded();
  await shot(page, "06-planning-radiation-cards");

  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await shot(page, "07-3d-three-routes");
  await page.getByTestId("env-key").scrollIntoViewIfNeeded();
  await shot(page, "07b-3d-radiation-key");
  await page.getByTestId("layer-environment").click(); // off
  await page.getByTestId("view-scientific").click();
  await shot(page, "08-3d-three-routes-scientific");
  await page.getByTestId("view-cinematic").click();

  await page.getByTestId("start-eva").click();
  await expect(page.getByTestId("eva-world")).toHaveAttribute("data-texture", "ready");
  await page.waitForTimeout(1500);
  const canvas = page.getByTestId("eva-canvas"), f0 = Number(await canvas.getAttribute("data-frames")), t0 = Date.now();
  await page.waitForTimeout(4000);
  const fps = (Number(await canvas.getAttribute("data-frames")) - f0) / ((Date.now() - t0) / 1000);
  console.log(`EVA_FPS with storm indicator, conservative route, M0-A ${fps.toFixed(1)} fps at 1440x900`);
  expect(fps).toBeGreaterThan(24);
  await page.getByTestId("eva-scrub").fill("300");
  await shot(page, "09-eva-storm-indicator");
  await page.getByTestId("eva-storm-toggle").click();
  await shot(page, "10-eva-storm-details-open");
  await page.getByTestId("eva-storm-toggle").click();
  await page.getByTestId("view-scientific").click();
  await shot(page, "11-eva-storm-scientific-view");
  await page.getByTestId("view-cinematic").click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await shot(page, "12-eva-storm-1024");
  await nav(page, "Planning");
  await page.getByTestId("layer-environment").click();
  await shot(page, "13-planning-1024-dust");
  await page.setViewportSize({ width: 1440, height: 900 });

  await nav(page, "Mission control");
  await page.getByTestId("mc-tab-environment").click();
  await shot(page, "14-mission-control-environment-dust");
  await page.getByTestId("env-layer-radiation").click();
  await page.getByTestId("env-card-rad-jezero").scrollIntoViewIfNeeded();
  await shot(page, "15-mission-control-environment-radiation");
});
