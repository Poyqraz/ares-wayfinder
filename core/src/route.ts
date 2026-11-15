// Route engine, contracts/CONTRACT.md §3. Pure: no I/O, no globals.
import { CONTRACT_VERSION, VALIDITY } from "@ares/contracts";
import type {
  Cell,
  CostCurve,
  Endpoint,
  ProfileSample,
  RouteMode,
  RouteParams,
  RouteRequest,
  RouteResult,
  RouteStatus,
  TerrainMeta,
} from "@ares/contracts";
import { cellCenter, projToCell } from "./coords.ts";

export const ALGORITHM_VERSION = "astar-1.0.0";

export interface TerrainGrid {
  meta: Pick<
    TerrainMeta,
    "nx" | "ny" | "x0" | "y0" | "dx_proj" | "dy_proj" | "dx_ground_m" | "dy_ground_m" | "dataset_version"
  >;
  dem: ArrayLike<number>;
  validity: ArrayLike<number>;
  slope: ArrayLike<number>;
}

// Relative cost multipliers m(g), normalised so m(0) = 1. Shape only, not physiology.
const CURVES: Record<CostCurve, (g: number) => number> = {
  // shortcut: Minetti et al. 2002 walking polynomial; coefficients pending primary-source check (task S6).
  minetti: (g) => (((((280.5 * g - 58.7) * g - 76.8) * g + 51.9) * g + 19.6) * g + 2.5) / 2.5,
  // shortcut: Tobler 1993 hiking function as v(0)/v(g); formula pending primary-source check (task S6).
  tobler: (g) => Math.exp(3.5 * (Math.abs(g + 0.05) - 0.05)),
};

export function costMultiplier(curve: CostCurve, g: number): number {
  const m = CURVES[curve](g);
  if (!(m > 0)) throw new Error(`cost curve ${curve} is not positive at grade ${g}`);
  return m;
}

/** Lower bound of m over [-gMax, gMax]. Dense sampling can miss a kink by up to ~1e-4
 *  relative, so the 1e-3 margin keeps the A* heuristic admissible. */
export function minMultiplier(curve: CostCurve, gMax: number): number {
  let min = Infinity;
  const n = 20000;
  for (let i = 0; i <= n; i++) min = Math.min(min, costMultiplier(curve, -gMax + (2 * gMax * i) / n));
  return min * (1 - 1e-3);
}

const UNCERTAINTY = [
  "DEM posting is 20 m; effective resolution is coarser. Features smaller than that are not visible.",
  "Cost curve shape comes from Earth, unsuited walking data; not validated for suited Mars EVA.",
  "Vertical reference of the DEM is not stated in its metadata.",
];

function emptyResult(status: RouteStatus, datasetVersion: string): RouteResult {
  return {
    status,
    cells: [],
    vertices_proj: [],
    length_horizontal_m: 0,
    length_surface_m: 0,
    ascent_m: 0,
    descent_m: 0,
    max_edge_grade: 0,
    cost_flat_equiv_m: 0,
    profile: [],
    constraint_notes: [],
    uncertainty_notes: UNCERTAINTY,
    baseline: null,
    algorithm_version: ALGORITHM_VERSION,
    dataset_version: datasetVersion,
    contract_version: CONTRACT_VERSION,
  };
}

function resolve(grid: TerrainGrid, e: Endpoint): Cell | null {
  const { nx, ny } = grid.meta;
  if (e.frame === "PROJ") return projToCell(grid.meta, e);
  const ok = Number.isInteger(e.row) && Number.isInteger(e.col) && e.row >= 0 && e.col >= 0 && e.row < ny && e.col < nx;
  return ok ? { row: e.row, col: e.col } : null;
}

/** Binary min-heap ordered by (f, h, idx): deterministic tie-breaking. */
class Heap {
  private f: number[] = [];
  private h: number[] = [];
  private i: number[] = [];
  get size() { return this.i.length; }
  private less(a: number, b: number) {
    return this.f[a] !== this.f[b] ? this.f[a] < this.f[b]
      : this.h[a] !== this.h[b] ? this.h[a] < this.h[b]
      : this.i[a] < this.i[b];
  }
  private swap(a: number, b: number) {
    [this.f[a], this.f[b]] = [this.f[b], this.f[a]];
    [this.h[a], this.h[b]] = [this.h[b], this.h[a]];
    [this.i[a], this.i[b]] = [this.i[b], this.i[a]];
  }
  push(f: number, h: number, idx: number) {
    this.f.push(f); this.h.push(h); this.i.push(idx);
    for (let k = this.i.length - 1; k > 0; ) {
      const p = (k - 1) >> 1;
      if (!this.less(k, p)) break;
      this.swap(k, p); k = p;
    }
  }
  pop(): number {
    const top = this.i[0];
    const last = this.i.length - 1;
    this.swap(0, last);
    this.f.pop(); this.h.pop(); this.i.pop();
    for (let k = 0; ; ) {
      const l = 2 * k + 1, r = l + 1;
      let m = k;
      if (l < last && this.less(l, m)) m = l;
      if (r < last && this.less(r, m)) m = r;
      if (m === k) break;
      this.swap(k, m); k = m;
    }
    return top;
  }
}

/** A* lower bound from cell index k to t: anisotropic octile ground distance × m_min.
 *  Every edge costs ≥ m_min × its horizontal length, and octile is the shortest 8-connected
 *  length on an empty grid, so this never exceeds the true cost (also when downhill m < 1). */
export function heuristic(
  meta: Pick<TerrainGrid["meta"], "nx" | "dx_ground_m" | "dy_ground_m">,
  mMin: number,
  k: number,
  t: number,
): number {
  const { nx, dx_ground_m: dx, dy_ground_m: dy } = meta;
  const dr = Math.abs(Math.floor(k / nx) - Math.floor(t / nx)), dc = Math.abs((k % nx) - (t % nx));
  const d = Math.min(dr, dc);
  return mMin * (d * Math.sqrt(dx * dx + dy * dy) + (dc - d) * dx + (dr - d) * dy);
}

const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]] as const;

function isPassable(grid: TerrainGrid, p: RouteParams, k: number): boolean {
  const v = grid.validity[k];
  if (v !== VALIDITY.VALID && v !== VALIDITY.VALID_SLOPE_UNDEFINED) return false;
  return p.cell_slope_gate_deg === null || grid.slope[k] <= p.cell_slope_gate_deg; // NaN slope blocks
}

/** Cost of the directed edge u -> v (neighbour offset dr, dc), or null if the model excludes it.
 *  Cell passability and corner cutting are checked by the caller. */
function edgeCost(grid: TerrainGrid, u: number, v: number, dr: number, dc: number, mode: RouteMode, p: RouteParams): number | null {
  const { dx_ground_m: dx, dy_ground_m: dy } = grid.meta;
  const L = dr && dc ? Math.sqrt(dx * dx + dy * dy) : dr ? dy : dx;
  if (mode === "distance") return L;
  const g = (grid.dem[v] - grid.dem[u]) / L;
  return Math.abs(g) > p.g_max ? null : L * costMultiplier(p.cost_curve, g);
}

/** Cost of an existing cell path under a given model (e.g. the distance route scored with the
 *  terrain model). null if the path is not a legal 8-connected path under that model. */
export function evaluatePath(grid: TerrainGrid, cells: Cell[], mode: RouteMode, p: RouteParams): number | null {
  const { nx } = grid.meta;
  const ok = (r: number, c: number) => isPassable(grid, p, r * nx + c);
  if (!cells.length || !cells.every((c) => ok(c.row, c.col))) return null;
  let cost = 0;
  for (let k = 1; k < cells.length; k++) {
    const a = cells[k - 1], b = cells[k];
    const dr = b.row - a.row, dc = b.col - a.col;
    if (Math.max(Math.abs(dr), Math.abs(dc)) !== 1) return null;
    if (dr && dc && !(ok(a.row, b.col) && ok(b.row, a.col))) return null;
    const w = edgeCost(grid, a.row * nx + a.col, b.row * nx + b.col, dr, dc, mode, p);
    if (w === null) return null;
    cost += w;
  }
  return cost;
}

export interface CostComparison {
  terrain_cost: number; // terrain route under the terrain model (flat-equivalent m)
  baseline_cost: number | null; // distance route under the same terrain model; null if the model excludes one of its edges
  delta: number | null; // terrain_cost - baseline_cost
  relation: "LOWER" | "EQUAL" | "BASELINE_NOT_ALLOWED";
}

/** Compare both routes under ONE model (the terrain model). EQUAL within rel. tolerance 1e-9.
 *  The terrain route is optimal for this model, so it can never be HIGHER. */
export function compareToBaseline(grid: TerrainGrid, terrain: RouteResult, distance: RouteResult, p: RouteParams): CostComparison {
  const t = terrain.cost_flat_equiv_m;
  const b = evaluatePath(grid, distance.cells, "terrain", p);
  if (b === null) return { terrain_cost: t, baseline_cost: null, delta: null, relation: "BASELINE_NOT_ALLOWED" };
  const d = t - b;
  if (d > 1e-9 * Math.max(1, b)) throw new Error(`terrain route costs more than baseline (${t} > ${b}): optimality violated`);
  return { terrain_cost: t, baseline_cost: b, delta: d, relation: Math.abs(d) <= 1e-9 * Math.max(1, b) ? "EQUAL" : "LOWER" };
}

function search(grid: TerrainGrid, s: number, t: number, mode: RouteMode, p: RouteParams, useHeuristic: boolean) {
  const { nx, ny } = grid.meta;
  const passable = (k: number) => isPassable(grid, p, k);
  const mMin = mode === "terrain" ? minMultiplier(p.cost_curve, p.g_max) : 1;
  const heur = (k: number) => (useHeuristic ? heuristic(grid.meta, mMin, k, t) : 0);
  const gScore = new Float64Array(nx * ny).fill(Infinity);
  const prev = new Int32Array(nx * ny).fill(-1);
  const closed = new Uint8Array(nx * ny);
  const heap = new Heap();
  gScore[s] = 0;
  heap.push(heur(s), heur(s), s);
  while (heap.size) {
    const u = heap.pop();
    if (closed[u]) continue;
    closed[u] = 1;
    if (u === t) return { prev, cost: gScore[t] };
    const r = Math.floor(u / nx), c = u % nx;
    for (const [dr, dc] of DIRS) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= ny || cc >= nx) continue;
      const v = rr * nx + cc;
      if (closed[v] || !passable(v)) continue;
      if (dr && dc && !(passable(r * nx + cc) && passable(rr * nx + c))) continue; // no corner cutting
      const w = edgeCost(grid, u, v, dr, dc, mode, p);
      if (w === null) continue;
      const cand = gScore[u] + w;
      if (cand < gScore[v] - 1e-12) {
        gScore[v] = cand;
        prev[v] = u;
        const h = heur(v);
        heap.push(cand + h, h, v);
      }
    }
  }
  return null;
}

/** Plan one route. options.heuristic=false runs plain Dijkstra (oracle for tests). */
export function planRoute(grid: TerrainGrid, req: RouteRequest, options = { heuristic: true }): RouteResult {
  const ver = grid.meta.dataset_version;
  if (req.dataset_version !== ver) return emptyResult("DATASET_VERSION_MISMATCH", ver);
  const start = resolve(grid, req.start), goal = resolve(grid, req.goal);
  if (!start || !goal) return emptyResult("ENDPOINT_OUTSIDE_ROI", ver);
  const { nx } = grid.meta;
  for (const e of [start, goal]) {
    const v = grid.validity[e.row * nx + e.col];
    if (v === VALIDITY.NODATA_SOURCE) return emptyResult("INVALID_ENDPOINT_NODATA", ver);
    if (v === VALIDITY.OUTSIDE_ROI) return emptyResult("ENDPOINT_OUTSIDE_ROI", ver);
    const gate = req.params.cell_slope_gate_deg;
    if (gate !== null && !(grid.slope[e.row * nx + e.col] <= gate)) return emptyResult("ENDPOINT_BLOCKED_BY_POLICY", ver);
  }
  const s = start.row * nx + start.col, t = goal.row * nx + goal.col;
  const found = search(grid, s, t, req.mode, req.params, options.heuristic);
  const notes = req.mode === "terrain"
    ? [`Edges with |grade| > ${req.params.g_max} are excluded (demonstration parameter, not a safety limit).`,
       `Cost curve: ${req.params.cost_curve} (relative cost, flat ground = 1).`]
    : ["Geometric shortest path; terrain grade is not considered."];
  if (req.params.cell_slope_gate_deg !== null) notes.push(`Cells steeper than ${req.params.cell_slope_gate_deg}° are excluded (demonstration parameter).`);
  if (!found) return { ...emptyResult("NO_ROUTE", ver), constraint_notes: notes };

  const idx: number[] = [];
  for (let k = t; k !== -1; k = found.prev[k]) idx.push(k);
  idx.reverse();
  const cells = idx.map((k) => ({ row: Math.floor(k / nx), col: k % nx }));
  const { dx_ground_m: dx, dy_ground_m: dy } = grid.meta;
  let len = 0, surf = 0, up = 0, down = 0, maxG = 0;
  const profile: ProfileSample[] = [{ s_m: 0, h_m: grid.dem[idx[0]], grade: 0 }];
  for (let k = 1; k < idx.length; k++) {
    const a = cells[k - 1], b = cells[k];
    const dr = b.row - a.row, dc = b.col - a.col;
    const L = dr && dc ? Math.sqrt(dx * dx + dy * dy) : dr ? dy : dx;
    const dz = grid.dem[idx[k]] - grid.dem[idx[k - 1]];
    len += L;
    surf += Math.sqrt(L * L + dz * dz);
    if (dz > 0) up += dz; else down -= dz;
    maxG = Math.max(maxG, Math.abs(dz / L));
    profile.push({ s_m: len, h_m: grid.dem[idx[k]], grade: dz / L });
  }
  const result: RouteResult = {
    ...emptyResult("OK", ver),
    cells,
    vertices_proj: cells.map((c) => cellCenter(grid.meta, c)),
    length_horizontal_m: len,
    length_surface_m: surf,
    ascent_m: up,
    descent_m: down,
    max_edge_grade: maxG,
    cost_flat_equiv_m: found.cost,
    profile,
    constraint_notes: notes,
  };
  if (req.mode === "terrain") {
    const base = planRoute(grid, { ...req, mode: "distance" }, options);
    if (base.status === "OK") {
      result.baseline = {
        delta_length_m: len - base.length_horizontal_m,
        delta_ascent_m: up - base.ascent_m,
      };
    }
  }
  return result;
}
