// S11 pictures in real Chrome on the GPU: Regional Relief 3D with its mission markers from several cameras and zooms,
// and the 3D route line at x1, x2.5 and x10, from two angles, with and without the slope inspection overlay.
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name, exact: true }).click();
const shot = async (page: Page, name: string) => { await page.waitForTimeout(900); await page.screenshot({ path: `test-results/s11-app-${name}.png` }); };
async function orbit(page: Page, testId: string, dx: number, dy: number, wheel = 0) {
  const box = (await page.getByTestId(testId).boundingBox())!, cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 10 });
  await page.mouse.up();
  if (wheel) await page.mouse.wheel(0, wheel);
}

test("regional relief mission map and the 3D route line", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await expect(page.getByTestId("targets-M0").getByRole("button")).toHaveCount(10);
  await page.getByTestId("mc-open-relief").click();
  await expect(page.locator('[data-testid="relief-canvas"][data-texture="ready"]')).toBeAttached();
  await shot(page, "01-relief-whole-region");
  await orbit(page, "relief-canvas", 220, -60);
  await shot(page, "02-relief-whole-region-rotated");
  await page.getByTestId("relief-reset").click();
  for (const [id, name] of [["site:base", "03-relief-base-m0-a"], ["mission:M0", "04-relief-m0"], ["drop:M2020-00516-15", "05-relief-m0-sample"], ["outcrop:skinner_ridge", "06-relief-a-outcrops"],
    ["site:landing_zone", "07-relief-landing-zone"], ["mission:C", "08-relief-c"], ["rock:cheyava_falls", "09-relief-cheyava"], ["feature:F01", "10-relief-f01"], ["roi_a", "11-relief-roi-a-grid"]] as const) {
    await page.getByTestId(`relief-marker-${id}`).click();
    await shot(page, name);
  }
  await page.getByTestId("relief-marker-site:base").click();
  await orbit(page, "relief-canvas", -260, -110);
  await shot(page, "12-relief-base-low-angle");
  await page.getByTestId("relief-ve-3").click();
  await shot(page, "13-relief-base-low-angle-x3");
  await page.getByTestId("relief-ve-1").click();

  await page.getByRole("button", { name: "Mission Control", exact: true }).click();
  await page.getByTestId("mission-tab-A").click();
  await page.getByTestId("mission-plan").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");
  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await shot(page, "20-route-x1");
  await page.getByTestId("slope-overlay-toggle").check();
  await shot(page, "21-route-x1-slope-overlay");
  await page.getByTestId("slope-overlay-toggle").uncheck();
  await page.getByTestId("fly-route-distance").click();
  await shot(page, "22-route-x1-distance-selected");
  await page.getByTestId("fly-route-terrain").click();
  for (const ve of ["2.5", "10"]) {
    await page.getByRole("button", { name: `×${ve}`, exact: true }).click();
    await page.getByTestId("fit-terrain").click();
    await shot(page, `23-route-x${ve.replace(".", "_")}`);
  }
  await page.getByRole("button", { name: "×1", exact: true }).click();
  await page.getByTestId("fit-terrain").click();
  await orbit(page, "terrain-canvas", 240, -120, -400);
  await shot(page, "24-route-x1-low-angle");
});
