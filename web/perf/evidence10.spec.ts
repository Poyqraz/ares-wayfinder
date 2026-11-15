// S10 pictures of the finished application, taken in real Chrome on the GPU: every scene, the three missions, the
// route-marker cards in 2D and 3D, and the first-person EVA view at x3 and x1.
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name, exact: true }).click();
const shot = async (page: Page, name: string) => { await page.waitForTimeout(700); await page.screenshot({ path: `test-results/s10-app-${name}.png` }); };

test("finished application: scenes, missions, markers, EVA x3 and x1, frame rate", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await expect(page.getByTestId("regional-sites")).toBeAttached();
  await nav(page, "Orbital");
  await expect(page.getByTestId("orbital-svg")).toBeVisible();
  await shot(page, "01-orbital");
  await page.getByTestId("enter-mission-control").click();
  await shot(page, "02-mission-control");
  await page.getByTestId("mission-tab-M0").click();
  await page.getByTestId("target-chip-drop:M2020-00516-15").click();
  await shot(page, "03-m0-samples");
  await page.getByTestId("target-chip-outcrop:skinner_ridge").click();
  await shot(page, "04-a-outcrops");
  await page.getByTestId("target-chip-rock:cheyava_falls").click();
  await shot(page, "05-b-bright-angel");
  await page.getByTestId("target-chip-F01").click();
  await shot(page, "06-feature-f01");

  await page.getByTestId("mission-tab-A").click();
  await page.getByTestId("mission-plan").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");
  await page.getByTestId("route-marker-ground").dispatchEvent("pointerdown", { button: 0, pointerId: 1 });
  await page.getByTestId("route-marker-ground").dispatchEvent("pointerup", { button: 0, pointerId: 1 });
  await shot(page, "07-planning-marker-card");
  await page.getByTestId("gate-20").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("417.566 m");
  await shot(page, "08-planning-gate-20");
  await page.getByTestId("gate-off").click();

  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await page.getByTestId("marker3d-climb").click();
  await shot(page, "09-3d-marker-card");

  await page.getByTestId("start-eva").click();
  await expect(page.getByTestId("eva-world")).toHaveAttribute("data-texture", "ready");
  await page.waitForTimeout(1500);
  const canvas = page.getByTestId("eva-canvas"), f0 = Number(await canvas.getAttribute("data-frames")), t0 = Date.now();
  await page.waitForTimeout(4000);
  const fps = (Number(await canvas.getAttribute("data-frames")) - f0) / ((Date.now() - t0) / 1000);
  console.log(`EVA_FPS x3 display, M0-A ${fps.toFixed(1)} fps at 1440x900`);
  expect(fps).toBeGreaterThan(24);
  await page.getByTestId("eva-play").click();
  for (const [f, tag] of [[350, "a"], [800, "b"]] as const) {
    await page.getByTestId("eva-scrub").fill(String(f));
    await page.getByTestId("eva-ve-3").click();
    await shot(page, `10${tag}-eva-x3`);
    await page.getByTestId("eva-ve-1").click();
    await shot(page, `10${tag}-eva-x1`);
  }
  await page.getByTestId("eva-ve-3").click();
  await page.getByTestId("eva-scrub").fill("930");
  await page.getByTestId("eva-play").click();
  await expect(page.getByTestId("eva-arrived")).toBeVisible({ timeout: 30_000 });
  await shot(page, "11-eva-arrived-x3");

  await nav(page, "Provenance");
  await shot(page, "12-provenance");
  await nav(page, "Mission control");
  await page.getByTestId("open-atlas").click();
  await expect(page.getByTestId("m0-row")).toHaveCount(10);
  await shot(page, "13-science-atlas");
});
