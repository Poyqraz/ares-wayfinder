// S13 audit of the Conservative Terrain strategy on both analysis grids: the reference pair of each region, and
// seeded random pairs. For every pair it plans the three strategies, re-checks the conservative route's hard rules
// cell by cell, and compares what lies under each route. Read-only on the bundles; writes results/conservative.json.
// Run from the repo root: node --experimental-strip-types analysis/s13/conservative_audit.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { TerrainGrid } from "../../core/src/index.ts";
import { CONSERVATIVE, conservativeCost, planConservative } from "../../web/src/conservative.ts";
import { fail, type Checked } from "../../web/src/integrity.ts";
import { loadRoiA } from "../../web/src/load.ts";
import { demoEndpoints, planPair, ROUTE_PARAMS } from "../../web/src/plan.ts";
import { loadM0A } from "../../web/src/regions.ts";
import { gateGrid, M0A_SLOPE_SIGMA_DEG, routeTerrain, summarizeTerrain } from "../../web/src/traverse.ts";

type Cell = { row: number; col: number };
globalThis.URL.createObjectURL ??= () => "blob:audit";
const pub = new URL("../../web/public/", import.meta.url);
const bytes = (url: string) => new Uint8Array(readFileSync(new URL(url.replace(/^\//, ""), pub)));
const get = async (url: string): Promise<Checked<Uint8Array>> => { try { return { ok: true, value: bytes(url) }; } catch { return fail("DATASET INTEGRITY", url); } };
globalThis.fetch = (async (url: unknown) => { try { return new Response(bytes(String(url))); } catch { return new Response(null, { status: 404 }); } }) as typeof fetch;
const r = (x: number, d = 2) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);

function pair(grid: TerrainGrid, a: Cell, b: Cell, sigma: number) {
  const ref = planPair(grid, a, b), k = planConservative(grid, a, b, ROUTE_PARAMS, sigma, ref.routes.terrain);
  const near = gateGrid(grid, true).slope, nx = grid.meta.nx;
  const row = (route: typeof k) => {
    if (route.status !== "OK") return { status: route.status };
    const s = summarizeTerrain(routeTerrain(grid, route));
    return { status: "OK", length_m: r(route.length_horizontal_m, 3), cost_flat_equiv_m: r(route.cost_flat_equiv_m, 3), ascent_m: r(route.ascent_m), max_step_deg: r(s.max_grade_deg, 1), max_ground_deg: r(s.max_cell_slope_deg, 1), max_cross_deg: r(s.max_cross_slope_deg, 1), m_over_15: r(s.metres_over[15], 0), m_over_20: r(s.metres_over[20], 0), m_over_25: r(s.metres_over[25], 0) };
  };
  let rules = true;
  if (k.status === "OK") {
    rules = conservativeCost(grid, k.cells, ROUTE_PARAMS, sigma) !== null && k.cells.every((c) => near[c.row * nx + c.col] <= CONSERVATIVE.gate_deg);
    const theirs = ref.routes.terrain.status === "OK" ? conservativeCost(grid, ref.routes.terrain.cells, ROUTE_PARAMS, sigma) : null;
    if (theirs !== null && conservativeCost(grid, k.cells, ROUTE_PARAMS, sigma)! > theirs + 1e-9) rules = false; // must not lose to an admissible path under its own objective
  }
  return { start: a, goal: b, distance: row(ref.routes.distance), terrain: row(ref.routes.terrain), conservative: row(k), conservative_note: k.status === "OK" ? null : k.constraint_notes.at(-1), rules_hold: rules };
}

function randomPairs(grid: TerrainGrid, n: number, sigma: number, seed: number) {
  let t = seed >>> 0; // mulberry32
  const rnd = () => { t += 0x6d2b79f5; let x = Math.imul(t ^ (t >>> 15), 1 | t); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const { nx, ny } = grid.meta, cell = (): Cell => ({ row: Math.floor(rnd() * ny), col: Math.floor(rnd() * nx) });
  const out = { pairs: 0, conservative_ok: 0, conservative_no_corridor: 0, conservative_endpoint_blocked: 0, terrain_ok: 0, rules_fail: 0, pairs_where_conservative_has_the_steeper_worst_cell: 0, extra_length_pct: [] as number[], ground_gain_deg: [] as number[], over15_terrain_m: 0, over15_conservative_m: 0 };
  while (out.pairs < n) {
    const a = cell(), b = cell();
    if (grid.validity[a.row * nx + a.col] !== 0 || grid.validity[b.row * nx + b.col] !== 0 || (a.row === b.row && a.col === b.col)) continue;
    const p = pair(grid, a, b, sigma);
    out.pairs += 1;
    if (!p.rules_hold) out.rules_fail += 1;
    if (p.terrain.status === "OK") out.terrain_ok += 1;
    if (p.conservative.status === "OK") out.conservative_ok += 1;
    else if (p.conservative.status === "ENDPOINT_BLOCKED_BY_POLICY") out.conservative_endpoint_blocked += 1;
    else out.conservative_no_corridor += 1;
    if (p.conservative.status === "OK" && p.terrain.status === "OK") {
      const c = p.conservative as { length_m: number; max_ground_deg: number; m_over_15: number }, q = p.terrain as typeof c;
      out.extra_length_pct.push(100 * (c.length_m / q.length_m - 1));
      out.ground_gain_deg.push(q.max_ground_deg - c.max_ground_deg);
      if (c.max_ground_deg > q.max_ground_deg + 0.05) out.pairs_where_conservative_has_the_steeper_worst_cell += 1; // it lowers accumulated exposure, not the single worst cell
      out.over15_terrain_m += q.m_over_15;
      out.over15_conservative_m += c.m_over_15;
    }
  }
  const med = (v: number[]) => { const s = [...v].sort((x, y) => x - y); return s.length ? r(s[Math.floor(s.length / 2)], 1) : null; };
  return { ...out, extra_length_pct: { median: med(out.extra_length_pct), max: r(Math.max(...out.extra_length_pct), 1) }, ground_gain_deg: { median: med(out.ground_gain_deg), min: r(Math.min(...out.ground_gain_deg), 1), max: r(Math.max(...out.ground_gain_deg), 1) } };
}

const m0a = await loadM0A(get), roi = await loadRoiA();
if (!m0a.ok || !roi.ok) throw new Error("bundle did not load");
const ends = demoEndpoints(roi.value.meta, roi.value.pois);
if (!ends.ok) throw new Error("ROI-A endpoints");
/** From the reference start: the first goal (coarse scan) that the strategy refuses for each reason, with the other two strategies' answers. */
function failClosed(grid: TerrainGrid, start: Cell, sigma: number) {
  const { nx, ny } = grid.meta, found: Record<string, ReturnType<typeof pair>> = {};
  for (let row = 2; row < ny - 2 && Object.keys(found).length < 2; row += 3) for (let col = 2; col < nx - 2; col += 3) {
    if (grid.validity[row * nx + col] !== 0) continue;
    const k = planConservative(grid, start, { row, col }, ROUTE_PARAMS, sigma, planPair(grid, start, start).routes.terrain).status;
    if (k !== "OK" && !(k in found)) { const p = pair(grid, start, { row, col }, sigma); if (p.terrain.status === "OK") found[k] = p; }
  }
  return found;
}

const result = {
  strategy: CONSERVATIVE,
  m0a: { dataset: m0a.value.grid.meta.dataset_version, sigma_deg: M0A_SLOPE_SIGMA_DEG, reference: pair(m0a.value.grid, m0a.value.start, m0a.value.goal, M0A_SLOPE_SIGMA_DEG), random: randomPairs(m0a.value.grid, 200, M0A_SLOPE_SIGMA_DEG, 13), fail_closed_examples: failClosed(m0a.value.grid, m0a.value.start, M0A_SLOPE_SIGMA_DEG) },
  roi_a: { dataset: roi.value.grid.meta.dataset_version, sigma_deg: 0, reference: pair(roi.value.grid, ends.value.start, ends.value.goal, 0), random: randomPairs(roi.value.grid, 200, 0, 13) },
};
mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
writeFileSync(new URL("./results/conservative.json", import.meta.url), JSON.stringify(result, null, 1) + "\n");
console.log(JSON.stringify(result, null, 1));
