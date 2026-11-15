// S15 pictures in real Chrome on the GPU: mission B routed on the wider M0-A-B grid, in every scene it touches.
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name, exact: true }).click();
const shot = async (page: Page, name: string) => { await page.waitForTimeout(900); await page.screenshot({ path: `test-results/s15-app-${name}.png` }); };

test("mission B on the wider grid", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await expect(page.getByTestId("targets-M0").getByRole("button")).toHaveCount(10);
  await page.getByTestId("mission-tab-B").click();
  await shot(page, "01-mission-control-b");
  await page.getByTestId("mission-plan").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("438.587 m");
  await shot(page, "02-planning-b-three-routes");
  await page.getByTestId("use-conservative").click();
  await page.getByTestId("conservative-note").scrollIntoViewIfNeeded();
  await shot(page, "03-planning-b-conservative");
  await page.getByTestId("layer-slope").click();
  await shot(page, "04-planning-b-slope-layer");
  await page.getByTestId("layer-slope").click();

  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await shot(page, "05-3d-b-three-routes");
  await page.getByTestId("start-eva").click();
  await expect(page.getByTestId("eva-world")).toHaveAttribute("data-texture", "ready");
  await page.waitForTimeout(1500);
  const canvas = page.getByTestId("eva-canvas"), f0 = Number(await canvas.getAttribute("data-frames")), t0 = Date.now();
  await page.waitForTimeout(4000);
  const fps = (Number(await canvas.getAttribute("data-frames")) - f0) / ((Date.now() - t0) / 1000);
  console.log(`EVA_FPS wider M0-A-B grid (155.8k cells), M0->B ${fps.toFixed(1)} fps at 1440x900`);
  expect(fps).toBeGreaterThan(24);
  await page.getByTestId("eva-play").click();
  await page.getByTestId("eva-scrub").fill("350");
  await shot(page, "06-eva-b-mid");
  await page.getByTestId("eva-scrub").fill("960");
  await shot(page, "07-eva-b-near-amalik");

  await nav(page, "Mission control");
  await page.getByTestId("mc-open-relief").click();
  await expect(page.locator('[data-testid="relief-canvas"][data-texture="ready"]')).toBeAttached();
  await page.getByTestId("relief-marker-m0ab_analysis").click();
  await shot(page, "08-relief-wider-grid");
  await nav(page, "Provenance");
  await shot(page, "09-provenance");
  await nav(page, "Mission control");
  await page.getByTestId("mission-tab-A").click();
  await page.getByTestId("mission-plan").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");
  await shot(page, "10-planning-a-frozen-grid");
});
