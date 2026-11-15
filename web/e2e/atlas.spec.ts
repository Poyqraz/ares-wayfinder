import { expect, test } from "@playwright/test";

const FORBIDDEN = [/\bsafe\b/i, /\bsafest\b/i, /life detected/i, /life found/i, /biological origin confirmed/i, /confirmed biosignature/i, /\bforecast\b/i, /EVA risk/i, /tube location/i];

const ALLOWED_DENIALS = [
  "Positions are rover positions or approximate rover waypoints, never exact rock or tube locations.",
  "Historical rover-local measurement (Perseverance MEDA PS, sol 516, 2022, PDS Derived). Not a weather map, not a forecast, not an EVA risk value.",
];

test("Science Atlas is read-only and Planning keeps the ROI-A route", async ({ page }) => {
  const external: string[] = [];
  await page.route(/https?:\/\/(?!127\.0\.0\.1)/, (route) => {
    external.push(route.request().url());
    return route.abort();
  });
  await page.goto("/");
  await expect(page.getByTestId("mission-overview")).toBeVisible();
  await expect(page.getByRole("heading", { name: "M0 Three Forks sample recovery" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A Western Delta science objectives" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "B Amalik / Enchanted Lake science objectives" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "C Bright Angel science objectives" })).toBeVisible();
  await expect(page.getByTestId("len-distance")).toHaveCount(0);
  await page.screenshot({ path: "test-results/atlas-overview.png" });
  await page.getByRole("button", { name: "Open Science Atlas" }).click();
  await expect(page.getByText("Science Atlas (read-only). Historical NASA/PDS records; not a mission plan.")).toBeVisible();
  await expect(page.getByText("Positions are rover positions or approximate rover waypoints, never exact rock or tube locations.")).toBeVisible();
  await expect(page.getByText("Consistency checks confirm that related records agree; they are not independent scientific validations.")).toBeVisible();
  await expect(page.getByTestId("len-distance")).toHaveCount(0);
  await expect(page.getByTestId("m0-row")).toHaveCount(10);
  await expect(page.getByTestId("tube-pin")).toHaveCount(0);
  await expect(page.getByText("Not available").first()).toBeVisible();
  await expect(page.getByTestId("witness-row")).toContainText("12 Oct 2022");
  await expect(page.getByTestId("witness-row")).toContainText("14 Oct 2022");
  await page.getByText("M2020-00586-18 row detail").click();
  await expect(page.getByTestId("witness-note")).toHaveText("Witness tube (contamination control). Sealing: Sol 586, 19:16:40 LMST (Initial Report only; Earth date unresolved: 12 Oct 2022 per Initial Report, 14 Oct 2022 per NASA page).");
  await expect(page.getByTestId("waypoint")).toHaveCount(3);
  await page.getByTestId("atlas-m0").screenshot({ path: "test-results/atlas-m0.png" });

  await expect(page.getByRole("heading", { name: "Skinner Ridge" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Wildcat Ridge" })).toBeVisible();
  await expect(page.getByTestId("core-badge")).toHaveCount(4);
  await expect(page.getByTestId("core-badge").filter({ hasText: "In Three Forks Depot (M0)" })).toHaveCount(2);
  await expect(page.getByTestId("core-badge").filter({ hasText: "On the rover" })).toHaveCount(2);
  await expect(page.getByText("Rover position during sampling (outcrop extent unknown).")).toHaveCount(2);
  await expect(page.getByText("Sampling positions 23.6 m apart")).toBeVisible();
  await page.getByTestId("atlas-a").screenshot({ path: "test-results/atlas-a.png" });

  await expect(page.getByRole("heading", { name: "Bright Angel (region)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cheyava Falls (rock, not a waterfall or a sample)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sapphire Canyon (core; NASA Sample No. 25 = designation M2020-01215-28; on the rover; not in M0)" })).toBeVisible();
  await expect(page.getByTestId("claim")).toHaveCount(9);
  await expect(page.getByTestId("b08-badge")).toHaveText("Hypothesis (low): abiotic pathways not excluded.");
  await expect(page.getByTestId("no-life")).toHaveText("No evidence of life has been established.");
  await expect(page.getByText("Bright Angel lies in the HiRISE CR_SOUTH stereo pair (USGS: uncompensated y-parallax).")).toBeVisible();
  await expect(page.getByTestId("atlas-c")).toContainText("Formerly mission B");
  await page.getByTestId("atlas-c").screenshot({ path: "test-results/atlas-c.png" });

  // B Amalik: both cores, with coring, sealing and depot drop as separate events
  await expect(page.getByTestId("b-row-shuyak")).toContainText("M2020-575-16");
  await expect(page.getByTestId("b-row-shuyak")).toContainText("on the rover");
  for (const text of ["M2020-00579-17", "579", "619", "655", "Three Forks depot (mission M0)"]) await expect(page.getByTestId("b-row-mageik")).toContainText(text);
  await expect(page.getByTestId("atlas-b").getByTestId("b-distances")).toContainText("not walking distances");
  await expect(page.getByTestId("atlas-b").getByTestId("b-uncertainty")).toContainText("not a surveyed astronaut waypoint");
  await expect(page.getByTestId("atlas-b").getByTestId("b-sources").locator("a")).toHaveCount(5);
  await expect(page.getByTestId("atlas-b").getByTestId("b-imagery").locator("a")).toHaveCount(4);
  await expect(page.getByTestId("no-life-b")).toHaveText("No evidence of life has been established.");
  await page.getByTestId("atlas-b").screenshot({ path: "test-results/atlas-b.png" });

  await expect(page.getByTestId("meda-chart")).toHaveAttribute("data-points", "7440");
  await expect(page.getByTestId("meda-chart")).toHaveAttribute("data-sessions", "24");
  await expect(page.getByTestId("meda-sessions")).toHaveText("24 measurement sessions");
  await expect(page.getByTestId("meda-axis")).toHaveText("Pressure axis: Pa. Time axis: LMST.");
  await expect(page.getByTestId("meda-status-valid")).toBeVisible();
  await expect(page.getByTestId("meda-status-flagged")).toBeVisible();
  await expect(page.getByTestId("meda-status-missing")).toBeVisible();
  await expect(page.getByTestId("meda-status-invalid")).toBeVisible();
  await expect(page.getByTestId("meda-uncertainty")).toHaveText("Not provided in source");
  await expect(page.getByTestId("meda-utc-disabled")).toBeDisabled();
  await expect(page.getByTestId("meda-uncertainty-disabled")).toBeDisabled();
  await page.getByTestId("atlas-meda").screenshot({ path: "test-results/atlas-meda.png" });

  await expect(page.getByTestId("route-disabled")).toBeDisabled();
  await expect(page.getByTestId("tube-disabled")).toBeDisabled();
  await expect(page.getByTestId("exact-disabled")).toBeDisabled();
  await expect(page.getByTestId("route-readiness")).toHaveCount(4); // M0, A, B and C: no route to an exact target
  const body = await page.getByTestId("atlas-root").innerText();
  const scanned = ALLOWED_DENIALS.reduce((text, line) => text.replaceAll(line, ""), body);
  for (const pattern of FORBIDDEN) expect(scanned).not.toMatch(pattern);
  expect(external).toEqual([]);

  await page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name: "Planning", exact: true }).click();
  await expect(page.getByTestId("len-distance")).toHaveText("969.161 m");
  await expect(page.getByTestId("cost-distance")).toHaveText("1093.229 flat-equivalent m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("1058.299 flat-equivalent m");
  await expect(page.getByTestId("relation")).toHaveText("LOWER");
  await page.screenshot({ path: "test-results/atlas-planning.png" });

  await page.getByRole("button", { name: "3D terrain" }).click();
  await page.getByTestId("display-hirise-4m").click();
  await expect(page.getByTestId("visualization-dem")).toHaveText("Visualization DEM: HiRISE 4 m (display only)");
  await page.screenshot({ path: "test-results/atlas-hirise.png" });

  await page.setViewportSize({ width: 768, height: 900 });
  await page.getByTestId("return-2d").click();
  await page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name: "Mission control", exact: true }).click();
  await expect(page.getByTestId("mission-overview")).toBeVisible();
  await page.getByRole("button", { name: "Open Science Atlas" }).click();
  const fits = await page.getByTestId("atlas-root").evaluate((el) => el.scrollWidth <= el.clientWidth + 2);
  expect(fits).toBe(true);
});
