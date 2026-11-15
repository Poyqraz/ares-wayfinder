// S-4 sensitivity: re-plan on ROI-A with the CTX DEM displaced by one 20 m cell (N/S/E/W) using the unchanged @ares/core router.
// Endpoints stay on the same cells. Usage: node --experimental-strip-types pipeline/probes/s4/route_shift.mts <dir with roi_a_dem_*.f32.bin>
import { readFileSync } from "node:fs";
import { join } from "node:path";
const core = await import(new URL("../../../core/src/route.ts", import.meta.url).href);
const { loadBundle } = await import(new URL("../../../core/test/bundle.ts", import.meta.url).href);
const dir = process.argv[2];
const base = loadBundle("roi_a");
const params = { cost_curve: "minetti", g_max: 0.45, cell_slope_gate_deg: null, connectivity: 8 };
const req = (s, g, mode, v) => ({ start: { frame: "ROI_GRID", ...s }, goal: { frame: "ROI_GRID", ...g }, mode, params, dataset_version: v });
const key = (c) => `${c.row},${c.col}`;
const jaccard = (a, b) => { const A = new Set(a.map(key)), B = new Set(b.map(key)); let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };
function plan(grid, s, g) {
  const d = core.planRoute(grid, req(s, g, "distance", grid.meta.dataset_version));
  const t = core.planRoute(grid, req(s, g, "terrain", grid.meta.dataset_version));
  const cmp = core.compareToBaseline(grid, t, d, params);
  return { d, t, cmp };
}
const demo = { s: { row: 63, col: 24 }, g: { row: 22, col: 42 } };
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pairs = Array.from({ length: 150 }, () => ({ s: { row: Math.floor(rnd() * 90), col: Math.floor(rnd() * 74) }, g: { row: Math.floor(rnd() * 90), col: Math.floor(rnd() * 74) } }));
const b0 = plan(base, demo.s, demo.g);
const out = { baseline_demo: { length: +b0.t.length_horizontal_m.toFixed(3), terrain_cost: +b0.cmp.terrain_cost.toFixed(3), distance_route_cost: +b0.cmp.baseline_cost.toFixed(3), relation: b0.cmp.relation } };
const basePlans = pairs.map((p) => plan(base, p.s, p.g));
for (const name of ["terrain_north", "terrain_south", "terrain_east", "terrain_west"]) {
  const b = readFileSync(join(dir, `roi_a_dem_${name}.f32.bin`));
  const dem = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const grid = { ...base, dem, meta: { ...base.meta, dataset_version: "shifted" } };
  const r = plan(grid, demo.s, demo.g);
  const rel = [], jac = [], relationChanged = [];
  pairs.forEach((p, i) => {
    const q = plan(grid, p.s, p.g); const o = basePlans[i];
    if (o.t.status !== "OK" || q.t.status !== "OK" || o.t.cost_flat_equiv_m === 0) return;
    rel.push((q.t.cost_flat_equiv_m - o.t.cost_flat_equiv_m) / o.t.cost_flat_equiv_m);
    jac.push(jaccard(o.t.cells, q.t.cells));
    relationChanged.push(o.cmp.relation !== q.cmp.relation ? 1 : 0);
  });
  const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  out[name] = {
    demo: { length: +r.t.length_horizontal_m.toFixed(3), terrain_cost: +r.cmp.terrain_cost.toFixed(3), distance_route_cost: +r.cmp.baseline_cost.toFixed(3), relation: r.cmp.relation,
            terrain_cost_change_pct: +(100 * (r.cmp.terrain_cost - b0.cmp.terrain_cost) / b0.cmp.terrain_cost).toFixed(2), path_jaccard_vs_baseline: +jaccard(b0.t.cells, r.t.cells).toFixed(3) },
    random_150_pairs: { n: rel.length, terrain_cost_change_pct_median_abs: +(100 * pct(rel.map(Math.abs), 0.5)).toFixed(2), p95_abs: +(100 * pct(rel.map(Math.abs), 0.95)).toFixed(2),
                        max_abs: +(100 * Math.max(...rel.map(Math.abs))).toFixed(2), path_jaccard_median: +pct(jac, 0.5).toFixed(3), path_jaccard_p05: +pct(jac, 0.05).toFixed(3),
                        relation_changed_pairs: relationChanged.reduce((a, b) => a + b, 0) },
  };
}
console.log(JSON.stringify(out, null, 1));
