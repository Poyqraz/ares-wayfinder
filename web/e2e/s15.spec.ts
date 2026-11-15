// S15: the wider M0-A-B grid. Routing to B from a target card, the grid's box and status on the maps and in Provenance,
// and failing closed when the bundle does not pass its checks.
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name, exact: true }).click();
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/s15-${name}.png` });

test("a route to the Amalik rover position from its target card; the wider grid is named with its status everywhere", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("targets-M0").getByRole("button")).toHaveCount(10);

  // from the Amalik target card straight to a route on the wider grid
  await page.getByTestId("target-chip-outcrop:amalik").click();
  await expect(page.getByTestId("target-plan")).toHaveText("Plan a route to this rover position (prototype)");
  await page.getByTestId("target-plan").click();
  await expect(page.locator("header.top")).toContainText("Terrain: M0–A–B HiRISE 2 m (5b2abdb8bb70)");
  await expect(page.getByTestId("len-terrain")).toHaveText("438.587 m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("615.136 flat-equivalent m");
  await expect(page.getByTestId("region-b")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".map-col")).toContainText("M0–A–B prototype analysis on the wider HiRISE-derived 2 m grid (the M0–A grid widened to hold Amalik)");

  // the conservative route to B, selected: its numbers and its markers
  await page.getByTestId("use-conservative").click();
  await expect(page.getByTestId("trav-max-slope")).toHaveText("9.1°");
  await expect(page.getByTestId("conservative-note")).toContainText("The same length as the shortest route");
  await expect(page.getByTestId("route-marker-start")).toBeAttached();
  await shot(page, "01-b-conservative");

  // the experimental gate and the reset work on this grid too
  await page.getByTestId("gate-20").click();
  await expect(page.getByTestId("gate-note")).toContainText("EXPERIMENTAL");
  await expect(page.getByTestId("len-conservative")).toHaveText("438.587 m");
  await page.getByTestId("gate-off").click();
  await expect(page.getByTestId("cost-terrain")).toHaveText("615.136 flat-equivalent m");

  // Mission Control map and Regional Relief: the grid is drawn and described
  await nav(page, "Mission control");
  await page.getByTestId("mission-tab-B").click();
  await expect(page.getByTestId("regional-m0ab_analysis")).toContainText("M0–A–B wider grid (HiRISE 2 m, prototype)");
  await expect(page.getByTestId("regional-m0a_analysis")).toBeAttached();
  await expect(page.getByTestId("mc-sequence")).toContainText("B Amalikroute: prototype");
  await page.getByTestId("mc-open-relief").click();
  await expect(page.locator('[data-testid="relief-canvas"][data-texture="ready"]')).toBeAttached();
  await page.getByTestId("relief-marker-m0ab_analysis").click();
  await expect(page.getByTestId("relief-card")).toContainText("approved for prototype analysis, 15 Nov 2026");
  await expect(page.getByTestId("relief-card")).toContainText("routes can be computed inside this box only");
  await expect(page.getByTestId("relief-limits")).toContainText("C (Bright Angel) has no validated detailed terrain");

  // Provenance lists both HiRISE datasets
  await nav(page, "Provenance");
  const table = page.getByTestId("dataset-table");
  await expect(table).toContainText("f8de9017164a");
  await expect(table).toContainText("5b2abdb8bb70");
  await expect(table).toContainText("Approved for prototype analysis, 15 Nov 2026");
  expect(errors).toEqual([]);
});

test("a tampered wider grid: B falls back to inspection with the reason; M0-A and its reference keep working", async ({ page }) => {
  test.setTimeout(150_000);
  await page.route("**/data/m0ab/5b2abdb8bb70/dem.f32.bin", async (route) => {
    const res = await route.fetch();
    const body = Buffer.from(await res.body());
    body[100] ^= 0xff;
    await route.fulfill({ response: res, body });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("targets-M0").getByRole("button")).toHaveCount(10);
  await page.getByTestId("mission-tab-B").click();
  await expect(page.getByTestId("b-grid-disabled")).toContainText("does not match the manifest");
  await expect(page.getByTestId("mission-plan")).toBeDisabled();
  await expect(page.getByTestId("regional-m0ab_analysis")).toHaveCount(0); // no box for a grid that is not in use
  await nav(page, "Planning");
  await expect(page.getByTestId("explore-view")).toHaveAttribute("data-explore", "B");
  await expect(page.getByTestId("explore-route-disabled")).toContainText("Wider M0–A–B grid disabled");
  await expect(page.getByTestId("route-distance")).toHaveCount(0);
  await expect(page.getByTestId("region-b")).toBeDisabled();
  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-3d-disabled")).toContainText("Wider M0–A–B grid disabled");
  await nav(page, "EVA HUD");
  await expect(page.getByTestId("eva-unavailable")).toContainText("B Amalik");
  // the frozen grid is untouched by the failure
  await nav(page, "Mission control");
  await page.getByTestId("mission-tab-A").click();
  await page.getByTestId("mission-plan").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("664.390 flat-equivalent m");
});
