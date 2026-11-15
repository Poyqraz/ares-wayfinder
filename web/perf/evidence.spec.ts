// S9 evidence pictures, taken in real Chrome on the GPU: the same route north-up in 2D with the slope layer, in 3D at
// true vertical scale from two directions, in 3D at x2.5 (to show what exaggeration does), and its terrain chart.
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name, exact: true }).click();
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/s9-evidence-${name}.png` });

async function threeD(page: Page, tag: string) {
  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await page.waitForTimeout(1200);
  await shot(page, `${tag}-3d-x1-overview`);
  // the same camera with heights stretched x2.5: what exaggeration does to the look of a slope
  await page.getByRole("button", { name: "×2.5", exact: true }).click();
  await expect(page.getByTestId("ve-warning")).toBeVisible();
  await page.waitForTimeout(1000);
  await shot(page, `${tag}-3d-x2_5-same-view`);
  await page.getByRole("button", { name: "×1", exact: true }).click();
  await page.waitForTimeout(600);
  // lower view from the south-east at true scale, closer to the climb
  const box = (await page.getByTestId("terrain-canvas").boundingBox())!, cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 170, cy - 95, { steps: 12 });
  await page.mouse.up();
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(1200);
  await shot(page, `${tag}-3d-x1-low-oblique`);
}

test("evidence: M0-A reference route and the base route in 2D, true-scale 3D and profile", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.getByTestId("mission-tab-A").click();
  await page.getByTestId("mission-plan").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");
  await page.getByTestId("layer-slope").click();
  await page.getByTestId("layer-steep").click();
  await page.waitForTimeout(500);
  await shot(page, "m0a-ref-2d-north-up-slope");
  await page.getByTestId("traverse-panel").scrollIntoViewIfNeeded();
  await page.getByTestId("traverse-panel").screenshot({ path: "test-results/s9-evidence-m0a-ref-terrain-panel.png" });
  await page.getByTestId("gate-20").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("417.566 m");
  await page.waitForTimeout(400);
  await shot(page, "m0a-gate20-2d");
  await page.getByTestId("traverse-panel").screenshot({ path: "test-results/s9-evidence-m0a-gate20-terrain-panel.png" });
  await page.getByTestId("gate-off").click();
  await page.getByTestId("layer-slope").click();
  await page.getByTestId("layer-steep").click();
  await threeD(page, "m0a-ref");

  // the hypothetical base route to A
  await nav(page, "Mission control");
  await page.getByTestId("open-site-base").click();
  await page.getByTestId("plan-base-A").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("279.059 m");
  await page.getByTestId("layer-slope").click();
  await page.waitForTimeout(500);
  await shot(page, "base-a-2d-north-up-slope");
  await page.getByTestId("traverse-panel").scrollIntoViewIfNeeded();
  await page.getByTestId("traverse-panel").screenshot({ path: "test-results/s9-evidence-base-a-terrain-panel.png" });
  await page.getByTestId("layer-slope").click();
  await threeD(page, "base-a");
});
