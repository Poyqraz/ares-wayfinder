import type { TerrainGrid } from "@ares/core";
import { STEEP_DEG } from "./layers.ts";

function paint(grid: TerrainGrid, pixel: (index: number) => [number, number, number, number]): string {
  const { nx, ny } = grid.meta;
  const canvas = document.createElement("canvas");
  canvas.width = nx;
  canvas.height = ny;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const image = context.createImageData(nx, ny);
  for (let i = 0; i < nx * ny; i++) {
    const [r, g, b, a] = pixel(i);
    const o = i * 4;
    image.data[o] = r;
    image.data[o + 1] = g;
    image.data[o + 2] = b;
    image.data[o + 3] = a;
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Cells the experimental gate excludes on this (possibly clearance-widened) slope raster. Display only. */
export function gateOverlayUrl(grid: TerrainGrid, gateDeg: number): string {
  return paint(grid, (i) => (grid.validity[i] === 0 || grid.validity[i] === 3) && !(grid.slope[i] <= gateDeg) ? [214, 70, 214, 120] : [0, 0, 0, 0]);
}

/** One pixel per DEM cell. Display only; it is not a new terrain product. */
export function overlayUrl(grid: TerrainGrid, kind: "slope" | "validity" | "elevation" | "steep"): string {
  if (kind === "elevation") {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < grid.dem.length; i++) if (Number.isFinite(grid.dem[i])) { lo = Math.min(lo, grid.dem[i]); hi = Math.max(hi, grid.dem[i]); }
    return paint(grid, (i) => {
      const h = grid.dem[i];
      if (!Number.isFinite(h)) return [0, 0, 0, 0];
      const t = (h - lo) / Math.max(hi - lo, 1e-9);
      return [Math.round(40 + 215 * t), Math.round(90 + 60 * t), Math.round(200 * (1 - t)), 170];
    });
  }
  if (kind === "steep") {
    return paint(grid, (i) => (Number.isFinite(grid.slope[i]) && grid.slope[i] > STEEP_DEG ? [235, 40, 40, 190] : [0, 0, 0, 0]));
  }
  if (kind === "validity") {
    return paint(grid, (i) => {
      switch (grid.validity[i]) {
        case 0:
          return [0, 0, 0, 0];
        case 1:
          return [214, 48, 96, 150];
        case 2:
          return [130, 130, 130, 120];
        case 3:
          return [230, 190, 50, 150];
        default:
          return [255, 0, 255, 180];
      }
    });
  }
  return paint(grid, (i) => {
    const slope = grid.slope[i];
    if (!Number.isFinite(slope)) return [0, 0, 0, 0];
    const t = Math.max(0, Math.min(1, slope / 30));
    return [
      Math.round(40 + 190 * t),
      Math.round(90 - 40 * t),
      Math.round(140 * (1 - t)),
      Math.round(30 + 170 * t),
    ];
  });
}
