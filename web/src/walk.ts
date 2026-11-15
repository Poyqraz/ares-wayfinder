// Geometry shared by the first-person EVA view and the route audit: the DEM surface exactly as the 3D mesh draws it,
// the walker's eye and gaze on a computed route, and an any-angle "smoothed" line that is re-checked on that surface.
// Nothing here changes a planned route; the grid route stays the validated reference.
import type { ProjPoint, RouteMode, RouteParams, RouteResult } from "@ares/contracts";
import { VALIDITY } from "@ares/contracts";
import { costMultiplier, type TerrainGrid } from "@ares/core";

export const GUIDANCE_GAP_M = 3; // metres of route between guidance chevrons
export const EYE_HEIGHT_M = 1.7; // standing eye height used for the simulated view; not a suit or crew measurement

const routable = (v: number) => v === VALIDITY.VALID || v === VALIDITY.VALID_SLOPE_UNDEFINED;

/** Height of the DEM surface at a projected point, on the same triangles as buildTerrainMesh (each cell-centre quad is
 *  split along its SW-NE diagonal). NaN outside the cell-centre hull or where a corner is not routable terrain. */
export function surfaceHeight(grid: TerrainGrid, E: number, N: number): number {
  const m = grid.meta, fc = (E - m.x0) / m.dx_proj - 0.5, fr = (m.y0 - N) / m.dy_proj - 0.5;
  const eps = 1e-9;
  if (!(fc >= -eps && fr >= -eps && fc <= m.nx - 1 + eps && fr <= m.ny - 1 + eps)) return NaN;
  const c0 = Math.min(m.nx - 2, Math.max(0, Math.floor(fc))), r0 = Math.min(m.ny - 2, Math.max(0, Math.floor(fr)));
  const u = fc - c0, v = fr - r0, k = r0 * m.nx + c0;
  const ks = [k, k + 1, k + m.nx, k + m.nx + 1];
  if (!ks.every((i) => routable(grid.validity[i]) && Number.isFinite(grid.dem[i]))) return NaN;
  const nw = grid.dem[ks[0]], ne = grid.dem[ks[1]], sw = grid.dem[ks[2]], se = grid.dem[ks[3]];
  return u + v <= 1 ? nw + u * (ne - nw) + v * (sw - nw) : se + (1 - u) * (sw - se) + (1 - v) * (ne - se);
}

/** Ground metres between two projected points (the grid's own E-W and N-S scales). */
export function groundDistance(grid: TerrainGrid, a: ProjPoint, b: ProjPoint): number {
  const m = grid.meta;
  return Math.hypot(((b.E - a.E) * m.dx_ground_m) / m.dx_proj, ((b.N - a.N) * m.dy_ground_m) / m.dy_proj);
}

/** Point of the route polyline at a horizontal distance along it, with the DEM elevation interpolated on the route. */
export function routePoint(route: RouteResult, s: number): ProjPoint & { h: number; k: number } {
  const p = route.profile, v = route.vertices_proj;
  let k = 0;
  while (k < p.length - 2 && p[k + 1].s_m <= s) k += 1;
  const t = Math.min(1, Math.max(0, (s - p[k].s_m) / Math.max(1e-9, p[k + 1].s_m - p[k].s_m)));
  return { E: v[k].E + (v[k + 1].E - v[k].E) * t, N: v[k].N + (v[k + 1].N - v[k].N) * t, h: p[k].h_m + (p[k + 1].h_m - p[k].h_m) * t, k };
}

export interface WalkPose {
  eye: ProjPoint & { h: number };
  look: ProjPoint & { h: number };
  ground_m: number; // DEM surface under the eye
}

/** Eye and gaze of a walker standing on the route at distance s: eye height above the drawn surface, looking at a
 *  point further along the same route (so slope and turns steer the view). Requires a route with at least two vertices. */
export function walkPose(grid: TerrainGrid, route: RouteResult, s: number, eyeM = EYE_HEIGHT_M): WalkPose {
  const total = route.length_horizontal_m;
  const ahead = Math.max(12, 3 * Math.max(grid.meta.dx_ground_m, grid.meta.dy_ground_m)); // far enough that a grid step does not swing the gaze
  const here = routePoint(route, s);
  let to: ProjPoint = routePoint(route, Math.min(total, s + ahead));
  if (s + ahead > total) {
    // past the goal: keep looking along the final approach instead of down at the feet
    const back = routePoint(route, Math.max(0, total - ahead)), f = (s + ahead - total) / ahead;
    to = { E: to.E + (to.E - back.E) * f, N: to.N + (to.N - back.N) * f };
  }
  const surface = surfaceHeight(grid, here.E, here.N);
  const ground = Number.isFinite(surface) ? Math.max(surface, here.h) : here.h; // never below the drawn mesh or the route sample
  const far = surfaceHeight(grid, to.E, to.N);
  return { eye: { E: here.E, N: here.N, h: ground + eyeM }, look: { ...to, h: (Number.isFinite(far) ? far : ground) + eyeM * 0.6 }, ground_m: ground };
}

/** The walker's eye and gaze as DRAWN, on terrain whose heights are multiplied by `ve` above hMin. Position along the
 *  route is unchanged; only the drawn height is. Eye height is not exaggerated, so the camera stands on the drawn ground. */
export function displayPose(grid: TerrainGrid, route: RouteResult, s: number, ve: number, hMin: number, eyeM = EYE_HEIGHT_M) {
  const p = walkPose(grid, route, s, eyeM), y = (h: number) => (h - hMin) * ve, surface = surfaceHeight(grid, p.eye.E, p.eye.N);
  const eyeY = y(p.ground_m) + eyeM;
  return {
    eye: { E: p.eye.E, N: p.eye.N, y: eyeY }, look: { E: p.look.E, N: p.look.N, y: y(p.look.h - eyeM * 0.6) + eyeM * 0.6 },
    clearance_m: eyeY - y(Number.isFinite(surface) ? surface : p.ground_m), // eye above the drawn surface
  };
}

export interface GuidanceMark extends ProjPoint { s_m: number; h: number; bearing_deg: number; slope_deg: number }

/** Fixed guidance points on the route every `gap` metres (the chevrons of the EVA view), each on the DEM surface. */
export function guidanceMarks(grid: TerrainGrid, route: RouteResult, gap: number): GuidanceMark[] {
  const out: GuidanceMark[] = [], v = route.vertices_proj, p = route.profile, m = grid.meta;
  for (let s = gap; s < route.length_horizontal_m; s += gap) {
    const q = routePoint(route, s), a = v[q.k], b = v[q.k + 1], surface = surfaceHeight(grid, q.E, q.N);
    out.push({
      E: q.E, N: q.N, s_m: s, h: Number.isFinite(surface) ? Math.max(surface, q.h) : q.h,
      bearing_deg: (Math.atan2(((b.E - a.E) * m.dx_ground_m) / m.dx_proj, ((b.N - a.N) * m.dy_ground_m) / m.dy_proj) * 180) / Math.PI,
      slope_deg: (Math.atan(p[q.k + 1].grade) * 180) / Math.PI,
    });
  }
  return out;
}

export interface WalkLine {
  mode: RouteMode;
  vertices_proj: ProjPoint[]; // anchor points: a subset of the grid route's vertices, joined by straight segments
  profile: { s_m: number; h_m: number; grade: number }[]; // dense samples along the line on the DEM surface
  length_horizontal_m: number;
  length_surface_m: number;
  ascent_m: number;
  descent_m: number;
  max_grade: number;
  cost_flat_equiv_m: number; // same cost curve as the planner, summed over the dense samples
  grid_cost_flat_equiv_m: number; // the planner's cost of the grid route it was derived from
  turns_grid: number; // heading changes on the grid route
  turns: number; // heading changes on this line
}

/** Any-angle line derived from a grid route by replacing runs of grid steps with straight segments. A segment is taken
 *  only if every sample lies on routable terrain, and (terrain mode) no sampled step exceeds g_max and the segment's
 *  model cost is not higher than the grid steps it replaces. The result is therefore never worse than the grid route
 *  under the same cost curve, and is re-checked on the DEM surface, but it is NOT a new optimum: the planner did not
 *  search it. Returns null for a route that is not OK. */
export function smoothRoute(grid: TerrainGrid, route: RouteResult, mode: RouteMode, params: RouteParams): WalkLine | null {
  if (route.status !== "OK" || route.vertices_proj.length < 2) return null;
  const v = route.vertices_proj, p = route.profile, n = v.length;
  const step = Math.min(grid.meta.dx_ground_m, grid.meta.dy_ground_m) / 2;
  const cost = (L: number, g: number) => (mode === "terrain" ? L * costMultiplier(params.cost_curve, g) : L);
  const gridCost = (i: number, j: number) => { let c = 0; for (let k = i + 1; k <= j; k++) c += cost(p[k].s_m - p[k - 1].s_m, p[k].grade); return c; };
  const gate = params.cell_slope_gate_deg, gm = grid.meta;
  // under a terrain-slope gate, the cell under every sample must pass it (NaN slope fails), exactly like a planned cell
  const gated = (E: number, N: number) => gate !== null && !(grid.slope[Math.min(gm.ny - 1, Math.max(0, Math.floor((gm.y0 - N) / gm.dy_proj))) * gm.nx + Math.min(gm.nx - 1, Math.max(0, Math.floor((E - gm.x0) / gm.dx_proj)))] <= gate);
  type Seg = { pts: { L: number; h: number; g: number }[]; cost: number };
  const straight = (i: number, j: number): Seg | null => {
    const L = groundDistance(grid, v[i], v[j]), pieces = Math.max(1, Math.ceil(L / step)), l = L / pieces;
    const seg: Seg = { pts: [], cost: 0 };
    let h0 = p[i].h_m;
    for (let q = 1; q <= pieces; q++) {
      const t = q / pieces, E = v[i].E + (v[j].E - v[i].E) * t, N = v[i].N + (v[j].N - v[i].N) * t, h = q === pieces ? p[j].h_m : surfaceHeight(grid, E, N);
      if (!Number.isFinite(h) || gated(E, N)) return null;
      const g = (h - h0) / l;
      if (mode === "terrain" && Math.abs(g) > params.g_max) return null;
      seg.pts.push({ L: l, h, g });
      seg.cost += cost(l, g);
      h0 = h;
    }
    return seg;
  };
  const line: WalkLine = { mode, vertices_proj: [v[0]], profile: [{ s_m: 0, h_m: p[0].h_m, grade: 0 }], length_horizontal_m: 0, length_surface_m: 0, ascent_m: 0, descent_m: 0,
    max_grade: 0, cost_flat_equiv_m: 0, grid_cost_flat_equiv_m: gridCost(0, n - 1), turns_grid: 0, turns: 0 };
  const push = (L: number, h: number, g: number) => {
    const dz = g * L;
    line.length_horizontal_m += L;
    line.length_surface_m += Math.hypot(L, dz);
    if (dz > 0) line.ascent_m += dz; else line.descent_m -= dz;
    line.max_grade = Math.max(line.max_grade, Math.abs(g));
    line.cost_flat_equiv_m += cost(L, g);
    line.profile.push({ s_m: line.length_horizontal_m, h_m: h, grade: g });
  };
  for (let i = 0; i < n - 1;) {
    let j = i + 1, seg: Seg | null = null;
    for (let far = n - 1; far > i + 1; far--) {
      const s = straight(i, far);
      if (s && s.cost <= gridCost(i, far) * (1 + 1e-12)) { j = far; seg = s; break; }
    }
    if (seg) for (const q of seg.pts) push(q.L, q.h, q.g);
    else push(p[j].s_m - p[i].s_m, p[j].h_m, p[j].grade); // keep the planner's own step
    line.vertices_proj.push(v[j]);
    i = j;
  }
  const turns = (w: ProjPoint[]) => {
    let c = 0;
    for (let k = 1; k < w.length - 1; k++) {
      const a = Math.atan2(w[k].E - w[k - 1].E, w[k].N - w[k - 1].N), b = Math.atan2(w[k + 1].E - w[k].E, w[k + 1].N - w[k].N);
      if (Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))) > 1e-6) c += 1;
    }
    return c;
  };
  line.turns_grid = turns(v);
  line.turns = turns(line.vertices_proj);
  return line;
}
