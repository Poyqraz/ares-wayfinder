// S8 route audit: numerical checks of the planner on the real bundles. Read-only; writes analysis/s8/results/route_audit.json.
// Run from the repo root: node --experimental-strip-types analysis/s8/route_audit.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { evaluatePath, geoToProj, planRoute, projToCell, type TerrainGrid } from "../../core/src/index.ts";
import { loadBase } from "../../web/src/base.ts";
import { fail, type Checked } from "../../web/src/integrity.ts";
import { loadRoiA } from "../../web/src/load.ts";
import { demoEndpoints, ROUTE_PARAMS } from "../../web/src/plan.ts";
import { loadM0A } from "../../web/src/regions.ts";
import { groundDistance, smoothRoute } from "../../web/src/walk.ts";

type Cell = { row: number; col: number };
globalThis.URL.createObjectURL ??= () => "blob:audit";
const pub = new URL("../../web/public/", import.meta.url);
const bytes = (url: string) => new Uint8Array(readFileSync(new URL(url.replace(/^\//, ""), pub)));
const get = async (url: string): Promise<Checked<Uint8Array>> => { try { return { ok: true, value: bytes(url) }; } catch { return fail("DATASET INTEGRITY", url); } };
globalThis.fetch = (async (url: unknown) => { try { return new Response(bytes(String(url))); } catch { return new Response(null, { status: 404 }); } }) as typeof fetch;

const plan = (g: TerrainGrid, a: Cell, b: Cell, mode: "distance" | "terrain", heuristic = true) =>
  planRoute(g, { start: { frame: "ROI_GRID", ...a }, goal: { frame: "ROI_GRID", ...b }, mode, params: ROUTE_PARAMS, dataset_version: g.meta.dataset_version }, { heuristic });
const deg = (g: number) => (Math.atan(g) * 180) / Math.PI;
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const round = (x: number, d = 3) => Number(x.toFixed(d));

function auditPair(grid: TerrainGrid, name: string, a: Cell, b: Cell) {
  const out: Record<string, unknown> = { name, start: a, goal: b };
  for (const mode of ["distance", "terrain"] as const) {
    const r = plan(grid, a, b, mode), dij = plan(grid, a, b, mode, false), back = plan(grid, b, a, mode);
    if (r.status !== "OK") { out[mode] = { status: r.status }; continue; }
    const cost = mode === "terrain" ? r.cost_flat_equiv_m : r.length_horizontal_m;
    const straight = groundDistance(grid, r.vertices_proj[0], r.vertices_proj.at(-1)!);
    const line = smoothRoute(grid, r, mode, ROUTE_PARAMS)!;
    out[mode] = {
      length_m: round(r.length_horizontal_m), surface_length_m: round(r.length_surface_m), ascent_m: round(r.ascent_m, 2), descent_m: round(r.descent_m, 2),
      cost_flat_equiv_m: round(r.cost_flat_equiv_m), steepest_step_deg: round(deg(r.max_edge_grade), 2), exceeds_24_2_deg: r.max_edge_grade > ROUTE_PARAMS.g_max,
      astar_minus_dijkstra: Math.abs(cost - (mode === "terrain" ? dij.cost_flat_equiv_m : dij.length_horizontal_m)),
      path_rescored_minus_cost: Math.abs((evaluatePath(grid, r.cells, mode, ROUTE_PARAMS) ?? NaN) - r.cost_flat_equiv_m),
      reverse_cost_flat_equiv_m: back.status === "OK" ? round(back.cost_flat_equiv_m) : back.status,
      straight_line_m: round(straight), grid_detour_percent: round((r.length_horizontal_m / straight - 1) * 100, 2), turns: line.turns_grid,
      smoothed: { length_m: round(line.length_horizontal_m), cost_flat_equiv_m: round(line.cost_flat_equiv_m), grid_cost_flat_equiv_m: round(line.grid_cost_flat_equiv_m),
        ascent_m: round(line.ascent_m, 2), descent_m: round(line.descent_m, 2), steepest_sample_deg: round(deg(line.max_grade), 2), turns: line.turns, anchors: line.vertices_proj.length,
        length_saving_percent: round((1 - line.length_horizontal_m / r.length_horizontal_m) * 100, 2), cost_saving_percent: round((1 - line.cost_flat_equiv_m / line.grid_cost_flat_equiv_m) * 100, 2) },
    };
  }
  return out;
}

/** A* against Dijkstra (same edge model, no heuristic) on random routable pairs. */
function randomParity(grid: TerrainGrid, pairs: number, seed: number) {
  const next = rng(seed), { nx, ny } = grid.meta;
  const pick = (): Cell => { for (;;) { const c = { row: Math.floor(next() * ny), col: Math.floor(next() * nx) }; if (grid.validity[c.row * nx + c.col] === 0) return c; } };
  const res = { pairs, distance_max_abs_diff: 0, terrain_max_rel_diff: 0, terrain_no_route: 0, terrain_route_differs_from_distance: 0 };
  for (let k = 0; k < pairs; k++) {
    const a = pick(), b = pick();
    const d = plan(grid, a, b, "distance"), d0 = plan(grid, a, b, "distance", false);
    res.distance_max_abs_diff = Math.max(res.distance_max_abs_diff, Math.abs(d.length_horizontal_m - d0.length_horizontal_m));
    const t = plan(grid, a, b, "terrain"), t0 = plan(grid, a, b, "terrain", false);
    if (t.status !== t0.status) throw new Error(`A* and Dijkstra disagree on status for pair ${k}`);
    if (t.status !== "OK") { res.terrain_no_route += 1; continue; }
    res.terrain_max_rel_diff = Math.max(res.terrain_max_rel_diff, Math.abs(t.cost_flat_equiv_m - t0.cost_flat_equiv_m) / t0.cost_flat_equiv_m);
    if (Math.abs(t.length_horizontal_m - d.length_horizontal_m) > 1e-6) res.terrain_route_differs_from_distance += 1;
  }
  return res;
}

const m0a = await loadM0A(get), roi = await loadRoiA(), base = await loadBase(get);
if (!m0a.ok || !roi.ok || !base.ok) throw new Error("bundles did not load");
const ends = demoEndpoints(roi.value.meta, roi.value.pois);
if (!ends.ok) throw new Error("ROI-A endpoints");
const baseCell = projToCell(m0a.value.meta, geoToProj(m0a.value.meta, { lat: base.value.scenario.sites.base.lat, lon: base.value.scenario.sites.base.lon }))!;
const result = {
  generated_by: "analysis/s8/route_audit.ts", algorithm: "core/src/route.ts (unchanged)", params: ROUTE_PARAMS,
  grids: {
    m0a: { dataset_version: m0a.value.meta.dataset_version, cell_m: [m0a.value.meta.dx_ground_m, m0a.value.meta.dy_ground_m], size: [m0a.value.meta.nx, m0a.value.meta.ny] },
    roi_a: { dataset_version: roi.value.meta.dataset_version, cell_m: [roi.value.meta.dx_ground_m, roi.value.meta.dy_ground_m], size: [roi.value.meta.nx, roi.value.meta.ny] },
  },
  routes: [
    auditPair(m0a.value.grid, "M0-A reference (M0 rover position to A rover position)", m0a.value.start, m0a.value.goal),
    auditPair(m0a.value.grid, "M0-A: ARES Base (hypothetical) to A rover position", baseCell, m0a.value.goal),
    auditPair(roi.value.grid, "ROI-A reference (Rochette/Montdenier to Landing)", ends.value.start, ends.value.goal),
  ],
  random_parity: { m0a: randomParity(m0a.value.grid, 60, 11), roi_a: randomParity(roi.value.grid, 300, 7) },
};
mkdirSync(new URL("results/", import.meta.url), { recursive: true });
writeFileSync(new URL("results/route_audit.json", import.meta.url), JSON.stringify(result, null, 1) + "\n");
console.log(JSON.stringify(result, null, 1));
