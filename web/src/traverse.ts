// Terrain measured along a computed route: what the planner constrains (step grade), and what it does not unless the
// experimental gate is on (slope of the ground itself, and its component across the walking direction).
// These are topographic measurements on the DEM. None of them is a safety assessment.
import type { RouteParams, RouteResult } from "@ares/contracts";
import type { TerrainGrid } from "@ares/core";
import { planPair, ROUTE_PARAMS, type Planned } from "./plan.ts";

const DEG = 180 / Math.PI;

/** Robust 1-sigma difference of Horn slope between independent HiRISE stereo models (C, W, DL) of the M0-A box, on
 *  ground steeper than 15 degrees: 3.7 to 5.0 degrees (analysis/s9/results/stereo_check.json). No such figure exists for the CTX grid. */
export const M0A_SLOPE_SIGMA_DEG = 4;

/** Horn 3x3 gradient of the DEM at a cell, in metres of rise per ground metre towards east and north.
 *  null at the grid edge or beside NoData (the bundle's slope raster used a halo there; this function has none). */
export function cellGradient(grid: TerrainGrid, row: number, col: number): { east: number; north: number } | null {
  const { nx, ny, dx_ground_m: dx, dy_ground_m: dy } = grid.meta;
  if (row < 1 || col < 1 || row > ny - 2 || col > nx - 2) return null;
  const z = (r: number, c: number) => grid.dem[r * nx + c];
  const nw = z(row - 1, col - 1), n = z(row - 1, col), ne = z(row - 1, col + 1), w = z(row, col - 1), e = z(row, col + 1), sw = z(row + 1, col - 1), s = z(row + 1, col), se = z(row + 1, col + 1);
  const east = (ne + 2 * e + se - (nw + 2 * w + sw)) / (8 * dx), north = (nw + 2 * n + ne - (sw + 2 * s + se)) / (8 * dy); // row 0 is north
  return Number.isFinite(east) && Number.isFinite(north) ? { east, north } : null;
}

export interface StepTerrain {
  s_m: number; // distance along the route at the end of the step
  length_m: number;
  grade_deg: number; // signed, along the step, from the two cell-centre elevations: the only slope the reference planner limits
  cell_slope_deg: number; // steeper of the two cells' terrain slope (Horn 3x3, any direction), from the bundle's slope raster
  cross_slope_deg: number; // component of the terrain gradient across the walking direction; NaN where the gradient is undefined
  relief_m: number; // highest minus lowest DEM value in the 3x3 cells around the end cell: abrupt local change
}

/** Per-step terrain of a route that is OK. Empty for any other route. */
export function routeTerrain(grid: TerrainGrid, route: RouteResult | null): StepTerrain[] {
  if (!route || route.status !== "OK") return [];
  const { nx, ny, dx_ground_m: dx, dy_ground_m: dy } = grid.meta, out: StepTerrain[] = [];
  for (let k = 1; k < route.cells.length; k++) {
    const a = route.cells[k - 1], b = route.cells[k], p = route.profile[k];
    const te = (b.col - a.col) * dx, tn = (a.row - b.row) * dy, L = Math.hypot(te, tn);
    const ga = cellGradient(grid, a.row, a.col), gb = cellGradient(grid, b.row, b.col);
    const g = ga && gb ? { east: (ga.east + gb.east) / 2, north: (ga.north + gb.north) / 2 } : ga ?? gb;
    let lo = Infinity, hi = -Infinity;
    for (let r = Math.max(0, b.row - 1); r <= Math.min(ny - 1, b.row + 1); r++) for (let c = Math.max(0, b.col - 1); c <= Math.min(nx - 1, b.col + 1); c++) {
      const h = grid.dem[r * nx + c];
      if (Number.isFinite(h)) { lo = Math.min(lo, h); hi = Math.max(hi, h); }
    }
    out.push({
      s_m: p.s_m, length_m: L, grade_deg: Math.atan(p.grade) * DEG,
      cell_slope_deg: Math.max(grid.slope[a.row * nx + a.col], grid.slope[b.row * nx + b.col]),
      cross_slope_deg: g ? Math.atan(Math.abs((g.east * -tn + g.north * te) / L)) * DEG : NaN,
      relief_m: hi - lo,
    });
  }
  return out;
}

export interface TerrainSummary {
  max_grade_deg: number;
  max_cell_slope_deg: number;
  max_cross_slope_deg: number;
  max_relief_m: number;
  metres_over: Record<number, number>; // route length on ground steeper than each threshold (cell slope)
  cross_over_grade_m: number; // route length where the slope across the path is larger than the slope along it
}

export const SLOPE_BANDS_DEG = [15, 20, 25, 30] as const;

export function summarizeTerrain(steps: StepTerrain[]): TerrainSummary {
  const s: TerrainSummary = { max_grade_deg: 0, max_cell_slope_deg: 0, max_cross_slope_deg: 0, max_relief_m: 0, metres_over: {}, cross_over_grade_m: 0 };
  for (const t of SLOPE_BANDS_DEG) s.metres_over[t] = 0;
  for (const q of steps) {
    s.max_grade_deg = Math.max(s.max_grade_deg, Math.abs(q.grade_deg));
    if (Number.isFinite(q.cell_slope_deg)) s.max_cell_slope_deg = Math.max(s.max_cell_slope_deg, q.cell_slope_deg);
    if (Number.isFinite(q.cross_slope_deg)) s.max_cross_slope_deg = Math.max(s.max_cross_slope_deg, q.cross_slope_deg);
    s.max_relief_m = Math.max(s.max_relief_m, q.relief_m);
    for (const t of SLOPE_BANDS_DEG) if (q.cell_slope_deg > t) s.metres_over[t] += q.length_m;
    if (q.cross_slope_deg > Math.abs(q.grade_deg)) s.cross_over_grade_m += q.length_m;
  }
  return s;
}

/** Experimental terrain-slope gates offered in Planning. null is the reference planner (no gate). */
export const SLOPE_GATES_DEG = [null, 25, 20, 15] as const;
export type SlopeGate = (typeof SLOPE_GATES_DEG)[number];

/** Planner parameters with the experimental gate: cells whose terrain slope exceeds it are not entered at all. A cell's
 *  slope bounds both the grade along any step through it and the slope across it, so one gate limits both. */
export function gatedParams(base: RouteParams, gate: SlopeGate): RouteParams {
  return { ...base, cell_slope_gate_deg: gate };
}

/** The grid the gated planner sees. With clearance, a cell takes the steepest slope of its 3x3 neighbourhood, so the gate
 *  also keeps the path one cell away from steeper ground. The DEM and validity are the original arrays. */
export function gateGrid(grid: TerrainGrid, clearance: boolean): TerrainGrid {
  if (!clearance) return grid;
  const { nx, ny } = grid.meta, slope = new Float32Array(nx * ny);
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
    let worst = grid.slope[r * nx + c]; // NaN stays NaN: undefined slope is never passable under a gate
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < ny && cc < nx && grid.slope[rr * nx + cc] > worst) worst = grid.slope[rr * nx + cc];
    }
    slope[r * nx + c] = worst;
  }
  return { ...grid, slope };
}

/** Both routes under the experimental gate. A blocked endpoint or a disconnected corridor is returned as such. */
export function planGated(grid: TerrainGrid, start: { row: number; col: number }, goal: { row: number; col: number }, gate: SlopeGate, clearance: boolean): Planned & { grid: TerrainGrid; params: RouteParams } {
  const g = gate === null ? grid : gateGrid(grid, clearance), params = gatedParams(ROUTE_PARAMS, gate);
  const planned = planPair(g, start, goal, params);
  if (gate !== null && clearance) for (const r of [planned.routes.distance, planned.routes.terrain]) r.constraint_notes = [...r.constraint_notes, "Clearance: a cell is also excluded when one of its 8 neighbours is steeper than the gate (demonstration parameter)."];
  return { ...planned, grid: g, params };
}
