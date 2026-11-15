// S9: the terrain measured under a route is shown, the experimental terrain-slope gate replans honestly (including
// "no corridor"), and reference mode restores the frozen numbers.
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name, exact: true }).click();
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/s9-${name}.png` });

test("terrain under the route, experimental gate, no-corridor result, and back to the reference", async ({ page }) => {
  const external: string[] = [], errors: string[] = [];
  await page.route(/https?:\/\/(?!127\.0\.0\.1)/, (r) => { external.push(r.request().url()); return r.abort(); });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByTestId("mission-tab-A").click();
  await page.getByTestId("mission-plan").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");

  // reference mode: measured, not constrained
  const panel = page.getByTestId("traverse-panel");
  await expect(page.getByTestId("gate-off")).toHaveAttribute("aria-pressed", "true");
  await expect(panel).toContainText("It does not limit how steep the ground is, or the slope across the path");
  await expect(page.getByTestId("trav-max-grade")).toHaveText("18.2°");
  await expect(page.getByTestId("trav-max-slope")).toHaveText("19.9°");
  await expect(page.getByTestId("trav-max-cross")).toHaveText("15.3°");
  await expect(page.getByTestId("trav-over")).toHaveText("33 / 0 / 0 m");
  await expect(page.getByTestId("trav-uncertainty")).toContainText("independent HiRISE stereo models");
  expect(Number(await page.getByTestId("route-steep").getAttribute("data-count"))).toBeGreaterThan(5);
  await expect(page.getByTestId("gate-image")).toHaveCount(0);
  await expect(page.getByTestId("route-reference")).toHaveCount(0);
  await expect(panel).toContainText("A lower model cost is not a lower risk");
  await panel.scrollIntoViewIfNeeded();
  await shot(page, "01-reference-terrain-under-route");

  // 20 degree gate: a different route, the reference kept beside it, every claim labelled experimental
  await page.getByTestId("gate-20").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("417.566 m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("664.860 flat-equivalent m");
  await expect(page.getByTestId("gate-note")).toContainText("EXPERIMENTAL");
  await expect(page.getByTestId("gate-note")).toContainText("neither is a Mars EVA safety limit");
  await expect(page.getByTestId("gate-image")).toBeAttached();
  await expect(page.getByTestId("route-reference")).toBeAttached();
  await expect(page.getByTestId("trav-max-slope")).toHaveText("19.6°");
  await expect(page.getByTestId("trav-ref-slope")).toHaveText("19.9°");
  await expect(page.getByTestId("trav-length")).toContainText("417.6 m");
  await expect(page.getByTestId("trav-uncertainty")).toContainText("lie within that margin of the gate");
  await shot(page, "02-gate-20");

  // clearance, then 15 degrees: the destination itself fails, and the app says so instead of drawing a route
  await page.getByTestId("gate-clearance").check();
  await expect(page.getByTestId("trav-no-corridor")).toContainText("Nothing was relaxed");
  await expect(page.getByTestId("len-terrain")).toHaveText("ENDPOINT_BLOCKED_BY_POLICY");
  await page.getByTestId("gate-clearance").uncheck();
  await expect(page.getByTestId("len-terrain")).toHaveText("417.566 m");
  await page.getByTestId("gate-15").click();
  await expect(page.getByTestId("trav-no-corridor")).toContainText("No supported corridor under the 15° gate");
  await expect(page.getByTestId("trav-no-corridor")).toContainText("18.1°");
  await expect(page.getByTestId("route-terrain")).toHaveCount(0);
  await expect(page.getByTestId("route-reference")).toBeAttached();
  await shot(page, "03-gate-15-no-corridor");
  await nav(page, "3D terrain");
  await expect(page.getByTestId("start-eva")).toBeDisabled();
  await nav(page, "EVA HUD");
  await expect(page.getByTestId("eva-unavailable")).toBeVisible();

  // back to the reference: the frozen numbers
  await nav(page, "Planning");
  await page.getByTestId("gate-off").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("664.390 flat-equivalent m");
  await page.getByTestId("gate-20").click();
  await page.keyboard.press("r"); // the demo reset is always the ungated reference
  await expect(page.getByTestId("gate-off")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");

  // 3D: the outline legend, and the warning that exaggeration makes slopes look steeper
  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await expect(page.getByTestId("route-slope-legend")).toContainText("red above 20°");
  await expect(page.getByTestId("ve-warning")).toHaveCount(0);
  await page.getByRole("button", { name: "×2.5", exact: true }).click();
  await expect(page.getByTestId("ve-warning")).toContainText("A real 20° slope is drawn as 42°");
  await page.getByRole("button", { name: "×1", exact: true }).click();

  // ROI-A: gentle at 20 m scale, so the gate changes nothing there
  await nav(page, "Planning");
  await page.getByTestId("region-roi_a").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("969.161 m");
  await page.getByTestId("gate-15").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("969.161 m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("1058.299 flat-equivalent m");
  await expect(page.getByTestId("trav-uncertainty")).toContainText("no independent DEM");
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
