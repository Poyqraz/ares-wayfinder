// M0-A prototype routes with the existing TS engine (core/src, unchanged) on the separate M0-A analysis bundle.
// Run from the repo root: node analysis/m0a/route_m0a.ts
// Reads analysis/m0a/bundle (integrity-checked) and the independent Python oracle results; writes
// analysis/m0a/results/routes_<dataset_version>.json. Not loaded by the web app.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { compareToBaseline, planRoute, projToCell, projToGeo, type TerrainGrid } from "../../core/src/index.ts";

const root = new URL("../../", import.meta.url);
// ARES_AREA=m0ab runs the same checks on the wider grid that also holds Amalik (mission B); default is the frozen M0-A grid.
const AREA = process.env.ARES_AREA === "m0ab" ? "m0ab" : "m0a";
const PAIRS: [string, string, string, string][] = AREA === "m0ab"
  ? [["start_M0", "goal_A", "M0->A", "A->M0"], ["start_M0", "goal_B", "M0->B", "B->M0"], ["goal_A", "goal_B", "A->B", "B->A"]]
  : [["start_M0", "goal_A", "M0->A", "A->M0"]];
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

export function loadM0A(): { grid: TerrainGrid; meta: any; endpoints: any; base: URL } {
  const index = JSON.parse(readFileSync(new URL(`analysis/${AREA}/bundle/index.json`, root), "utf8"))[AREA];
  const base = new URL(index.path, root);
  const read = (f: string) => readFileSync(new URL(f, base));
  for (const m of JSON.parse(read("manifest.json").toString()) as { file: string; sha256: string }[]) {
    if (sha256(read(m.file)) !== m.sha256) throw new Error(`integrity: ${m.file} does not match manifest`);
  }
  if (sha256(read("manifest.json")).slice(0, 12) !== index.dataset_version) throw new Error("integrity: manifest vs dataset_version");
  if (sha256(read("terrain.json")) !== index.terrain_json_sha256) throw new Error("integrity: terrain.json vs index");
  const meta = JSON.parse(read("terrain.json").toString());
  if (meta.dataset_version !== index.dataset_version || meta.roi_id !== AREA) throw new Error("integrity: terrain.json identity");
  const f32 = (f: string) => new Float32Array(new Uint8Array(read(f)).buffer);
  const grid: TerrainGrid = { meta, dem: f32("dem.f32.bin"), slope: f32("slope_deg.f32.bin"), validity: new Uint8Array(read("validity.u8.bin")) };
  return { grid, meta, endpoints: JSON.parse(read("endpoints.json").toString()).endpoints, base };
}

export const PARAMS = (curve: "minetti" | "tobler", g_max = 0.45) => ({ cost_curve: curve, g_max, cell_slope_gate_deg: null, connectivity: 8 as const });

export const M0A_NOTES = [
  "Analysis grid: USGS HiRISE DTM (1 m) averaged to 2 m; effective terrain resolution is several metres. Rocks and small hazards are not represented.",
  "Endpoints are rover positions from PDS/NASA records, not tube, core or rock points.",
  "Cost curve shape comes from Earth, unsuited walking data (pending S6); flat-equivalent metres are relative, not energy or time.",
  "g_max 0.45 (24.2 deg) is an experimental algorithm threshold, not an astronaut safety limit.",
  "Vertical reference UNVERIFIED; independent HiRISE stereo pairs move the terrain-route line by up to ~39 m at <0.5 % cost change (see sensitivity).",
];

function main() {
  const { grid, meta, endpoints } = loadM0A();
  const ver = meta.dataset_version;
  const oracle = JSON.parse(readFileSync(new URL(`analysis/${AREA}/results/oracle_${ver}.json`, root), "utf8"));
  const cellOf = (e: any) => projToCell(meta, { E: e.E, N: e.N })!;
  const cells: Record<string, { row: number; col: number }> = {};
  for (const k of Object.keys(endpoints)) {
    const c = (cells[k] = cellOf(endpoints[k]));
    if (c.row !== endpoints[k].row || c.col !== endpoints[k].col) throw new Error(`snapping differs between Python and TS for ${k}`);
  }
  const out: any = { dataset_version: ver, algorithm: "core/src/route.ts (A*, unchanged)", generated_by: "analysis/m0a/route_m0a.ts",
    endpoints: Object.fromEntries(Object.keys(endpoints).map((k) => [k, { ...endpoints[k], cell: cells[k] }])), notes: M0A_NOTES, routes: [], parity: [] };
  for (const [name, a, b] of PAIRS.flatMap(([ka, kb, fwd, rev]) => [[fwd, cells[ka], cells[kb]], [rev, cells[kb], cells[ka]]] as const)) {
    for (const curve of ["minetti", "tobler"] as const) {
      const p = PARAMS(curve);
      const req = (mode: "distance" | "terrain") => ({ start: { frame: "ROI_GRID" as const, ...a }, goal: { frame: "ROI_GRID" as const, ...b }, mode, params: p, dataset_version: ver });
      const d = planRoute(grid, req("distance")), t = planRoute(grid, req("terrain"));
      const tDij = planRoute(grid, req("terrain"), { heuristic: false }), dDij = planRoute(grid, req("distance"), { heuristic: false });
      const cmp = d.status === "OK" && t.status === "OK" ? compareToBaseline(grid, t, d, p) : null;
      for (const [mode, r, rd] of [["distance", d, dDij], ["terrain", t, tDij]] as const) {
        if (mode === "distance" && curve === "tobler") continue; // distance mode does not depend on the curve
        const id = `${name} ${mode}${mode === "distance" ? "" : "-" + curve}`;
        const ref = oracle.cases.find((c: any) => c.id === id);
        const rel = (x: number, y: number) => Math.abs(x - y) / Math.max(1, Math.abs(y));
        out.parity.push({ id, ts_astar: r.cost_flat_equiv_m, ts_dijkstra: rd.cost_flat_equiv_m, python_oracle: ref?.expected_cost ?? null,
          rel_astar_vs_oracle: ref?.expected_cost != null ? rel(r.cost_flat_equiv_m, ref.expected_cost) : null,
          rel_dijkstra_vs_oracle: ref?.expected_cost != null ? rel(rd.cost_flat_equiv_m, ref.expected_cost) : null });
        out.routes.push({ id, status: r.status, policy: mode === "distance" ? "shortest horizontal distance" : `lowest relative terrain cost (${curve})`,
          length_horizontal_m: r.length_horizontal_m, length_surface_m: r.length_surface_m, ascent_m: r.ascent_m, descent_m: r.descent_m,
          max_edge_grade: r.max_edge_grade, max_edge_slope_deg: (Math.atan(r.max_edge_grade) * 180) / Math.PI, cost_flat_equiv_m: r.cost_flat_equiv_m,
          comparison_same_model: mode === "terrain" ? cmp : null, constraint_notes: r.constraint_notes,
          cells: r.cells, vertices_proj: r.vertices_proj, vertices_geo: r.vertices_proj.map((v) => projToGeo(meta, v)) });
      }
    }
  }
  const worst = Math.max(...out.parity.flatMap((p: any) => [p.rel_astar_vs_oracle, p.rel_dijkstra_vs_oracle]));
  if (!(worst <= 1e-9)) throw new Error(`TS vs Python oracle parity failed: ${worst}`);
  out.parity_max_rel = worst;
  writeFileSync(new URL(`analysis/${AREA}/results/routes_${ver}.json`, root), JSON.stringify(out, null, 1));
  for (const r of out.routes) console.log(`${r.id}: ${r.status} len ${r.length_horizontal_m.toFixed(2)} m, ascent ${r.ascent_m.toFixed(2)} m, max ${r.max_edge_slope_deg.toFixed(1)} deg, cost ${r.cost_flat_equiv_m.toFixed(3)}${r.comparison_same_model ? `, distance route under same model ${r.comparison_same_model.baseline_cost?.toFixed(3)} (${r.comparison_same_model.relation})` : ""}`);
  console.log(`parity max rel ${worst.toExponential(2)}`);
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) main();
