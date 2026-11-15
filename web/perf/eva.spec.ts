// Frame rate of the first-person EVA walk in real Chrome on this machine's GPU (the e2e suite runs headless, in software).
import { expect, test } from "@playwright/test";

test("EVA first-person walk frame rate on M0-A and ROI-A", async ({ page }) => {
  await page.goto("/");
  const renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "unknown";
  });
  const measure = async (label: string) => {
    await page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name: "3D terrain", exact: true }).click();
    await expect(page.getByTestId("terrain-texture")).toHaveText("ready");
    await page.getByTestId("start-eva").click();
    await expect(page.getByTestId("eva-world")).toHaveAttribute("data-texture", "ready");
    await page.waitForTimeout(1500); // let shaders compile and the texture upload finish
    const canvas = page.getByTestId("eva-canvas");
    const f0 = Number(await canvas.getAttribute("data-frames")), t0 = Date.now();
    await page.waitForTimeout(5000);
    const fps = (Number(await canvas.getAttribute("data-frames")) - f0) / ((Date.now() - t0) / 1000);
    await expect(page.getByTestId("eva-play")).toHaveText("Pause"); // it was walking the whole time
    console.log(`EVA_FPS ${label} ${fps.toFixed(1)} fps at 1440x900 | renderer: ${renderer}`);
    expect(fps, `${label}: smooth enough to follow`).toBeGreaterThan(24);
  };
  await measure("ROI-A (CTX 20 m, 6.7k cells)");
  await page.getByRole("navigation", { name: "Scenes" }).getByRole("button", { name: "Mission control", exact: true }).click();
  await page.getByTestId("mission-tab-A").click();
  await page.getByTestId("mission-plan").click();
  await measure("M0-A (HiRISE 2 m, 95.6k cells)");
});
