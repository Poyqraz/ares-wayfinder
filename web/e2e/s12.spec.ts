// S12: clicking a marker inside the Regional Relief canvas, keeping the selection and focus across x1/x3, the relief
// sidebar, and the Mars Cinematic / Scientific rendering styles in 3D Terrain and the EVA HUD.
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name, exact: true }).click();
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/s12-${name}.png` });

test("regional relief: canvas clicks select markers, x1/x3 keeps selection and focus, the card stays readable", async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("targets-M0").getByRole("button")).toHaveCount(10);
  await page.getByTestId("mc-open-relief").click();
  await expect(page.locator('[data-testid="relief-canvas"][data-texture="ready"]')).toBeAttached();
  const canvas = page.getByTestId("relief-canvas"), card = page.getByTestId("relief-card");
  const data = (key: string) => canvas.getAttribute(`data-${key}`);
  await expect.poll(() => data("markers")).toBe("25");

  /** Click the marker's head in the 3D canvas itself, at the screen position the scene reports for it. */
  const clickMarker = async (id: string) => {
    await expect.poll(async () => ((await data("pick")) ?? "").includes(`${id}=`)).toBe(true);
    const [x, y] = ((await data("pick")) ?? "").split(";").find((e) => e.startsWith(`${id}=`))!.split("=")[1].split(",").map(Number);
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + x, box.y + y);
  };
  for (const [id, text] of [["site:landing_zone", "Hypothetical ARES-1 site"], ["mission:C", "Route planning at C is disabled"], ["feature:F02", "literature only, not measured"]] as const) {
    await page.getByTestId("relief-reset").click();
    await expect(page.getByTestId("relief-hint")).toBeVisible();
    await clickMarker(id);
    await expect(card).toHaveAttribute("data-marker", id); // the card of the objective that was clicked
    await expect(card).toContainText(text);
    await expect.poll(() => data("selected")).toBe(id);
    await expect.poll(async () => (await data("focus")) === (await data("selected-at"))).toBe(true); // the camera looks at it
  }
  await shot(page, "01-relief-canvas-click");

  // exaggeration: the selected marker, its card and the camera focus survive x1 -> x3 -> x1
  await page.getByTestId("relief-marker-mission:M0").click();
  for (const ve of ["3", "1"]) {
    await page.getByTestId(`relief-ve-${ve}`).click();
    await expect(page.getByTestId("relief-ve-readout")).toHaveText(`VERTICAL EXAGGERATION ×${ve}`);
    await expect(card).toHaveAttribute("data-marker", "mission:M0");
    await expect(page.getByTestId("relief-marker-mission:M0")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => data("selected")).toBe("mission:M0");
    await expect.poll(async () => (await data("focus")) === (await data("selected-at"))).toBe(true);
    await expect.poll(() => data("selected-label")).toBe("shown");
    if (ve === "3") { await page.waitForTimeout(400); await shot(page, "02-relief-x3-focus-kept"); }
  }

  // sidebar: grouped catalogue, nothing hidden, and the card stays in view while the catalogue scrolls
  await expect(page.locator("details.relief-group")).toHaveCount(7);
  await expect(page.locator("details.relief-group[open]")).toHaveCount(7);
  await expect(page.getByTestId("relief-markers")).toContainText("Depot samples: rover position at each drop, never the tube");
  await expect(page.getByTestId("relief-markers").getByRole("button")).toHaveCount(31); // 28 markers and 3 grid outlines (the wider M0-A-B grid since S15)
  await page.locator(".relief .terrain-hud").evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(card).toBeInViewport();
  await page.getByTestId("relief-marker-m0a_analysis").click(); // the last control of the catalogue is reachable
  await expect(card).toHaveAttribute("data-marker", "m0a_analysis");
  await expect(card).toBeInViewport();
  await page.waitForTimeout(300);
  await shot(page, "03-relief-sidebar-scrolled");

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByTestId("relief-marker-drop:M2020-00337-08").scrollIntoViewIfNeeded();
  await page.getByTestId("relief-marker-drop:M2020-00337-08").click();
  await expect(card).toHaveAttribute("data-marker", "drop:M2020-00337-08");
  await expect(card).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.waitForTimeout(400);
  await shot(page, "04-relief-1024");
  expect(errors).toEqual([]);
});

test("Mars Cinematic View and Scientific View: a rendering choice in 3D Terrain and EVA that changes no reading", async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByTestId("mission-tab-A").click();
  await page.getByTestId("mission-plan").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");
  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  // this browser renders in software, so the app starts in Scientific View; the cinematic view is one click away
  await expect(page.getByTestId("view-scientific")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("view-cinematic").click();
  await expect(page.getByTestId("view-cinematic")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("view-style-note")).toContainText("visual treatment");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await page.waitForTimeout(500);
  await shot(page, "05-3d-cinematic");
  await page.getByTestId("view-scientific").click();
  await expect(page.getByTestId("view-style-note")).toContainText("the terrain image as stored");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await page.waitForTimeout(500);
  await shot(page, "06-3d-scientific");

  // EVA shares the choice; switching it changes the picture and nothing else
  await page.getByTestId("start-eva").click();
  const world = page.getByTestId("eva-world"), canvas = page.getByTestId("eva-canvas");
  await expect(world).toHaveAttribute("data-texture", "ready");
  await expect(world).toHaveAttribute("data-style", "scientific");
  await page.getByTestId("eva-play").click(); // pause
  await page.getByTestId("eva-scrub").fill("300");
  await expect.poll(async () => Math.abs(Number(await canvas.getAttribute("data-s")) - 416.426 * 0.3)).toBeLessThan(0.75);
  const plain = { text: await page.locator(".hud-left").innerText(), eye: await canvas.getAttribute("data-eye") };
  await page.waitForTimeout(500);
  await shot(page, "07-eva-scientific");
  await page.getByTestId("view-cinematic").click();
  await expect(world).toHaveAttribute("data-style", "cinematic");
  await expect(world).toHaveAttribute("data-texture", "ready");
  await expect.poll(() => canvas.getAttribute("data-eye")).toBe(plain.eye); // same place, same camera
  expect(await page.locator(".hud-left").innerText()).toBe(plain.text); // same walked, remaining, elevation, slope, climb
  expect(Number(await canvas.getAttribute("data-clearance"))).toBeGreaterThanOrEqual(1.69);
  await expect(page.getByTestId("eva-hud")).toContainText("a visual treatment, not measurements");
  await expect(page.getByTestId("eva-sim-label")).toContainText("Simulated preview");
  await page.waitForTimeout(500);
  await shot(page, "08-eva-cinematic");
  await page.getByTestId("eva-to-planning").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("664.390 flat-equivalent m");
  expect(errors).toEqual([]);
});
