// 2D map geometry (CR-005): SVG x is ground metres east of x0 (k = groundScaleX), SVG y is metres south of y0.
// Pure; used by map.tsx and tested without React.
import type { TerrainMeta } from "@ares/contracts";
import { groundScaleX } from "@ares/core";

type Meta = Pick<TerrainMeta, "nx" | "ny" | "x0" | "y0" | "dx_proj" | "dy_proj" | "dx_ground_m">;

export function mapGeometry(meta: Meta) {
  const k = groundScaleX(meta);
  return {
    k,
    /** projected E -> SVG x */
    toX: (E: number) => meta.x0 + (E - meta.x0) * k,
    /** SVG x -> projected E (exact inverse of toX) */
    toE: (x: number) => meta.x0 + (x - meta.x0) / k,
    view: { x: meta.x0, y: 0, w: meta.nx * meta.dx_proj * k, h: meta.ny * meta.dy_proj },
    /** ground metres per SVG unit along x (1 when k is applied; ROI-A keeps its 1.00006) */
    groundPerUnitX: meta.dx_ground_m / (meta.dx_proj * k),
  };
}
