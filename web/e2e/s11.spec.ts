// S11: Regional Relief 3D as a mission map (markers, cards, focus, label density), and the cleaner 3D route line with
// the measured-slope colouring kept as an optional inspection overlay.
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name, exact: true }).click();
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/s11-${name}.png` });

test("regional relief 3D shows every mission location as a selectable marker, with its evidence and limits", async ({ page }) => {
  test.setTimeout(150_000);
  const external: string[] = [], errors: string[] = [];
  await page.route(/https?:\/\/(?!127\.0\.0\.1)/, (r) => { external.push(r.request().url()); return r.abort(); });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("targets-M0").getByRole("button")).toHaveCount(10); // the science catalog is in
  await page.getByTestId("mc-open-relief").click();
  const canvas = page.locator('[data-testid="relief-canvas"][data-texture="ready"]');
  await expect(canvas).toBeAttached();
  const data = (key: string) => page.getByTestId("relief-canvas").getAttribute(`data-${key}`);
  await expect.poll(() => data("markers")).toBe("25"); // 4 sites, 4 missions, 10 drops, 3 outcrops, 1 rock (cores share their outcrop or rock), 3 features
  await expect(page.getByTestId("relief-label")).toContainText("no route is validated between these regions");
  await expect(page.getByTestId("relief-label")).toContainText("No routing, slope, hazard or traversability information");
  // whole region: sample and outcrop markers are folded away and only a few labels are up, so the terrain stays visible
  expect(Number(await data("shown"))).toBe(11); // 4 sites, 4 missions, 3 features
  const farLabels = Number(await data("labels"));
  expect(farLabels).toBeGreaterThanOrEqual(4);
  expect(farLabels).toBeLessThanOrEqual(8);
  await page.waitForTimeout(500);
  await shot(page, "01-relief-whole-region");

  const card = page.getByTestId("relief-card");
  // hypothetical infrastructure
  await page.getByTestId("relief-marker-site:base").click();
  await expect(card).toHaveAttribute("data-marker", "site:base");
  await expect(card).toContainText("Hypothetical ARES-1 site");
  await expect(card).toContainText("Not evaluated or approved by NASA");
  await expect.poll(() => data("selected")).toBe("site:base");
  await expect.poll(async () => Number(await data("shown"))).toBe(24); // close in: the ten depot drops and the three outcrops (Amalik included) are drawn (Cheyava Falls, 6 km away, is not)
  await page.waitForTimeout(500);
  await shot(page, "02-relief-base-cluster");

  // M0: a single depot sample, at the rover's drop position
  await page.getByTestId("relief-marker-drop:M2020-00337-08").click();
  await expect(card.getByRole("heading", { name: "Malay" })).toBeVisible();
  await expect(page.getByTestId("relief-evidence")).toContainText("rover position during the tube drop");
  await expect(page.getByTestId("relief-card-limits")).toContainText("Tube-centre coordinates are not published");
  await expect.poll(() => data("selected-label")).toBe("shown"); // sample names appear only this close, and the selected one is never hidden by a neighbour
  await page.waitForTimeout(500);
  await shot(page, "03-relief-m0-samples");

  // A, B, features, grids
  await page.getByTestId("relief-marker-outcrop:wildcat_ridge").click();
  await expect(card).toContainText("rover position during sampling");
  await page.getByTestId("relief-marker-mission:C").click();
  await expect(card).toContainText("Route planning at C is disabled");
  await page.getByTestId("relief-marker-rock:cheyava_falls").click();
  await expect(card).toContainText("inspection only");
  await page.getByTestId("relief-marker-sample:M2020-01215-28").click();
  await expect(card.getByRole("heading", { name: "Sapphire Canyon" })).toBeVisible();
  await expect(card).toContainText("Shares the Cheyava Falls marker");
  await page.waitForTimeout(500);
  await shot(page, "04-relief-bright-angel");
  await page.getByTestId("relief-marker-feature:F01").click();
  await expect(card).toContainText("measured, geology review pending");
  await page.getByTestId("relief-marker-feature:F02").click();
  await expect(card).toContainText("literature only, not measured");
  await expect(card).toContainText("not a routing input");
  await page.getByTestId("relief-marker-m0a_analysis").click();
  await expect(card).toContainText("routes can be computed inside this box only");
  await expect(card).toContainText("no route exists there");

  // exaggeration keeps every marker; the whole-region view folds the detail away again
  await page.getByTestId("relief-ve-3").click();
  await expect.poll(() => data("markers")).toBe("25");
  await page.getByTestId("relief-reset").click();
  await expect.poll(async () => Number(await data("shown"))).toBe(11);
  await expect(page.getByTestId("relief-hint")).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, "05-relief-x3-whole-region");
  await page.getByTestId("relief-ve-1").click();

  // a marker leads back to the same place in Mission Control
  await page.getByTestId("relief-marker-outcrop:skinner_ridge").click();
  await page.getByTestId("relief-open-mc").click();
  await expect(page.getByTestId("inspector")).toHaveAttribute("data-kind", "target");
  await expect(page.getByTestId("inspector").getByRole("heading", { name: "Skinner Ridge" })).toBeVisible();
  await expect(page.getByTestId("target-outcrop:skinner_ridge")).toHaveClass(/\bon\b/);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("3D route: clean continuous lines by default; measured slope colouring is an optional overlay", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByTestId("mission-tab-A").click();
  await page.getByTestId("mission-plan").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");
  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  const canvas = page.getByTestId("terrain-canvas");
  await expect(canvas).toHaveAttribute("data-route-lines", "3"); // distance, terrain-aware and, since S13, conservative
  await expect(canvas).toHaveAttribute("data-slope-overlay", "off");
  await expect(page.getByTestId("slope-overlay-toggle")).not.toBeChecked();
  await expect(page.getByTestId("route-slope-legend")).toContainText("Overlay off");
  await expect(page.getByTestId("route-slope-legend")).toContainText("red above 20°"); // the S9 meaning is still stated
  await page.waitForTimeout(600);
  await shot(page, "06-3d-route-default");
  await page.getByTestId("slope-overlay-toggle").check();
  await expect(canvas).toHaveAttribute("data-slope-overlay", "on");
  await expect(page.getByTestId("route-slope-legend")).toContainText("Overlay on");
  await page.waitForTimeout(600);
  await shot(page, "07-3d-route-slope-overlay");
  await page.getByTestId("slope-overlay-toggle").uncheck();
  for (const ve of ["2.5", "10"]) {
    await page.getByRole("button", { name: `×${ve}`, exact: true }).click();
    await expect(page.getByTestId("ve-warning")).toBeVisible();
    await expect(canvas).toHaveAttribute("data-route-lines", "3"); // distance, terrain-aware and, since S13, conservative
  }
  await page.getByRole("button", { name: "×1", exact: true }).click();
  // nothing about the route itself changed
  await nav(page, "Planning");
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("664.390 flat-equivalent m");
  await expect(page.getByTestId("trav-max-slope")).toHaveText("19.9°");
});
