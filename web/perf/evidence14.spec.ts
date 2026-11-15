// S14 pictures in real Chrome on the GPU: every scene the M0-A-B-C change touches, and the redesigned EVA visor.
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name, exact: true }).click();
const shot = async (page: Page, name: string) => { await page.waitForTimeout(900); await page.screenshot({ path: `test-results/s14-app-${name}.png` }); };

test("missions B and C in every scene, and the EVA visor", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await expect(page.getByTestId("targets-M0").getByRole("button")).toHaveCount(10);
  await nav(page, "Orbital");
  await shot(page, "05-orbital");
  await nav(page, "Mission control");
  await shot(page, "01-mission-control");
  await page.getByTestId("mission-tab-B").click();
  await shot(page, "02-mission-control-b-selected");
  await page.getByTestId("target-chip-sample:M2020-00579-17").click();
  await shot(page, "03-mission-control-mageik");
  await page.getByTestId("mission-tab-C").click();
  await shot(page, "04-mission-control-c-selected");

  await page.getByTestId("mission-tab-B").click();
  await page.getByTestId("mission-plan").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("438.587 m");
  await shot(page, "06-planning-b-routes");
  await page.getByTestId("region-c").click();
  await shot(page, "07-planning-c-exploration");
  await nav(page, "3D terrain");
  await shot(page, "08-3d-c-not-available");

  await nav(page, "Mission control");
  await page.getByTestId("mc-open-relief").click();
  await expect(page.locator('[data-testid="relief-canvas"][data-texture="ready"]')).toBeAttached();
  await shot(page, "09-relief-overview");
  await page.getByTestId("relief-marker-mission:B").click();
  await shot(page, "10-relief-b");
  await page.getByTestId("relief-marker-outcrop:amalik").click();
  await shot(page, "11-relief-amalik");
  await page.getByTestId("relief-marker-mission:C").click();
  await shot(page, "12-relief-c");

  await nav(page, "Mission control");
  await page.getByTestId("open-atlas").click();
  await page.getByTestId("atlas-b").scrollIntoViewIfNeeded();
  await shot(page, "13-atlas-b");
  await page.getByTestId("atlas-c").scrollIntoViewIfNeeded();
  await shot(page, "14-atlas-c");

  await page.goto("/");
  await expect(page.getByTestId("targets-M0").getByRole("button")).toHaveCount(10);
  await page.getByTestId("mission-tab-A").click();
  await page.getByTestId("mission-plan").click();
  await expect(page.getByTestId("len-conservative")).toHaveText("453.513 m");
  await shot(page, "15-planning-m0a");
  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await page.getByTestId("start-eva").click();
  await expect(page.getByTestId("eva-world")).toHaveAttribute("data-texture", "ready");
  await page.waitForTimeout(1500);
  const canvas = page.getByTestId("eva-canvas"), f0 = Number(await canvas.getAttribute("data-frames")), t0 = Date.now();
  await page.waitForTimeout(4000);
  const fps = (Number(await canvas.getAttribute("data-frames")) - f0) / ((Date.now() - t0) / 1000);
  console.log(`EVA_FPS redesigned visor, M0-A ${fps.toFixed(1)} fps at 1440x900`);
  expect(fps).toBeGreaterThan(24);
  await page.getByTestId("eva-play").click();
  await page.getByTestId("eva-scrub").fill("300");
  await shot(page, "16-eva-visor");
  await page.getByTestId("eva-next").click();
  await shot(page, "17-eva-marker-details");
  await page.getByTestId("eva-marker-close").click();
  await page.getByTestId("eva-storm-toggle").click();
  await shot(page, "18-eva-storm-details");
  await page.getByTestId("eva-storm-toggle").click();
  await page.getByTestId("eva-scrub").fill("640");
  await page.getByTestId("view-scientific").click();
  await shot(page, "19-eva-visor-scientific");
  await page.getByTestId("view-cinematic").click();
  await page.getByTestId("eva-details").locator("summary").click();
  await page.getByTestId("eva-details").scrollIntoViewIfNeeded();
  await shot(page, "20-eva-about-panel");
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.locator(".hud-visor").scrollIntoViewIfNeeded();
  await shot(page, "21-eva-visor-1024");
  await nav(page, "Mission control");
  await page.getByTestId("mission-tab-B").click();
  await shot(page, "22-mission-control-1024-b");
});
