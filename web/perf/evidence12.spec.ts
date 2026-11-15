// S12 pictures in real Chrome on the GPU: the EVA near ground before (Scientific View = the previous rendering) and
// after (Mars Cinematic View) at early, middle and destination positions; 3D Terrain in both styles; and the Regional
// Relief sidebar at 1440 x 900 and 1024 x 768.
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name, exact: true }).click();
const shot = async (page: Page, name: string) => { await page.waitForTimeout(900); await page.screenshot({ path: `test-results/s12-app-${name}.png` }); };

test("EVA ground and atmosphere, 3D Terrain styles, relief sidebar", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await expect(page.getByTestId("targets-M0").getByRole("button")).toHaveCount(10);
  await page.getByTestId("mission-tab-A").click();
  await page.getByTestId("mission-plan").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");
  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await expect(page.getByTestId("view-cinematic")).toHaveAttribute("aria-pressed", "true"); // with a GPU the app starts in Mars Cinematic View
  await shot(page, "01-3d-cinematic");
  await page.getByTestId("view-scientific").click();
  await shot(page, "02-3d-scientific");
  await page.getByTestId("view-cinematic").click();

  await page.getByTestId("start-eva").click();
  await expect(page.getByTestId("eva-world")).toHaveAttribute("data-texture", "ready");
  await page.waitForTimeout(1500);
  const canvas = page.getByTestId("eva-canvas"), f0 = Number(await canvas.getAttribute("data-frames")), t0 = Date.now();
  await page.waitForTimeout(4000);
  const fps = (Number(await canvas.getAttribute("data-frames")) - f0) / ((Date.now() - t0) / 1000);
  console.log(`EVA_FPS cinematic view, M0-A ${fps.toFixed(1)} fps at 1440x900`);
  expect(fps).toBeGreaterThan(24);
  await page.getByTestId("eva-play").click();
  await page.getByTestId("eva-ve-1").click(); // true vertical scale, so the ground is judged as it is
  for (const [f, tag] of [[60, "early"], [480, "mid"], [1000, "destination"]] as const) {
    await page.getByTestId("eva-scrub").fill(String(f));
    await page.getByTestId("view-scientific").click();
    await shot(page, `1-eva-${tag}-before-scientific`);
    await page.getByTestId("view-cinematic").click();
    await shot(page, `1-eva-${tag}-after-cinematic`);
  }
  await page.getByTestId("eva-ve-3").click();
  await page.getByTestId("eva-scrub").fill("480");
  await shot(page, "2-eva-mid-cinematic-x3");

  await nav(page, "Mission control");
  await page.getByTestId("mc-open-relief").click();
  await expect(page.locator('[data-testid="relief-canvas"][data-texture="ready"]')).toBeAttached();
  await page.getByTestId("relief-marker-outcrop:skinner_ridge").click();
  await shot(page, "3-relief-1440-card");
  await page.locator(".relief .terrain-hud").evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await shot(page, "3-relief-1440-catalogue-scrolled");
  await page.getByTestId("relief-ve-3").click();
  await shot(page, "3-relief-1440-x3-focus-kept");
  await page.getByTestId("relief-ve-1").click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await shot(page, "4-relief-1024-card");
  await nav(page, "EVA HUD");
  await shot(page, "4-eva-1024-cinematic");
});
