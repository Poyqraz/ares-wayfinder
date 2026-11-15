import { expect, test, type Page } from "@playwright/test";
import { expectMapBadges, expectSelectedCard, loadedPois } from "./poiExpect.ts";

const BANNED = [/\bsafe\b/i, /\bsafest\b/i, /EVA-certified/i, /\bETA\b/, /\bminutes\b/i, /\boxygen\b/i, /energy saved/i, /obstacle-free/i, /NASA-approved/i];

async function clickCell(page: Page, row: number, col: number) {
  const index = await (await page.request.get("/data/index.json")).json();
  const meta = await (await page.request.get(`/${index.roi_a.path}terrain.json`)).json();
  const E = meta.x0 + (col + 0.5) * meta.dx_proj;
  const N = meta.y0 - (row + 0.5) * meta.dy_proj;
  const point = await page.getByTestId("map").evaluate((el, arg) => {
    const svg = el as SVGSVGElement;
    const yTop = Number(svg.dataset.ytop);
    const ctm = svg.getScreenCTM();
    if (!ctm) throw new Error("missing screen CTM");
    const mapped = new DOMPoint(arg.E, yTop - arg.N).matrixTransform(ctm);
    return { x: mapped.x, y: mapped.y };
  }, { E, N });
  await page.mouse.click(point.x, point.y);
}

test("loads the CTX map and replans from a second start cell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("integrity-error")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name: "Planning", exact: true }).click();
  await expect(page.getByTestId("ortho-image")).toBeAttached();
  await expect(page.getByTestId("len-distance")).toHaveText("969.161 m");
  await expect(page.getByTestId("len-terrain")).toHaveText("969.161 m");
  await expect(page.getByTestId("cost-distance")).toHaveText("1093.229 flat-equivalent m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("1058.299 flat-equivalent m");
  await expect(page.getByTestId("relation")).toHaveText("LOWER");
  await expect(page.getByTestId("length-relation")).toHaveText("equal length");
  await expect(page.getByTestId("why")).toContainText("Both routes are the same physical length. The terrain-aware route has the lowest model cost among them.");
  await expect(page.getByTestId("why")).toContainText("not validated for suited Mars EVA");
  await expect(page.getByTestId("start-cell")).toHaveText("63, 24");
  await expect(page.getByTestId("goal-cell")).toHaveText("22, 42");
  const pois = await loadedPois(page);
  await expectMapBadges(page, pois);
  const rochette = pois.find((poi) => poi.id === "rochette");
  if (!rochette) throw new Error("rochette is missing from the loaded POIs");
  await expectSelectedCard(page, rochette);
  const landing = pois.find((poi) => poi.id === "landing");
  if (!landing) throw new Error("landing is missing from the loaded POIs");
  await page.locator(".poi-list").getByRole("button", { name: landing.name }).click();
  await expectSelectedCard(page, landing);
  await expect(page.getByTestId("s4-line")).toHaveText("CTX DEM/image registration UNRESOLVED (S-4)");
  await page.getByTestId("poi-card").screenshot({ path: "test-results/poi-card-legacy.png" });
  await expect(page.getByTestId("scale-bar")).toHaveText("500 m");
  await expect(page.getByTestId("footer-credit")).toHaveText("Data: NASA MRO CTX (USGS/PDS; Mangold et al. 2021). Historical data, simulated mission preview.");
  await page.screenshot({ path: "test-results/reference-route.png" });

  await clickCell(page, 40, 30);
  await expect(page.getByTestId("start-cell")).toHaveText("40, 30");
  await expect(page.getByTestId("len-distance")).not.toHaveText("969.161 m");
  await expect(page.getByTestId("len-terrain")).not.toHaveText("969.161 m");
  await expect(page.getByTestId("len-distance")).toHaveText(/\d+\.\d{3} m/);
  await expect(page.getByTestId("len-terrain")).toHaveText(/\d+\.\d{3} m/);
  await expect(page.getByTestId("plan-epoch")).toHaveText("2");
  await expect(page.getByTestId("outside-msg")).toHaveText("");

  await page.getByTestId("layer-hillshade").click();
  await expect(page.getByTestId("layer-hillshade")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("hillshade-image")).toBeAttached();
  await expectMapBadges(page, await loadedPois(page));

  const body = await page.locator("body").innerText();
  for (const pattern of BANNED) expect(body).not.toMatch(pattern);
  await page.screenshot({ path: "test-results/mission-control.png", fullPage: true });
});

test("a corrupted DEM byte blocks the map", async ({ page }) => {
  await page.route("**/dem.f32.bin", async (route) => {
    const response = await route.fetch();
    const body = Buffer.from(await response.body());
    body[0] ^= 0xff;
    await route.fulfill({ status: 200, contentType: "application/octet-stream", body });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "DATASET INTEGRITY" })).toBeVisible();
  await expect(page.getByTestId("integrity-error")).toContainText("dem.f32.bin");
  await expect(page.getByTestId("len-distance")).toHaveCount(0);
  await expect(page.getByTestId("map")).toHaveCount(0);
});
