// S2 release check: plan identical requests on an old and a new CTX bundle and require bit-identical RouteResults
// (cells, vertices_proj, profile, lengths, ascent/descent, costs) apart from dataset_version.
// Usage: node --experimental-strip-types pipeline/probes/s2/route_equivalence.mts <data_dir> <roi> <old_version> <new_version>
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const core = await import(new URL("../../../core/src/route.ts", import.meta.url).href);
const [data, roi, oldV, newV] = process.argv.slice(2);
function load(v) {
  const base = join(data, roi, v);
  const man = JSON.parse(readFileSync(join(base, "manifest.json"), "utf8"));
  for (const e of man) if (createHash("sha256").update(readFileSync(join(base, e.file))).digest("hex") !== e.sha256) throw new Error(`hash ${v}/${e.file}`);
  const meta = JSON.parse(readFileSync(join(base, "terrain.json"), "utf8"));
  const f32 = (n) => { const b = readFileSync(join(base, n)); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
  return { grid: { meta, dem: f32("dem.f32.bin"), slope: f32("slope_deg.f32.bin"), validity: new Uint8Array(readFileSync(join(base, "validity.u8.bin"))) }, man: Object.fromEntries(man.map((e) => [e.file, e.sha256])) };
}
const A = load(oldV), B = load(newV);
const changedFiles = Object.keys(A.man).filter((f) => A.man[f] !== B.man[f]);
const { nx, ny } = A.grid.meta;
let seed = 11; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pairs = [{ s: { row: 63, col: 24 }, g: { row: 22, col: 42 } }, ...Array.from({ length: 200 }, () => ({ s: { row: Math.floor(rnd() * ny), col: Math.floor(rnd() * nx) }, g: { row: Math.floor(rnd() * ny), col: Math.floor(rnd() * nx) } }))];
const strip = (r) => JSON.stringify({ ...r, dataset_version: undefined });
let compared = 0, different = 0;
for (const curve of ["minetti", "tobler"]) for (const gate of [null, 15]) for (const mode of ["distance", "terrain"]) for (const p of pairs) {
  const params = { cost_curve: curve, g_max: 0.45, cell_slope_gate_deg: gate, connectivity: 8 };
  const req = (v) => ({ start: { frame: "ROI_GRID", ...p.s }, goal: { frame: "ROI_GRID", ...p.g }, mode, params, dataset_version: v });
  const a = core.planRoute(A.grid, req(oldV)), b = core.planRoute(B.grid, req(newV));
  compared++; if (strip(a) !== strip(b)) different++;
}
const demo = (g, v) => { const params = { cost_curve: "minetti", g_max: 0.45, cell_slope_gate_deg: null, connectivity: 8 };
  const q = (m) => ({ start: { frame: "ROI_GRID", row: 63, col: 24 }, goal: { frame: "ROI_GRID", row: 22, col: 42 }, mode: m, params, dataset_version: v });
  const d = core.planRoute(g, q("distance")), t = core.planRoute(g, q("terrain")); const c = core.compareToBaseline(g, t, d, params);
  return { length: d.length_horizontal_m.toFixed(3), terrain: c.terrain_cost.toFixed(3), baseline: c.baseline_cost.toFixed(3), relation: c.relation }; };
console.log(JSON.stringify({ roi, oldV, newV, manifest_files_changed: changedFiles, route_results_compared: compared, route_results_different: different,
  demo_old: roi === "roi_a" ? demo(A.grid, oldV) : null, demo_new: roi === "roi_a" ? demo(B.grid, newV) : null }, null, 1));
