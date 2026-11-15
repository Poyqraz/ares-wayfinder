import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { loadedPois, uncertaintyText } from "./poiExpect.ts";

function parseVec(raw: string | null): [number, number, number] {
  const parts = (raw ?? "").split(",").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return [NaN, NaN, NaN];
  return [parts[0]!, parts[1]!, parts[2]!];
}

function dist(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function playPct(text: string | null): number {
  return Number((text ?? "").replace("%", ""));
}

async function readCam(page: Page): Promise<[number, number, number]> {
  return parseVec(await page.getByTestId("terrain-canvas").getAttribute("data-cam"));
}

async function readTarget(page: Page): Promise<[number, number, number]> {
  return parseVec(await page.getByTestId("terrain-canvas").getAttribute("data-target"));
}

async function scrubTo(page: Page, pct: number) {
  await page.getByTestId("fly-scrub").evaluate((el, value) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, pct);
}

/** Sample the WebGL canvas into a small RGB buffer for frame-diff checks. */
async function sampleFrame(page: Page): Promise<number[]> {
  return page.getByTestId("terrain-canvas").evaluate((canvas) => {
    const copy = document.createElement("canvas");
    copy.width = 160;
    copy.height = 90;
    const context = copy.getContext("2d");
    if (!context) return [];
    context.drawImage(canvas, 0, 0, copy.width, copy.height);
    return Array.from(context.getImageData(0, 0, copy.width, copy.height).data);
  });
}

function meanAbsDiff(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
    count += 3;
  }
  return count === 0 ? 0 : sum / count;
}

async function enterTerrain(page: Page) {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name: "Planning", exact: true }).click();
  await expect(page.getByTestId("len-distance")).toHaveText("969.161 m");
  await page.getByRole("button", { name: "3D terrain" }).click();
  await expect(page.getByTestId("terrain-canvas")).toBeVisible();
  await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
  await expect(page.getByTestId("mission-nav")).toBeVisible();
  await expect(page.getByText("3D terrain preview from the ROI-A DEM. Play follows the selected route by horizontal distance along the path.")).toBeVisible();
  await expect(page.getByTestId("uncertainty")).toHaveText(uncertaintyText(await loadedPois(page)));
  await expect(page.getByTestId("s4-line")).toHaveText("CTX DEM/image registration UNRESOLVED (S-4)");
}

test("3D terrain keeps the demo route and exaggeration state", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await enterTerrain(page);
  await expect(page.getByTestId("ve-readout")).toHaveText("VERTICAL EXAGGERATION ×1");
  await expect(page.getByTestId("route-legend")).toContainText("Distance");
  const varied = await page.getByTestId("terrain-canvas").evaluate((canvas) => {
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    const context = copy.getContext("2d");
    if (!context) return false;
    context.drawImage(canvas, 0, 0);
    const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
    let min = 255 * 3;
    let max = 0;
    for (let i = 0; i < pixels.length; i += 64) {
      const lum = pixels[i] + pixels[i + 1] + pixels[i + 2];
      if (lum < min) min = lum;
      if (lum > max) max = lum;
    }
    return max - min > 12;
  });
  expect(varied).toBe(true);
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/g4-terrain-overview.png" });
  await page.getByRole("button", { name: "×2.5", exact: true }).click();
  await expect(page.getByTestId("ve-readout")).toHaveText("VERTICAL EXAGGERATION ×2.5");
  await page.getByTestId("return-2d").click();
  await expect(page.getByTestId("len-distance")).toHaveText("969.161 m");
  await expect(page.getByTestId("len-terrain")).toHaveText("969.161 m");
  await expect(page.getByTestId("start-cell")).toHaveText("63, 24");
  await expect(page.getByTestId("goal-cell")).toHaveText("22, 42");
  await expect(page.getByTestId("ve")).toContainText("×2.5");
  const serious = errors.filter((line) => !/favicon|Download the React DevTools/i.test(line));
  expect(serious).toEqual([]);
});

test("pause keeps the camera; resume stays near; scrub matches the path", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await enterTerrain(page);
  await page.getByTestId("fly-play").click();
  await expect.poll(async () => playPct(await page.getByTestId("fly-playhead").textContent())).toBeGreaterThan(2);
  await page.getByTestId("fly-pause").click();
  await page.waitForTimeout(50);
  const pausedCam = await readCam(page);
  const pausedTarget = await readTarget(page);
  expect(dist(pausedTarget, [0, 0, 0])).toBeGreaterThan(1);
  await page.waitForTimeout(1000);
  expect(dist(await readCam(page), pausedCam)).toBeLessThan(0.5);
  expect(dist(await readTarget(page), pausedTarget)).toBeLessThan(0.5);

  const pausedPct = playPct(await page.getByTestId("fly-playhead").textContent());
  await page.getByTestId("fly-play").click();
  // Sample immediately: at 80 m/s even a few frames leave the pause point; overview jumps are ~800+.
  let closest = Infinity;
  for (let i = 0; i < 12; i++) {
    closest = Math.min(closest, dist(await readCam(page), pausedCam));
    if (closest < 20) break;
    await page.waitForTimeout(16);
  }
  expect(closest).toBeLessThan(20);
  await expect.poll(async () => playPct(await page.getByTestId("fly-playhead").textContent())).toBeGreaterThan(pausedPct);

  await page.getByTestId("fly-pause").click();
  const beforeScrub = await readCam(page);
  await scrubTo(page, 50);
  await expect(page.getByTestId("fly-playhead")).toHaveText("50%");
  await expect.poll(async () => dist(await readCam(page), beforeScrub)).toBeGreaterThan(1);
  await page.waitForTimeout(100);
  const scrubCam = await readCam(page);
  await page.waitForTimeout(400);
  expect(dist(await readCam(page), scrubCam)).toBeLessThan(0.5);

  mkdirSync("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/g4-flyalong-mid.png" });
  expect(errors).toEqual([]);
});

test("route switch while playing keeps the playhead and camera near", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await enterTerrain(page);
  await page.getByTestId("fly-play").click();
  await expect.poll(async () => playPct(await page.getByTestId("fly-playhead").textContent())).toBeGreaterThan(5);
  const beforeCam = await readCam(page);
  // Read playhead and fire the click in one browser turn so no RAF advances between them.
  const beforePct = playPct(
    await page.evaluate(() => {
      const head = document.querySelector('[data-testid="fly-playhead"]')?.textContent ?? "";
      (document.querySelector('[data-testid="fly-route-distance"]') as HTMLButtonElement | null)?.click();
      return head;
    }),
  );
  await expect(page.getByTestId("fly-pause")).toBeDisabled();
  const afterPct = playPct(await page.getByTestId("fly-playhead").textContent());
  expect(Math.abs(afterPct - beforePct)).toBeLessThanOrEqual(1);
  await page.waitForTimeout(300);
  expect(playPct(await page.getByTestId("fly-playhead").textContent())).toBe(afterPct);
  expect(dist(await readCam(page), beforeCam)).toBeLessThan(120);

  const beforeTerrain = afterPct;
  await page.evaluate(() => {
    (document.querySelector('[data-testid="fly-route-terrain"]') as HTMLButtonElement | null)?.click();
  });
  await expect(page.getByTestId("fly-pause")).toBeDisabled();
  const afterTerrain = playPct(await page.getByTestId("fly-playhead").textContent());
  expect(Math.abs(afterTerrain - beforeTerrain)).toBeLessThanOrEqual(1);
  await page.waitForTimeout(300);
  expect(playPct(await page.getByTestId("fly-playhead").textContent())).toBe(afterTerrain);

  await page.getByTestId("return-2d").click();
  await expect(page.getByTestId("len-distance")).toHaveText("969.161 m");
  await expect(page.getByTestId("len-terrain")).toHaveText("969.161 m");
  expect(errors).toEqual([]);
});

test("flyover actually renders while playing", async ({ page }) => {
  await enterTerrain(page);
  await page.waitForTimeout(200);
  const overview = await sampleFrame(page);
  expect(overview.length).toBeGreaterThan(0);

  await page.getByTestId("fly-play").click();
  await expect.poll(async () => playPct(await page.getByTestId("fly-playhead").textContent())).toBeGreaterThan(2);
  const playingA = await sampleFrame(page);
  await page.waitForTimeout(300);
  const playingB = await sampleFrame(page);

  expect(meanAbsDiff(playingA, playingB)).toBeGreaterThan(5);
  expect(meanAbsDiff(playingA, overview)).toBeGreaterThan(5);
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/g4-fix3-midplay.png" });
});

test("zoom after Pause can move back in", async ({ page }) => {
  await enterTerrain(page);
  await page.getByTestId("fly-play").click();
  await expect.poll(async () => playPct(await page.getByTestId("fly-playhead").textContent())).toBeGreaterThan(2);
  await page.getByTestId("fly-pause").click();
  await expect(page.getByTestId("fly-pause")).toBeDisabled();
  await page.waitForTimeout(100);

  const canvas = page.getByTestId("terrain-canvas");
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 120);
  await page.waitForTimeout(200);
  const d1 = dist(await readCam(page), await readTarget(page));
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -120);
  await page.waitForTimeout(200);
  const d2 = dist(await readCam(page), await readTarget(page));
  expect(d2).toBeLessThan(d1 - 5);
});

test("Space toggles play in 3D without leaving the scene", async ({ page }) => {
  await enterTerrain(page);
  await page.keyboard.press("Space");
  await expect.poll(async () => playPct(await page.getByTestId("fly-playhead").textContent())).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "3D terrain", exact: true })).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("fly-pause")).toBeDisabled();
  const paused = await page.getByTestId("fly-playhead").textContent();
  await page.waitForTimeout(400);
  await expect(page.getByTestId("fly-playhead")).toHaveText(paused ?? "");
  await expect(page.getByRole("button", { name: "3D terrain", exact: true })).toHaveAttribute("aria-current", "page");
});

test("flyalong scrub frames stay in test-results and demo lengths hold", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  mkdirSync("test-results", { recursive: true });

  await enterTerrain(page);
  await page.getByTestId("fly-play").click();
  await expect.poll(async () => (await readCam(page))[0]).not.toBeNaN();
  await page.getByTestId("fly-pause").click();
  for (const pct of [0, 25, 50, 75, 100] as const) {
    await scrubTo(page, pct);
    await expect(page.getByTestId("fly-playhead")).toHaveText(`${pct}%`);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `test-results/g4-flyalong-${pct}.png` });
  }
  await page.getByTestId("return-2d").click();
  await expect(page.getByTestId("len-distance")).toHaveText("969.161 m");
  await expect(page.getByTestId("len-terrain")).toHaveText("969.161 m");
  expect(errors).toEqual([]);
});

test("repeated 2D and 3D transitions keep WebGL and the demo numbers", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name: "Planning", exact: true }).click();
  await expect(page.getByTestId("len-distance")).toHaveText("969.161 m");
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "3D terrain" }).click();
    await expect(page.getByTestId("terrain-canvas")).toBeVisible();
    await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
    const lost = await page.getByTestId("terrain-canvas").evaluate((canvas) => {
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      return gl?.isContextLost() ?? true;
    });
    expect(lost).toBe(false);
    await expect(page.getByTestId("uncertainty")).toHaveText(uncertaintyText(await loadedPois(page)));
    await expect(page.getByTestId("s4-line")).toBeVisible();
    await page.getByTestId("return-2d").click();
    await expect(page.getByTestId("len-distance")).toHaveText("969.161 m");
    await expect(page.getByTestId("len-terrain")).toHaveText("969.161 m");
  }
  const serious = errors.filter((line) => !/favicon|Download the React DevTools/i.test(line));
  expect(serious).toEqual([]);
});

test("HiRISE 4 m drapes the CTX route and leaves the analysis numbers", async ({ page }) => {
  await enterTerrain(page);
  await expect(page.getByTestId("display-ctx")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("visualization-dem")).toHaveText("Visualization DEM: CTX 20 m ortho");
  await expect(page.getByTestId("hirise-notice")).toHaveText("");

  await page.getByTestId("display-hirise-4m").click();
  await expect(page.getByTestId("visualization-dem")).toHaveText("Visualization DEM: HiRISE 4 m (display only)");
  await expect(page.getByTestId("analysis-dem")).toContainText("CTX 20 m");
  await expect(page.getByTestId("hirise-provenance")).toContainText("Route computed on CTX 20 m; drawn on HiRISE (display only). Not validated for human walking.");
  await expect(page.getByTestId("hirise-provenance")).toContainText("doi:10.5066/P9REJ9JN");
  await expect(page.getByTestId("hirise-provenance")).toContainText("doi:10.5066/P9QJDP48");
  await expect(page.getByTestId("hirise-provenance")).toContainText("+1.66 m");
  await expect(page.getByTestId("hirise-provenance")).toContainText("SD 2.07 m");
  await expect(page.getByTestId("hirise-provenance")).toContainText("1.24 m E, 4.27 m S");
  await expect(page.getByTestId("hirise-provenance")).toContainText("21 east–west line artifacts");
  await expect(page.getByTestId("key-help")).toHaveText("Left and Right change scene. Space plays and pauses the flyover. R restores the demo route.");
  await expect(page.getByTestId("hirise-provenance")).toContainText("2006–2017, before the 2021 landing");
  await expect(page.getByTestId("hirise-notice")).toHaveText("");
  await expect(page.getByTestId("display-toggle-label")).toContainText("HiRISE 4 m (display only)");

  const orient = await page.evaluate(async () => {
    const load = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(url));
      image.src = url;
    });
    const sample = (image: HTMLImageElement, flip: boolean) => {
      const canvas = document.createElement("canvas");
      canvas.width = 48;
      canvas.height = 48;
      const context = canvas.getContext("2d");
      if (!context) return [];
      context.setTransform(1, 0, 0, flip ? -1 : 1, 0, flip ? 48 : 0);
      context.drawImage(image, 0, 0, 48, 48);
      const data = context.getImageData(0, 0, 48, 48).data;
      const values: number[] = [];
      for (let i = 0; i < data.length; i += 4) values.push(data[i] ?? 0);
      return values;
    };
    const corr = (a: number[], b: number[]) => {
      const n = Math.min(a.length, b.length);
      let ma = 0;
      let mb = 0;
      for (let i = 0; i < n; i++) {
        ma += a[i] ?? 0;
        mb += b[i] ?? 0;
      }
      ma /= n;
      mb /= n;
      let num = 0;
      let da = 0;
      let db = 0;
      for (let i = 0; i < n; i++) {
        const xa = (a[i] ?? 0) - ma;
        const xb = (b[i] ?? 0) - mb;
        num += xa * xb;
        da += xa * xa;
        db += xb * xb;
      }
      return num / Math.sqrt(da * db);
    };
    const ctxIndex = await (await fetch("/data/index.json")).json() as { roi_a: { path: string } };
    const hiriseIndex = await (await fetch("/data/hirise/index.json")).json() as { roi_a: { path: string } };
    const ctx = await load(`/${ctxIndex.roi_a.path}ortho.jpg`);
    const hirise = await load(`/${hiriseIndex.roi_a.path}ortho_1m.jpg`);
    const base = sample(ctx, false);
    return { aligned: corr(base, sample(hirise, false)), flipped: corr(base, sample(hirise, true)) };
  });
  expect(orient.aligned).toBeGreaterThan(0.4);
  expect(orient.flipped).toBeLessThan(orient.aligned - 0.4);

  await expect.poll(async () => page.getByTestId("terrain-canvas").evaluate((canvas) => {
    const copy = document.createElement("canvas");
    copy.width = 32;
    copy.height = 32;
    const context = copy.getContext("2d");
    if (!context) return 0;
    context.drawImage(canvas, 0, 0, 32, 32);
    const pixels = context.getImageData(0, 0, 32, 32).data;
    let min = 255 * 3;
    let max = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const lum = (pixels[i] ?? 0) + (pixels[i + 1] ?? 0) + (pixels[i + 2] ?? 0);
      if (lum < min) min = lum;
      if (lum > max) max = lum;
    }
    return max - min;
  })).toBeGreaterThan(40);

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
  // Headless Chromium is the software path. This floor only checks that frames advance. It is not the device budget.
  expect(fps).toBeGreaterThanOrEqual(4);

  await page.getByText("HiRISE source notes").click();
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/h3-ui-labels.png" });

  await page.getByTestId("terrain-canvas").evaluate((canvas) => {
    canvas.dispatchEvent(new Event("webglcontextlost"));
  });
  await expect(page.getByTestId("hirise-notice")).toContainText("Showing CTX 20 m.");
  await expect(page.getByTestId("visualization-dem")).toHaveText("Visualization DEM: CTX 20 m ortho");

  await page.getByTestId("return-2d").click();
  await expect(page.getByTestId("len-distance")).toHaveText("969.161 m");
  await expect(page.getByTestId("len-terrain")).toHaveText("969.161 m");
  await expect(page.getByTestId("cost-distance")).toContainText("1093.229");
  await expect(page.getByTestId("cost-terrain")).toContainText("1058.299");
  await expect(page.getByTestId("relation")).toHaveText("LOWER");
});

test("a missing HiRISE file keeps CTX and blocks other origins", async ({ page }) => {
  await page.route(/https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await page.route("**/dtm_4m.f32.bin", (route) => route.abort());
  await enterTerrain(page);
  await page.getByTestId("display-hirise-4m").click();
  await expect(page.getByTestId("hirise-notice")).toContainText("Showing CTX 20 m.");
  await expect(page.getByTestId("visualization-dem")).toHaveText("Visualization DEM: CTX 20 m ortho");
  await expect(page.getByTestId("display-ctx")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("return-2d").click();
  await expect(page.getByTestId("len-distance")).toHaveText("969.161 m");
  await expect(page.getByTestId("len-terrain")).toHaveText("969.161 m");
  await expect(page.getByTestId("relation")).toHaveText("LOWER");
});
