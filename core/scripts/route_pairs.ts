// Waypoint-pair analysis: how different are distance vs terrain routes between POIs? Uses the real engine.
// Run from core/: node scripts/route_pairs.ts > ../science/waypoint_pairs_raw.md
import { geoToProj, planRoute, projToCell } from "../src/index.ts";
import { loadBundle } from "../test/bundle.ts";
import { readFileSync } from "node:fs";

for (const roi of ["roi_a", "roi_b"]) {
  const grid = loadBundle(roi);
  const m = grid.meta as any;
  const pois = JSON.parse(readFileSync(new URL(`../../web/public/data/${roi}/${m.dataset_version}/pois.json`, import.meta.url), "utf8"));
  console.log(`\n### ${roi} (${m.nx}x${m.ny}, ${m.dataset_version})\n`);
  console.log("| From → To | Curve | Distance len (m) | Terrain len (m) | Δlen (m) | Δascent (m) | Max separation (m) | Shared cells | Max grade on distance route |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const a of pois) for (const b of pois) {
    if (a.id === b.id) continue;
    const ca = projToCell(m, geoToProj(m, a.geo))!, cb = projToCell(m, geoToProj(m, b.geo))!;
    const q = (mode: "distance" | "terrain", curve: "minetti" | "tobler") => planRoute(grid, {
      start: { frame: "ROI_GRID", ...ca }, goal: { frame: "ROI_GRID", ...cb }, mode,
      params: { cost_curve: curve, g_max: 0.45, cell_slope_gate_deg: null, connectivity: 8 }, dataset_version: m.dataset_version });
    const d = q("distance", "minetti");
    for (const curve of ["minetti", "tobler"] as const) {
      const t = q("terrain", curve);
      if (d.status !== "OK" || t.status !== "OK") { console.log(`| ${a.id} → ${b.id} | ${curve} | ${d.status} | ${t.status} |`); continue; }
      const sep = (P: typeof d.vertices_proj, Q: typeof d.vertices_proj) => Math.max(...P.map((p) => Math.min(...Q.map((r) => Math.hypot(p.E - r.E, p.N - r.N)))));
      const haus = Math.max(sep(d.vertices_proj, t.vertices_proj), sep(t.vertices_proj, d.vertices_proj));
      const key = (c: { row: number; col: number }) => c.row * m.nx + c.col;
      const sd = new Set(d.cells.map(key)), st = new Set(t.cells.map(key));
      const inter = [...sd].filter((k) => st.has(k)).length;
      const jac = inter / (sd.size + st.size - inter);
      console.log(`| ${a.id} → ${b.id} | ${curve} | ${d.length_horizontal_m.toFixed(0)} | ${t.length_horizontal_m.toFixed(0)} | ${(t.length_horizontal_m - d.length_horizontal_m).toFixed(0)} | ${(t.ascent_m - d.ascent_m).toFixed(1)} | ${haus.toFixed(0)} | ${(jac * 100).toFixed(0)}% | ${d.max_edge_grade.toFixed(3)} |`);
    }
  }
}
