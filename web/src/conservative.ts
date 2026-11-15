// Conservative Terrain: a third, separate route strategy for a hypothetical astronaut traverse. It prefers gentler
// ground and keeps away from steep ground; it is not a safety assessment and it does not claim to be the safest route.
//
// The frozen planner (core/src/route.ts) is not touched. This module has its own search (Dijkstra) and one documented cost:
//
//   step cost = L x m(g) x (1 + W x p(v))
//     L, m(g)  the same step length and Minetti-type grade multiplier as the terrain-aware route
//     s(v)     the steepest terrain slope (Horn 3x3) in the 3x3 cells around v: nearby steep ground counts
//     p(v)     clamp((s(v) + sigma - COMFORT) / (GATE - COMFORT), 0, 1) squared; sigma is the slope disagreement
//              between independent stereo models where it is known (0 where it is not, and the route says so)
//   hard rules: valid terrain only; no corner cutting; step grade at most g_max (24.2 deg); s(v) at most GATE for every
//               cell including both endpoints. Nothing is relaxed: a failing endpoint or a disconnected corridor is reported.
//
// A cell's terrain slope bounds the slope across any path through it, so preferring low s(v) also limits cross-slope.
import type { Cell, RouteParams, RouteResult } from "@ares/contracts";
import { VALIDITY } from "@ares/contracts";
import { cellCenter, costMultiplier, type TerrainGrid } from "@ares/core";
import { gateGrid } from "./traverse.ts";

export const CONSERVATIVE = { version: "conservative-1.0.0", gate_deg: 25, comfort_deg: 5, weight: 4 } as const;

const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]] as const;

/** Preference penalty of a cell, 0 (gentle) to 1 (at the gate), from its neighbourhood slope plus the uncertainty margin. */
export function slopePenalty(neighbourhoodSlopeDeg: number, sigmaDeg: number): number {
  const t = Math.min(1, Math.max(0, (neighbourhoodSlopeDeg + sigmaDeg - CONSERVATIVE.comfort_deg) / (CONSERVATIVE.gate_deg - CONSERVATIVE.comfort_deg)));
  return t * t;
}

export function conservativeNotes(sigmaDeg: number): string[] {
  return [
    `Conservative Terrain (${CONSERVATIVE.version}): prefers ground under ${CONSERVATIVE.comfort_deg}° and pays up to ${CONSERVATIVE.weight + 1} times the walking cost for a step onto steeper ground, counting the steepest slope in the 3×3 cells around it.`,
    `Never enters a cell whose 3×3 neighbourhood is steeper than ${CONSERVATIVE.gate_deg}°, at either endpoint or in between. Steps above 24.2° are excluded as on the terrain-aware route. Experimental parameters, not safety limits.`,
    sigmaDeg > 0 ? `DEM uncertainty: ${sigmaDeg}° is added to every slope before the preference is computed (disagreement between independent stereo models).` : "DEM uncertainty: not quantified for this grid, so no margin is added. At 20 m cells this strategy can only see slopes tens of metres long.",
    "Weather, dust and radiation do not enter this route: no spatial dataset for them exists in the build.",
  ];
}

/** The conservative route between two cells, or a stated failure. `like` supplies version fields and notes of the same grid. */
export function planConservative(grid: TerrainGrid, start: Cell, goal: Cell, params: RouteParams, sigmaDeg: number, like: RouteResult): RouteResult {
  const { nx, ny, dx_ground_m: dx, dy_ground_m: dy } = grid.meta, near = gateGrid(grid, true).slope; // 3x3 maximum of the slope raster
  const notes = conservativeNotes(sigmaDeg);
  const none = (status: RouteResult["status"], why: string): RouteResult => ({
    ...like, status, cells: [], vertices_proj: [], profile: [], length_horizontal_m: 0, length_surface_m: 0, ascent_m: 0, descent_m: 0, max_edge_grade: 0, cost_flat_equiv_m: 0,
    baseline: null, algorithm_version: CONSERVATIVE.version, constraint_notes: [...notes, why],
  });
  const valid = (k: number) => grid.validity[k] === VALIDITY.VALID || grid.validity[k] === VALIDITY.VALID_SLOPE_UNDEFINED;
  const open = (k: number) => valid(k) && near[k] <= CONSERVATIVE.gate_deg; // NaN slope fails
  const s = start.row * nx + start.col, t = goal.row * nx + goal.col;
  if (!valid(s) || !valid(t)) return none("INVALID_ENDPOINT_NODATA", "An endpoint has no terrain data.");
  if (!open(s) || !open(t)) return none("ENDPOINT_BLOCKED_BY_POLICY", `No supported conservative corridor: the ${open(s) ? "destination" : "start"} lies on or beside ground steeper than ${CONSERVATIVE.gate_deg}° (${(open(s) ? near[t] : near[s]).toFixed(1)}° nearby). Nothing was relaxed.`);

  // Dijkstra with a binary heap of (cost, node)
  const dist = new Float64Array(nx * ny).fill(Infinity), prev = new Int32Array(nx * ny).fill(-1), done = new Uint8Array(nx * ny);
  const heapK: number[] = [], heapN: number[] = [];
  const push = (key: number, node: number) => {
    let i = heapK.length;
    heapK.push(key); heapN.push(node);
    while (i > 0) { const p = (i - 1) >> 1; if (heapK[p] <= key) break; heapK[i] = heapK[p]; heapN[i] = heapN[p]; i = p; }
    heapK[i] = key; heapN[i] = node;
  };
  const pop = () => {
    const node = heapN[0], key = heapK.pop()!, last = heapN.pop()!;
    if (heapK.length) {
      let i = 0;
      for (;;) { let c = 2 * i + 1; if (c >= heapK.length) break; if (c + 1 < heapK.length && heapK[c + 1] < heapK[c]) c += 1; if (heapK[c] >= key) break; heapK[i] = heapK[c]; heapN[i] = heapN[c]; i = c; }
      heapK[i] = key; heapN[i] = last;
    }
    return node;
  };
  dist[s] = 0;
  push(0, s);
  while (heapK.length) {
    const u = pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === t) break;
    const r = Math.floor(u / nx), c = u % nx;
    for (const [dr, dc] of DIRS) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= ny || cc >= nx) continue;
      const v = rr * nx + cc;
      if (done[v] || !open(v)) continue;
      if (dr && dc && !(open(r * nx + cc) && open(rr * nx + c))) continue; // no corner cutting past excluded cells
      const L = dr && dc ? Math.sqrt(dx * dx + dy * dy) : dr ? dy : dx, g = (grid.dem[v] - grid.dem[u]) / L;
      if (Math.abs(g) > params.g_max) continue;
      const alt = dist[u] + L * costMultiplier(params.cost_curve, g) * (1 + CONSERVATIVE.weight * slopePenalty(near[v], sigmaDeg));
      if (alt < dist[v] - 1e-12) { dist[v] = alt; prev[v] = u; push(alt, v); }
    }
  }
  if (!Number.isFinite(dist[t])) return none("NO_ROUTE", `No supported conservative corridor: ground gentler than ${CONSERVATIVE.gate_deg}° (with its neighbours) does not connect the two points within the step-grade limit. Nothing was relaxed.`);

  const idx: number[] = [];
  for (let k = t; k !== -1; k = prev[k]) idx.push(k);
  idx.reverse();
  const cells = idx.map((k) => ({ row: Math.floor(k / nx), col: k % nx }));
  let len = 0, surf = 0, up = 0, down = 0, maxG = 0, walk = 0;
  const profile = [{ s_m: 0, h_m: grid.dem[idx[0]], grade: 0 }];
  for (let k = 1; k < idx.length; k++) {
    const a = cells[k - 1], b = cells[k], dr = b.row - a.row, dc = b.col - a.col;
    const L = dr && dc ? Math.sqrt(dx * dx + dy * dy) : dr ? dy : dx, dz = grid.dem[idx[k]] - grid.dem[idx[k - 1]];
    len += L;
    surf += Math.sqrt(L * L + dz * dz);
    if (dz > 0) up += dz; else down -= dz;
    maxG = Math.max(maxG, Math.abs(dz / L));
    walk += L * costMultiplier(params.cost_curve, dz / L);
    profile.push({ s_m: len, h_m: grid.dem[idx[k]], grade: dz / L });
  }
  return {
    ...like, status: "OK", cells, vertices_proj: cells.map((c) => cellCenter(grid.meta, c)), length_horizontal_m: len, length_surface_m: surf, ascent_m: up, descent_m: down,
    max_edge_grade: maxG, cost_flat_equiv_m: walk, // the same walking-cost measure as the other routes, so the three can be compared
    profile, baseline: null, algorithm_version: CONSERVATIVE.version,
    constraint_notes: [...notes, `This route's own objective (walking cost times the slope preference): ${dist[t].toFixed(1)}; its plain walking cost is ${walk.toFixed(1)} flat-equivalent m.`],
  };
}

/** The objective of a cell path under this strategy, or null if it breaks a hard rule. For tests and audits. */
export function conservativeCost(grid: TerrainGrid, cells: Cell[], params: RouteParams, sigmaDeg: number): number | null {
  const { nx, dx_ground_m: dx, dy_ground_m: dy } = grid.meta, near = gateGrid(grid, true).slope;
  const open = (r: number, c: number) => { const k = r * nx + c; return (grid.validity[k] === VALIDITY.VALID || grid.validity[k] === VALIDITY.VALID_SLOPE_UNDEFINED) && near[k] <= CONSERVATIVE.gate_deg; };
  if (!cells.length || !cells.every((c) => open(c.row, c.col))) return null;
  let cost = 0;
  for (let k = 1; k < cells.length; k++) {
    const a = cells[k - 1], b = cells[k], dr = b.row - a.row, dc = b.col - a.col;
    if (Math.max(Math.abs(dr), Math.abs(dc)) !== 1) return null;
    if (dr && dc && !(open(a.row, b.col) && open(b.row, a.col))) return null;
    const L = dr && dc ? Math.sqrt(dx * dx + dy * dy) : dr ? dy : dx, g = (grid.dem[b.row * nx + b.col] - grid.dem[a.row * nx + a.col]) / L;
    if (Math.abs(g) > params.g_max) return null;
    cost += L * costMultiplier(params.cost_curve, g) * (1 + CONSERVATIVE.weight * slopePenalty(near[b.row * nx + b.col], sigmaDeg));
  }
  return cost;
}
