import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

test("headed Chrome holds HiRISE 4 m above the device floor", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name: "Planning", exact: true }).click();
  await expect(page.getByTestId("len-distance")).toHaveText("969.161 m");
  await expect(page.getByTestId("len-terrain")).toHaveText("969.161 m");
  await expect(page.getByTestId("cost-distance")).toHaveText("1093.229 flat-equivalent m");
  await expect(page.getByTestId("cost-terrain")).toHaveText("1058.299 flat-equivalent m");
  await expect(page.getByTestId("relation")).toHaveText("LOWER");
  await page.getByRole("button", { name: "3D terrain" }).click();
  await expect(page.getByTestId("terrain-canvas")).toBeVisible();
  await page.getByTestId("display-hirise-4m").click();
  await expect(page.getByTestId("visualization-dem")).toHaveText("Visualization DEM: HiRISE 4 m (display only)");
  await expect(page.getByTestId("hirise-notice")).toHaveText("");

  const fps = await page.evaluate(() => new Promise<number>((resolve) => {
    const start = performance.now();
    let frames = 0;
    const tick = (now: number) => {
      frames += 1;
      if (now - start < 1000) requestAnimationFrame(tick);
      else resolve(Math.round(frames * 1000 / (now - start)));
    };
    requestAnimationFrame(tick);
  }));
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/browser-perf.json", JSON.stringify({ fps, floor: 30, browser: "chrome" }, null, 2));
  expect(fps).toBeGreaterThanOrEqual(30);
});

test("headed Chrome renders M0-A 3D (HiRISE 2 m analysis grid) above the device floor", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name: "Planning", exact: true }).click();
  await expect(page.getByTestId("region-m0a")).toBeEnabled();
  await page.getByTestId("region-m0a").click();
  await expect(page.getByTestId("len-distance")).toHaveText("416.426 m");
  await page.getByRole("button", { name: "3D terrain" }).click();
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  const fps = await page.evaluate(() => new Promise<number>((resolve) => {
    const start = performance.now();
    let frames = 0;
    const tick = (now: number) => {
      frames += 1;
      if (now - start < 2000) requestAnimationFrame(tick);
      else resolve(Math.round(frames * 1000 / (now - start)));
    };
    requestAnimationFrame(tick);
  }));
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/browser-perf-m0a.json", JSON.stringify({ fps, floor: 30, browser: "chrome", scene: "M0-A 3D" }, null, 2));
  expect(fps).toBeGreaterThanOrEqual(30);
});
