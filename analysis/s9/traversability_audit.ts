// S9 traversability audit: what the terrain looks like under the planned routes, and what an experimental terrain-slope
// gate does to them. Read-only on the bundles; writes analysis/s9/results/traversability.json (route cells included, so
// pipeline/traversability_check.py can recompute everything independently from the raw DEM and the other stereo pairs).
// Run from the repo root: node --experimental-strip-types analysis/s9/traversability_audit.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { compareToBaseline, geoToProj, planRoute, projToCell, type TerrainGrid } from "../../core/src/index.ts";
import { loadBase } from "../../web/src/base.ts";
import { fail, type Checked } from "../../web/src/integrity.ts";
import { loadRoiA } from "../../web/src/load.ts";
import { demoEndpoints, ROUTE_PARAMS } from "../../web/src/plan.ts";
import { loadM0A } from "../../web/src/regions.ts";
import { cellGradient, gatedParams, gateGrid, routeTerrain, SLOPE_GATES_DEG, summarizeTerrain, type SlopeGate } from "../../web/src/traverse.ts";
import { smoothRoute } from "../../web/src/walk.ts";

type Cell = { row: number; col: number };
globalThis.URL.createObjectURL ??= () => "blob:audit";
const pub = new URL("../../web/public/", import.meta.url);
const bytes = (url: string) => new Uint8Array(readFileSync(new URL(url.replace(/^\//, ""), pub)));
const get = async (url: string): Promise<Checked<Uint8Array>> => { try { return { ok: true, value: bytes(url) }; } catch { return fail("DATASET INTEGRITY", url); } };
globalThis.fetch = (async (url: unknown) => { try { return new Response(bytes(String(url))); } catch { return new Response(null, { status: 404 }); } }) as typeof fetch;
const r3 = (x: number, d = 2) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);

function plan(grid: TerrainGrid, a: Cell, b: Cell, mode: "distance" | "terrain", gate: SlopeGate, heuristic = true) {
  return planRoute(grid, { start: { frame: "ROI_GRID", ...a }, goal: { frame: "ROI_GRID", ...b }, mode, params: gatedParams(ROUTE_PARAMS, gate), dataset_version: grid.meta.dataset_version }, { heuristic });
}

/** The grid's own slope raster against a slope recomputed here from the DEM (Horn 3x3, ground spacing). */
function slopeRasterCheck(grid: TerrainGrid) {
  const { nx, ny } = grid.meta;
  let worst = 0, n = 0;
  const hist: Record<string, number> = { "0-5": 0, "5-10": 0, "10-15": 0, "15-20": 0, "20-25": 0, "25-30": 0, "30+": 0 };
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
    const s = grid.slope[r * nx + c];
    if (Number.isFinite(s)) hist[s >= 30 ? "30+" : `${Math.floor(s / 5) * 5}-${Math.floor(s / 5) * 5 + 5}`] += 1;
    const g = cellGradient(grid, r, c);
    if (!g || !Number.isFinite(s)) continue;
    worst = Math.max(worst, Math.abs((Math.atan(Math.hypot(g.east, g.north)) * 180) / Math.PI - s));
    n += 1;
  }
  const total = Object.values(hist).reduce((a, b) => a + b, 0);
  return { cells_compared: n, max_abs_difference_deg: worst, slope_share_percent: Object.fromEntries(Object.entries(hist).map(([k, v]) => [k, r3((100 * v) / total)])) };
}

function describe(grid: TerrainGrid, a: Cell, b: Cell, gate: SlopeGate, clearance = false) {
  const pg = gate === null ? grid : gateGrid(grid, clearance); // what the planner sees; everything below is measured on the original grid
  const t = plan(pg, a, b, "terrain", gate), d = plan(pg, a, b, "distance", gate);
  if (t.status !== "OK") return { gate_deg: gate, clearance, status: t.status, note: "no corridor under this gate; nothing was relaxed" };
  const dij = plan(pg, a, b, "terrain", gate, false);
  const steps = routeTerrain(grid, t), sum = summarizeTerrain(steps);
  const cmp = d.status === "OK" ? compareToBaseline(pg, t, d, gatedParams(ROUTE_PARAMS, gate)) : null;
  const line = smoothRoute(pg, t, "terrain", gatedParams(ROUTE_PARAMS, gate));
  const worst = (key: "cell_slope_deg" | "cross_slope_deg" | "grade_deg" | "relief_m") => [...steps].filter((q) => Number.isFinite(q[key])).sort((x, y) => Math.abs(y[key]) - Math.abs(x[key])).slice(0, 5)
    .map((q) => ({ s_m: r3(q.s_m, 1), grade_deg: r3(q.grade_deg, 1), cell_slope_deg: r3(q.cell_slope_deg, 1), cross_slope_deg: r3(q.cross_slope_deg, 1), relief_m: r3(q.relief_m) }));
  return {
    gate_deg: gate, clearance, status: t.status, length_m: r3(t.length_horizontal_m, 3), cost_flat_equiv_m: r3(t.cost_flat_equiv_m, 3), ascent_m: r3(t.ascent_m), descent_m: r3(t.descent_m),
    astar_minus_dijkstra: Math.abs(t.cost_flat_equiv_m - dij.cost_flat_equiv_m), relation_to_distance_route: cmp?.relation ?? d.status,
    distance_route_length_m: d.status === "OK" ? r3(d.length_horizontal_m, 3) : d.status,
    max_step_grade_deg: r3(sum.max_grade_deg), max_cell_slope_deg: r3(sum.max_cell_slope_deg), max_cross_slope_deg: r3(sum.max_cross_slope_deg), max_relief_3x3_m: r3(sum.max_relief_m),
    metres_on_ground_steeper_than: Object.fromEntries(Object.entries(sum.metres_over).map(([k, v]) => [`${k}deg`, r3(v, 1)])),
    metres_where_cross_slope_exceeds_grade: r3(sum.cross_over_grade_m, 1),
    steepest_ground: worst("cell_slope_deg"), largest_cross_slope: worst("cross_slope_deg"), steepest_steps: worst("grade_deg"), largest_relief: worst("relief_m"),
    smoothed_line: line ? { length_m: r3(line.length_horizontal_m, 1), cost_flat_equiv_m: r3(line.cost_flat_equiv_m, 1), turns: line.turns } : null,
    cells: t.cells.map((c) => [c.row, c.col]),
  };
}

const m0a = await loadM0A(get), roi = await loadRoiA(), base = await loadBase(get);
if (!m0a.ok || !roi.ok || !base.ok) throw new Error("bundles did not load");
const ends = demoEndpoints(roi.value.meta, roi.value.pois);
if (!ends.ok) throw new Error("ROI-A endpoints");
const baseCell = projToCell(m0a.value.meta, geoToProj(m0a.value.meta, { lat: base.value.scenario.sites.base.lat, lon: base.value.scenario.sites.base.lon }))!;
const cases: [string, string, TerrainGrid, Cell, Cell][] = [
  ["m0a_reference", "M0-A reference: M0 rover position to A rover position", m0a.value.grid, m0a.value.start, m0a.value.goal],
  ["m0a_base_to_a", "M0-A: ARES Base (hypothetical) to A rover position", m0a.value.grid, baseCell, m0a.value.goal],
  ["roi_a_reference", "ROI-A reference: Rochette/Montdenier to Landing", roi.value.grid, ends.value.start, ends.value.goal],
];
/** What the reference planner lets through in general: terrain-aware routes between random routable points. */
function stress(grid: TerrainGrid, pairs: number, seed: number) {
  const next = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const { nx, ny } = grid.meta, pick = (): Cell => { for (;;) { const c = { row: Math.floor(next() * ny), col: Math.floor(next() * nx) }; if (grid.validity[c.row * nx + c.col] === 0) return c; } };
  const res = { pairs, routes_found: 0, routes_on_ground_over_25deg: 0, routes_on_ground_over_30deg: 0, routes_with_cross_slope_over_20deg: 0, max_step_grade_deg: 0,
    worst: null as null | { start: Cell; goal: Cell; max_cell_slope_deg: number | null; max_cross_slope_deg: number | null; max_step_grade_deg: number | null; metres_over_25deg: number | null },
    gate20: { found: 0, endpoint_blocked: 0, no_route: 0, max_cell_slope_deg: 0, mean_length_increase_percent: 0 } };
  let worst = -1, inc = 0;
  for (let k = 0; k < pairs; k++) {
    const a = pick(), b = pick(), t = plan(grid, a, b, "terrain", null);
    if (t.status !== "OK") continue;
    const sum = summarizeTerrain(routeTerrain(grid, t));
    res.routes_found += 1;
    res.max_step_grade_deg = Math.max(res.max_step_grade_deg, sum.max_grade_deg);
    if (sum.max_cell_slope_deg > 25) res.routes_on_ground_over_25deg += 1;
    if (sum.max_cell_slope_deg > 30) res.routes_on_ground_over_30deg += 1;
    if (sum.max_cross_slope_deg > 20) res.routes_with_cross_slope_over_20deg += 1;
    if (sum.max_cell_slope_deg > worst) { worst = sum.max_cell_slope_deg; res.worst = { start: a, goal: b, max_cell_slope_deg: r3(sum.max_cell_slope_deg), max_cross_slope_deg: r3(sum.max_cross_slope_deg), max_step_grade_deg: r3(sum.max_grade_deg), metres_over_25deg: r3(sum.metres_over[25], 1) }; }
    const g = plan(grid, a, b, "terrain", 20);
    if (g.status === "OK") { res.gate20.found += 1; res.gate20.max_cell_slope_deg = Math.max(res.gate20.max_cell_slope_deg, summarizeTerrain(routeTerrain(grid, g)).max_cell_slope_deg); inc += g.length_horizontal_m / t.length_horizontal_m - 1; }
    else if (g.status === "ENDPOINT_BLOCKED_BY_POLICY") res.gate20.endpoint_blocked += 1;
    else res.gate20.no_route += 1;
  }
  res.max_step_grade_deg = r3(res.max_step_grade_deg)!;
  res.gate20.max_cell_slope_deg = r3(res.gate20.max_cell_slope_deg)!;
  res.gate20.mean_length_increase_percent = r3((100 * inc) / Math.max(1, res.gate20.found))!;
  return res;
}

const result = {
  generated_by: "analysis/s9/traversability_audit.ts", algorithm: "core/src/route.ts (unchanged); gate = RouteParams.cell_slope_gate_deg", reference_params: ROUTE_PARAMS,
  random_routes_reference_planner: { m0a: stress(m0a.value.grid, 80, 21) },
  slope_raster: { m0a: slopeRasterCheck(m0a.value.grid), roi_a: slopeRasterCheck(roi.value.grid) },
  routes: Object.fromEntries(cases.map(([id, name, grid, a, b]) => [id, {
    name, dataset_version: grid.meta.dataset_version, cell_m: [grid.meta.dx_ground_m, grid.meta.dy_ground_m], start: a, goal: b,
    endpoint_slope_deg: [r3(grid.slope[a.row * grid.meta.nx + a.col]), r3(grid.slope[b.row * grid.meta.nx + b.col])],
    by_gate: SLOPE_GATES_DEG.flatMap((gate) => (gate === null ? [describe(grid, a, b, gate)] : [describe(grid, a, b, gate), describe(grid, a, b, gate, true)])),
  }])),
};
mkdirSync(new URL("results/", import.meta.url), { recursive: true });
writeFileSync(new URL("results/traversability.json", import.meta.url), JSON.stringify(result) + "\n");
const show = JSON.parse(JSON.stringify(result));
for (const r of Object.values(show.routes) as any[]) for (const g of r.by_gate) delete g.cells;
console.log(JSON.stringify(show, null, 1));
