// S10: science objectives on the mission map, one marker system across Planning, 3D and EVA, and the x3 EVA display.
import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name, exact: true }).click();
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/s10-${name}.png` });
const canvas = (page: Page, key: string) => page.getByTestId("eva-canvas").getAttribute(`data-${key}`);
const guard = async (page: Page) => {
  const external: string[] = [], errors: string[] = [];
  await page.route(/https?:\/\/(?!127\.0\.0\.1)/, (r) => { external.push(r.request().url()); return r.abort(); });
  page.on("pageerror", (e) => errors.push(e.message));
  return { external, errors };
};

test("Mission Control is a science-objective map: M0 samples, A outcrops, B rock and core, features, legend", async ({ page }) => {
  const seen = await guard(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("regional-sites")).toBeAttached();
  await expect(page.getByTestId("map-legend")).toContainText("rover position at the drop (PDS)");
  await expect(page.getByTestId("map-legend")).toContainText("not a NASA location");
  await expect(page.getByTestId("mc-sequence")).toContainText("inspect only");
  await expect(page.locator(".site-link")).toHaveCount(0); // no line joins areas without validated terrain between them
  await expect(page.getByTestId("regional-targets")).toHaveCount(0); // regional zoom: objectives are in the cards, not crowding the map
  await expect(page.getByTestId("targets-M0").getByRole("button")).toHaveCount(10);
  await shot(page, "01-mission-control-overview");

  // M0: one of the ten depot samples
  const insp = page.getByTestId("inspector");
  await page.getByTestId("target-chip-drop:M2020-00337-08").click();
  await expect(insp).toHaveAttribute("data-kind", "target");
  await expect(insp.getByRole("heading", { name: "Malay" })).toBeVisible();
  await expect(page.getByTestId("target-position")).toContainText("rover position during the tube drop");
  await expect(page.getByTestId("target-limits")).toContainText("Tube-centre coordinates are not published");
  await expect(page.getByTestId("regional-targets")).toHaveAttribute("data-count", "14"); // 10 drops, 3 outcrops (Amalik since S14), 1 rock; cores share their outcrop or rock
  await expect(page.getByTestId("target-drop:M2020-00337-08")).toHaveClass(/\bon\b/);
  await expect(page.getByTestId("mission-tab-M0")).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(400);
  await shot(page, "02-m0-depot-samples");
  await page.getByTestId("target-chip-drop:M2020-00586-18").click();
  await expect(insp).toContainText("witness");
  await expect(insp).toContainText("control");

  // A: two separate outcrops; a click on the map marker itself opens the card; planning goes to the recorded rover position
  await page.getByTestId("target-chip-outcrop:skinner_ridge").click();
  await expect(page.getByTestId("target-why")).toContainText("Fluvially transported clasts");
  await expect(insp).toContainText("Core Skyland");
  await page.getByTestId("target-outcrop:wildcat_ridge").click();
  await expect(insp.getByRole("heading", { name: "Wildcat Ridge" })).toBeVisible();
  await expect(insp).toContainText("23.6 m apart");
  await page.waitForTimeout(400);
  await shot(page, "03-a-western-delta");
  await page.getByTestId("target-plan").click();
  await expect(page.getByTestId("region-m0a")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("len-terrain")).toHaveText(/^\d+\.\d{3} m$/);
  await expect(page.getByTestId("route-mode")).toHaveCount(0); // the header only flags the experimental mode

  // B: rock and core are different things; life is not claimed; no routing
  await nav(page, "Mission control");
  await page.getByTestId("target-chip-rock:cheyava_falls").click();
  await expect(insp).toContainText("not a waterfall or a sample");
  await expect(insp).toContainText("No evidence of life has been established.");
  await expect(page.getByTestId("target-plan")).toBeDisabled();
  await expect(page.getByTestId("target-plan")).toHaveText("No route at C: inspect only");
  await page.waitForTimeout(400);
  await shot(page, "04-b-bright-angel");
  await page.getByTestId("target-chip-sample:M2020-01215-28").click();
  await expect(insp.getByRole("heading", { name: "Sapphire Canyon" })).toBeVisible();
  await expect(insp).toContainText("on the rover");
  await expect(page.getByTestId("target-rock:cheyava_falls")).toHaveClass(/\bon\b/); // same recorded position, one marker

  // F01-F03: measured versus literature-only
  await expect(page.getByTestId("target-chip-F01")).toContainText("measured, review pending");
  await expect(page.getByTestId("target-chip-F02")).toContainText("literature only");
  await page.getByTestId("target-chip-F02").click();
  await expect(insp).toHaveAttribute("data-kind", "feature");
  await expect(insp).toContainText("Not measured. Literature evidence only.");
  expect(seen.external).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test("one marker system in Planning, 3D and EVA; EVA terrain at x3 and x1; gate that leaves no corridor blocks the walk", async ({ page }) => {
  test.setTimeout(300_000); // long journey in software-rendered WebGL
  const seen = await guard(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByTestId("mission-tab-A").click();
  await page.getByTestId("mission-plan").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");

  // Planning: a terrain marker picked on the route
  const press = async (id: string) => { await page.getByTestId(id).dispatchEvent("pointerdown", { button: 0, pointerId: 1 }); await page.getByTestId(id).dispatchEvent("pointerup", { button: 0, pointerId: 1 }); };
  await expect(page.getByTestId("route-marker-ground")).toBeAttached();
  await press("route-marker-ground");
  const card = page.getByTestId("route-marker-card");
  await expect(card).toContainText("Steepest ground");
  await expect(card).toContainText("Uncertain: independent stereo models");
  await expect(card).toContainText("not a hazard or safety rating");
  await shot(page, "05-planning-markers");

  // 3D: the same marker is still selected; another one chosen there
  await nav(page, "3D terrain");
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await expect(page.getByTestId("marker3d-ground")).toHaveAttribute("aria-pressed", "true");
  await expect(card).toContainText("Steepest ground");
  await page.getByTestId("marker3d-climb").click();
  await expect(card).toContainText("Longest climb");
  await page.waitForTimeout(600);
  await shot(page, "06-3d-markers-panel");

  // EVA: same selection, shown as a card; x3 by default and labelled
  await page.getByTestId("start-eva").click();
  await expect(page.getByTestId("eva-world")).toHaveAttribute("data-texture", "ready");
  await page.getByTestId("eva-play").click(); // pause
  await expect(page.getByTestId("eva-marker-climb")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("eva-marker-card")).toHaveAttribute("data-marker", "climb");
  await expect(page.getByTestId("eva-marker-card")).toContainText("Longest climb");
  await expect(page.getByTestId("eva-marker-card")).toContainText("of it across the path"); // every marker reports the cross-slope at its position
  await page.getByTestId("eva-marker-climb").click();
  await expect(page.getByTestId("eva-ve-label")).toContainText("×3 vertically: visual exaggeration only");
  await expect.poll(() => canvas(page, "ve")).toBe("3");

  // approaching a marker highlights the next-waypoint tile; its details stay closed until asked for, so the visor stays clear
  let approached = false;
  for (let f = 0; f <= 1000 && !approached; f += 25) {
    await page.getByTestId("eva-scrub").fill(String(f));
    approached = (await page.getByTestId("eva-next").getAttribute("data-near")) === "true";
  }
  expect(approached, "the next-waypoint tile is highlighted as the walker nears the marker").toBe(true);
  await expect(page.getByTestId("eva-marker-card")).toHaveCount(0);
  await page.getByTestId("eva-next").click();
  await expect(page.getByTestId("eva-marker-card")).toBeVisible();
  await page.getByTestId("eva-marker-close").click();
  await expect(page.getByTestId("eva-marker-card")).toHaveCount(0);

  // x3 against x1 at the same place: same map position and readouts, different drawn height, camera always above the ground
  const at = async (f: number) => {
    await page.getByTestId("eva-scrub").fill(String(Math.round(f * 1000)));
    await expect.poll(async () => Math.abs(Number(await canvas(page, "s")) - 416.426 * f)).toBeLessThan(0.75);
    expect(Number(await canvas(page, "clearance"))).toBeGreaterThanOrEqual(1.69);
    return { eye: ((await canvas(page, "eye")) ?? "").split(",").map(Number), text: await page.locator(".hud-left").innerText() };
  };
  for (const f of [0.05, 0.3, 0.55, 0.95]) await at(f);
  const three = await at(0.8);
  await page.waitForTimeout(700);
  await shot(page, "07-eva-x3");
  await page.getByTestId("eva-ve-1").click();
  await expect(page.getByTestId("eva-ve-label")).toContainText("true vertical scale");
  await expect.poll(() => canvas(page, "ve")).toBe("1");
  const one = await at(0.8);
  expect([one.eye[0], one.eye[2]]).toEqual([three.eye[0], three.eye[2]]);
  expect(three.eye[1]).toBeGreaterThan(one.eye[1] + 5);
  expect(one.text, "walked, remaining, elevation, slope and climb do not depend on the display scale").toBe(three.text);
  await page.waitForTimeout(700);
  await shot(page, "08-eva-x1");
  for (const f of [0.3, 0.95]) await at(f);

  // the walk reaches the destination in both display modes
  for (const ve of ["1", "3"]) {
    await page.getByTestId(`eva-ve-${ve}`).click();
    await page.getByTestId("eva-scrub").fill("940");
    await page.getByTestId("eva-play").click();
    await expect(page.getByTestId("eva-arrived")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("eva-remaining")).toHaveText("0 m");
    expect(Number(await canvas(page, "clearance"))).toBeGreaterThanOrEqual(1.69);
  }

  // a gate with no corridor: said in the header, in 3D and in EVA; nothing can be started
  await page.getByTestId("eva-to-planning").click();
  await page.getByTestId("gate-15").click();
  await expect(page.getByTestId("route-mode")).toHaveText("Routes: EXPERIMENTAL 15° terrain gate");
  await expect(page.locator('[data-testid^="route-marker-"]')).toHaveCount(0);
  await nav(page, "3D terrain");
  await expect(page.getByTestId("gate-notice")).toContainText("No supported corridor under the experimental 15° terrain gate");
  await expect(page.getByTestId("start-eva")).toBeDisabled();
  await expect(page.getByTestId("marker3d-panel")).toHaveCount(0);
  await nav(page, "EVA HUD");
  await expect(page.getByTestId("eva-unavailable")).toContainText("Nothing was relaxed");
  await nav(page, "Planning");
  await page.getByTestId("gate-20").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("417.566 m");
  await expect(page.getByTestId("route-marker-ground")).toBeAttached(); // markers follow the gated route now
  await page.getByTestId("gate-off").click();
  await expect(page.getByTestId("len-terrain")).toHaveText("416.426 m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("664.390 flat-equivalent m");
  expect(seen.external).toEqual([]);
  expect(seen.errors).toEqual([]);
});

for (const [w, h] of [[1280, 720], [1024, 768]] as const) {
  test(`side panels at ${w} x ${h}: one scroll, controls reachable, nothing wider than the screen`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/");
    const fits = async (name: string) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${name}: no sideways scroll`).toBeLessThanOrEqual(1);
      await shot(page, `${w}-${name}`);
    };
    await expect(page.getByTestId("regional-sites")).toBeAttached();
    await page.getByTestId("target-chip-outcrop:skinner_ridge").click();
    await expect(page.getByTestId("inspector")).toBeVisible();
    await fits("mission-control");
    await page.getByTestId("mission-tab-A").click();
    await page.getByTestId("mission-plan").click();
    await expect(page.getByTestId("route-marker-start")).toBeAttached();
    await fits("planning");
    await nav(page, "3D terrain");
    await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
    // the 3D controls are one scrolling column: no scroll box nested inside another
    expect(await page.evaluate(() => [".mission-nav", ".terrain-meta"].map((s) => getComputedStyle(document.querySelector(s)!).overflowY))).toEqual(["visible", "visible"]);
    await page.getByTestId("start-eva").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("start-eva")).toBeVisible();
    await page.waitForTimeout(500);
    await fits("3d");
  });
}
