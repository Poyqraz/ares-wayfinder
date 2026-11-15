// Provisional engineering demo route numbers (Rochette/Montdenier -> Landing, ROI-A).
// Run from core/: node scripts/demo_route.ts
import type { CostCurve, RouteParams } from "@ares/contracts";
import { compareToBaseline, geoToProj, planRoute, projToCell } from "../src/index.ts";
import { loadBundle } from "../test/bundle.ts";
import { readFileSync } from "node:fs";

const grid = loadBundle("roi_a");
const m = grid.meta as any;
const pois = JSON.parse(readFileSync(new URL(`../../web/public/data/roi_a/${m.dataset_version}/pois.json`, import.meta.url), "utf8"));
const byId = (id: string) => pois.find((p: any) => p.id === id);
const from = byId("rochette"), to = byId("landing");
const cell = (p: any) => projToCell(m, geoToProj(m, p.geo))!;
console.log(`dataset_version ${m.dataset_version}`);
for (const p of [from, to]) console.log(`${p.id}: ${p.name} | cell ${JSON.stringify(cell(p))} | confidence ${p.confidence} | ${p.claim}`);
for (const curve of ["minetti", "tobler"] as CostCurve[]) {
  const params: RouteParams = { cost_curve: curve, g_max: 0.45, cell_slope_gate_deg: null, connectivity: 8 };
  const q = (mode: "distance" | "terrain") => planRoute(grid, {
    start: { frame: "ROI_GRID", ...cell(from) }, goal: { frame: "ROI_GRID", ...cell(to) }, mode, params, dataset_version: m.dataset_version });
  const d = q("distance"), t = q("terrain");
  const c = compareToBaseline(grid, t, d, params);
  console.log(`\n[${curve}] distance route: ${d.status}, length ${d.length_horizontal_m.toFixed(3)} m, surface ${d.length_surface_m.toFixed(3)} m, ascent ${d.ascent_m.toFixed(2)} m, descent ${d.descent_m.toFixed(2)} m`);
  console.log(`[${curve}] terrain route : ${t.status}, length ${t.length_horizontal_m.toFixed(3)} m, surface ${t.length_surface_m.toFixed(3)} m, ascent ${t.ascent_m.toFixed(2)} m, descent ${t.descent_m.toFixed(2)} m`);
  console.log(`[${curve}] model cost (flat-equivalent m, same ${curve} model): terrain ${c.terrain_cost.toFixed(6)} | distance-route ${c.baseline_cost?.toFixed(6)} | delta ${c.delta?.toExponential(6)} | relation ${c.relation}`);
  console.log(`[${curve}] length difference: ${(t.length_horizontal_m - d.length_horizontal_m).toExponential(3)} m`);
}
