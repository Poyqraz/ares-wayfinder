import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const regional = JSON.parse(readFileSync(new URL("../public/data/regional/d3d62fc34c56/regional.json", import.meta.url), "utf8"));
const ends = JSON.parse(readFileSync(new URL("../public/data/m0a/f8de9017164a/endpoints.json", import.meta.url), "utf8")).endpoints;
const A = regional.assets["science_6m.jpg"];
const F = regional.features_px_in_science_6m;

test("regional map, M0-A planning, destination pipeline, 2D/3D and legacy ROI-A", async ({ page }) => {
  const external: string[] = [];
  await page.route(/https?:\/\/(?!127\.0\.0\.1)/, (route) => {
    external.push(route.request().url());
    return route.abort();
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.reload(); // reload works from local assets only (preview config also disables DNS)

  // 1. Orbital regional map with M0, A, B and the legacy ROI-A box
  await expect(page.getByTestId("regional-svg")).toBeVisible();
  for (const id of ["regional-waypoint-M0", "regional-waypoint-A", "regional-waypoint-B", "regional-waypoint-C", "regional-roi_a", "regional-m0a_analysis"]) {
    await expect(page.getByTestId(id)).toBeAttached();
  }
  await expect(page.getByTestId("regional-map")).toContainText("JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0");
  await page.getByTestId("mc-tab-zoom").click();
  await expect(page.getByTestId("magnifier-help")).toBeVisible();
  await expect(page.getByTestId("regional-scale")).toHaveAttribute("data-metres", /\d+/);
  for (const f of ["F01", "F02", "F03"]) await expect(page.getByTestId(`regional-feature-${f}`)).toBeAttached();
  await page.getByTestId("mc-tab-features").click();
  await expect(page.getByTestId("feature-F01-status")).toHaveText("AUTOMATED_MEASUREMENT_PENDING_REVIEW");
  await expect(page.getByTestId("feature-F02-status")).toHaveText("PENDING");
  await expect(page.getByTestId("feature-F03-status")).toHaveText("PENDING");
  await expect(page.getByTestId("feature-F02-crater_diameter_m")).toContainText("Not measured");
  await expect(page.getByTestId("feature-F01-delta_z_m")).toContainText("stereo DEMs");
  await expect(page.getByTestId("feature-F01-panel")).toBeVisible();
  await page.getByTestId("terrain-features").screenshot({ path: "test-results/s5-08-terrain-features.png" });
  await page.getByTestId("regional-map").screenshot({ path: "test-results/s4-01-regional-map.png" });

  // 2. Magnifier rectangle around the M0-A footprint (pixel fractions from the verified sidecar)
  await page.getByTestId("mc-tab-zoom").click();
  const frame = page.getByTestId("magnifier-frame");
  const box = (await frame.boundingBox())!;
  const fx = (px: number) => (px / A.nx) * box.width, fy = (py: number) => (py / A.ny) * box.height;
  const nw = F.m0a_analysis.nw, se = F.m0a_analysis.se;
  await frame.dragTo(frame, { sourcePosition: { x: fx(nw.x_px) - 12, y: fy(nw.y_px) - 12 }, targetPosition: { x: fx(se.x_px) + 12, y: fy(se.y_px) + 12 } });
  await expect(page.getByTestId("regional-detail")).toBeVisible();
  await expect(page.getByTestId("open-m0a")).toBeEnabled();
  await page.locator(".mc-tabpanel").screenshot({ path: "test-results/s4-02-magnifier-m0a.png" });

  // 3. Mission Control
  await page.screenshot({ path: "test-results/s4-03-mission-control.png", fullPage: true });

  // 5. Destination: typed (bad, then the Skinner Ridge sampling rover position) and clicked, one pipeline
  await page.getByTestId("mc-tab-destination").click();
  await page.getByTestId("lat-input").fill("north");
  await page.getByTestId("lon-input").fill("77.4");
  await page.getByRole("button", { name: "Select destination" }).click();
  await expect(page.getByTestId("coordinate-error")).toContainText("decimal degrees");
  await page.getByTestId("lat-input").fill(String(ends.goal_A.lat));
  await page.getByTestId("lon-input").fill(String(ends.goal_A.lon));
  await page.getByRole("button", { name: "Select destination" }).click();
  const card = page.getByTestId("destination-card");
  await expect(card).toContainText("HiRISE DTM → 2 m analysis grid, dataset f8de9017164a; vertical datum UNVERIFIED");
  await expect(card).toContainText("Routing available in M0–A analysis grid (prototype) as a candidate route corridor.");
  await expect(card).toContainText("A Skinner Ridge / Wildcat Ridge catalog waypoint");
  await expect(page.getByTestId("route-to-destination")).toBeEnabled();
  await expect(page.getByTestId("card-details")).not.toHaveAttribute("open", "");
  await expect(card).toContainText("valid DEM cell (routable)");
  await expect(card).not.toContainText("validity 0");
  await card.screenshot({ path: "test-results/s4-05-destination-card.png" });
  // B (outside every analysis grid): inspect only
  await page.getByTestId("lat-input").fill(String(F["waypoint:B"].lat));
  await page.getByTestId("lon-input").fill(String(F["waypoint:B"].lon));
  await page.getByRole("button", { name: "Select destination" }).click();
  await expect(card).toContainText("Outside every analysis grid");
  await expect(page.getByTestId("route-to-destination")).toBeDisabled();

  // 4. M0-A planning from the detail view, with coloured layers
  await page.getByTestId("mc-tab-zoom").click();
  await page.getByTestId("open-m0a").click();
  await expect(page.getByTestId("region-m0a")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("m0a-line")).toBeVisible();
  await expect(page.getByTestId("footer-credit")).toContainText("HiRISE DTM and orthomosaic");
  await expect(page.getByTestId("len-distance")).toHaveText("416.426 m");
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("664.390 flat-equivalent m");
  await expect(page.getByTestId("relation")).toHaveText("LOWER");
  await expect(page.getByTestId("region-b")).toBeEnabled(); // B inspection (no routing)
  await expect(page.getByTestId("region-c")).toBeEnabled(); // C exploration (no routing)
  for (const layer of ["elevation", "slope", "steep"]) {
    await page.getByTestId(`layer-${layer}`).click();
    await expect(page.getByTestId(`legend-${layer}`)).toContainText("f8de9017164a");
  }
  await expect(page.getByTestId("elevation-image")).toBeAttached();
  await expect(page.getByTestId("steep-image")).toBeAttached();
  await expect(page.getByTestId("legend-steep")).toContainText("NOT a certified hazard");
  await page.screenshot({ path: "test-results/s4-04-m0a-planning-layers.png", fullPage: true });

  // CR-005: the rendered map keeps ground proportions, and geometry drawn from the grid meets the marker drawn from geo
  const tm = JSON.parse(readFileSync(new URL("../public/data/m0a/f8de9017164a/terrain.json", import.meta.url), "utf8"));
  const img = (await page.getByTestId("ortho-image").boundingBox())!;
  const groundAspect = (tm.nx * tm.dx_ground_m) / (tm.ny * tm.dy_ground_m);
  expect(Math.abs(img.width / img.height - groundAspect) / groundAspect).toBeLessThan(0.01);
  const gap = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="map"]') as SVGSVGElement;
    const line = document.querySelector('[data-testid="route-distance"] polyline') as SVGPolylineElement;
    const p = line.points.getItem(0);
    const s = new DOMPoint(p.x, p.y).matrixTransform(svg.getScreenCTM()!);
    const marker = document.querySelector(".poi") as HTMLElement;
    const r = svg.getBoundingClientRect();
    return Math.hypot(s.x - (r.left + parseFloat(marker.style.left)), s.y - (r.top + parseFloat(marker.style.top)));
  });
  expect(gap).toBeLessThan(4); // route start cell centre vs M0 rover-position marker (snap 1.07 m)
  await expect(page.locator(".poi").first()).not.toContainText("evidence record invalid");

  // 6. M0-A 3D on the same grid
  await page.getByRole("button", { name: "3D terrain" }).click();
  await expect(page.getByTestId("terrain-canvas")).toBeVisible();
  await expect(page.getByTestId("analysis-dem")).toHaveText("Analysis DEM: HiRISE 2 m (f8de9017164a)");
  await expect(page.getByTestId("display-hirise-4m")).toHaveCount(0);
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await page.waitForTimeout(800);
  await page.screenshot({ path: "test-results/s4-06-m0a-3d.png" });

  // 7. Legacy ROI-A unchanged
  await page.getByTestId("return-2d").click();
  await page.getByTestId("region-roi_a").click();
  await expect(page.getByTestId("len-distance")).toHaveText("969.161 m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("1058.299 flat-equivalent m");
  await expect(page.getByTestId("s4-line")).toHaveText("CTX DEM/image registration UNRESOLVED (S-4)");
  await page.screenshot({ path: "test-results/s4-07-roi-a-legacy.png", fullPage: true });

  // destination click -> route: the same pipeline routes into M0-A with the typed goal
  await page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name: "Mission control", exact: true }).click();
  await page.getByTestId("mc-tab-destination").click();
  await page.getByTestId("lat-input").fill(String(ends.goal_A.lat));
  await page.getByTestId("lon-input").fill(String(ends.goal_A.lon));
  await page.getByRole("button", { name: "Select destination" }).click();
  await page.getByTestId("route-to-destination").click();
  await expect(page.getByTestId("region-m0a")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("len-distance")).toHaveText("416.426 m");

  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("a tampered M0-A bundle keeps M0-A disabled and ROI-A working", async ({ page }) => {
  await page.route("**/data/m0a/f8de9017164a/dem.f32.bin", async (route) => {
    const res = await route.fetch();
    const body = Buffer.from(await res.body());
    body[100] ^= 0xff;
    await route.fulfill({ response: res, body });
  });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name: "Planning", exact: true }).click();
  await expect(page.getByTestId("len-distance")).toHaveText("969.161 m");
  await expect(page.getByTestId("region-m0a")).toBeDisabled();
  await expect(page.getByTestId("m0a-disabled")).toContainText("does not match the manifest");
});
