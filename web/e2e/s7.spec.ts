import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name, exact: true }).click();
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/s7-${name}.png` });

test("ARES-1 walkthrough: base and landing zone, base routes, route markers, EVA preview, every scene", async ({ page }) => {
  const external: string[] = [];
  const errors: string[] = [];
  await page.route(/https?:\/\/(?!127\.0\.0\.1)/, (r) => { external.push(r.request().url()); return r.abort(); });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("regional-sites")).toBeAttached();
  await shot(page, "02-mission-control");

  // Orbital entry
  await nav(page, "Orbital");
  await expect(page.getByTestId("orbital-svg")).toBeVisible();
  await expect(page.getByTestId("orbital-scene")).toContainText("hypothetical crewed");
  await shot(page, "01-orbital");
  await page.getByTestId("enter-mission-control").click();

  // base and landing zone: distinct sites, stated limits, compared candidates
  await page.getByTestId("open-site-base").click();
  const insp = page.getByTestId("inspector");
  await expect(insp).toHaveAttribute("data-kind", "site");
  await expect(insp).toContainText("Not evaluated or approved by NASA");
  await expect(insp).toContainText("straight-line distances");
  await shot(page, "03-base-card");
  await page.getByTestId("open-site-landing_zone").click();
  await expect(insp).toContainText("from Perseverance's 2021 landing point");
  await page.getByTestId("site-candidates").locator("summary").click();
  await expect(page.getByTestId("site-candidates")).toContainText("LZ-5");
  await shot(page, "04-landing-zone-card");

  // a real route from the base, computed on the M0-A grid (not the rover-to-rover reference route)
  await page.getByTestId("open-site-base").click();
  await page.getByTestId("plan-base-A").click();
  await expect(page.getByTestId("region-m0a")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("len-distance")).not.toHaveText("416.426 m");
  await expect(page.getByTestId("len-distance")).toHaveText(/^\d+\.\d{3} m$/);
  await expect(page.getByTestId("relation")).toHaveText(/LOWER|EQUAL/);
  // route-information markers open and close without moving the map or the route
  await expect(page.getByTestId("route-marker-start")).toBeAttached();
  const before = await page.getByTestId("len-distance").textContent();
  await page.getByTestId("route-marker-steepest").dispatchEvent("pointerdown", { button: 0, pointerId: 1 });
  await page.getByTestId("route-marker-steepest").dispatchEvent("pointerup", { button: 0, pointerId: 1 });
  await expect(page.getByTestId("route-marker-card")).toContainText("Steepest step");
  await expect(page.getByTestId("route-marker-card")).toContainText("Not modelled: rocks below DEM resolution, radiation");
  await shot(page, "05-planning-base-route-marker");
  await page.getByTestId("route-marker-next").click();
  await expect(page.getByTestId("route-marker-card")).not.toContainText("Steepest step");
  await page.getByTestId("route-marker-close").click();
  await expect(page.getByTestId("route-marker-card")).toHaveCount(0);
  expect(await page.getByTestId("len-distance").textContent()).toBe(before);

  // EVA preview follows the same route; simulated values are labelled
  await nav(page, "EVA HUD");
  await expect(page.getByTestId("eva-sim-label")).toContainText("Simulated preview");
  await page.getByTestId("eva-scrub").fill("500");
  await expect(page.getByTestId("eva-done")).not.toHaveText("0 m");
  await expect(page.getByTestId("eva-minimap")).toBeVisible();
  await expect(page.getByTestId("eva-suit")).toContainText("Simulated demo values · not sensor readings");
  await page.getByTestId("eva-play").click();
  await expect(page.getByTestId("eva-play")).toHaveText("Pause");
  await page.getByTestId("eva-play").click();
  await expect(page.getByTestId("eva-world")).toHaveAttribute("data-texture", "ready"); // first-person view on the DEM mesh
  await page.waitForTimeout(600);
  await shot(page, "07-eva-hud");

  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await page.getByTestId("fit-terrain").click();
  await page.waitForTimeout(700);
  await shot(page, "06-3d-terrain");
  await page.getByTestId("open-relief").click();
  await expect(page.locator('[data-testid="relief-canvas"][data-texture="ready"]')).toBeAttached();
  await page.waitForTimeout(600);
  await shot(page, "08-regional-relief");

  await nav(page, "Provenance");
  await expect(page.getByTestId("dataset-table")).toContainText("da61f17b64b0");
  await shot(page, "09-provenance");

  // the reference route is still there: default M0-A endpoints give the regression numbers
  await nav(page, "Planning");
  await page.keyboard.press("r");
  await expect(page.getByTestId("len-distance")).toHaveText("416.426 m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("664.390 flat-equivalent m");
  await page.getByTestId("region-roi_a").click();
  await expect(page.getByTestId("len-distance")).toHaveText("969.161 m");

  await nav(page, "Mission control");
  await page.getByTestId("open-atlas").click();
  await expect(page.getByTestId("atlas-root")).toBeVisible();
  await expect(page.getByTestId("m0-row")).toHaveCount(10); // the catalog is hash-checked on open; wait for it before the screenshot
  await shot(page, "10-science-atlas");
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
