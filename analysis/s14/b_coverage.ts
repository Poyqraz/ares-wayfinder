// S14: is the new B target (Amalik, rover positions of the Shuyak and Mageik sampling activities) inside a validated
// analysis grid, and if so what do the three route strategies say? Read-only; writes results/b_coverage.json.
// Positions: PDS Mars 2020 Initial Reports vol. 2, sheets 16-1 (Shuyak) and 17-1 (Mageik). Rover positions, not rock points.
// Run from the repo root: node --experimental-strip-types analysis/s14/b_coverage.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { geoToProj, projToCell, type TerrainGrid } from "../../core/src/index.ts";
import { loadAres1Catalog } from "../../web/src/ares1.ts";
import { planConservative } from "../../web/src/conservative.ts";
import { greatCircleM } from "../../web/src/destinationView.ts";
import { fail, type Checked } from "../../web/src/integrity.ts";
import { loadRoiA } from "../../web/src/load.ts";
import { planPair, ROUTE_PARAMS } from "../../web/src/plan.ts";
import { missionPoint } from "../../web/src/missions.ts";
import { loadM0A, loadRegional } from "../../web/src/regions.ts";
import { scienceTargets } from "../../web/src/science.ts";
import { gateGrid, M0A_SLOPE_SIGMA_DEG, routeTerrain, summarizeTerrain } from "../../web/src/traverse.ts";

globalThis.URL.createObjectURL ??= () => "blob:audit";
const pub = new URL("../../web/public/", import.meta.url);
const bytes = (url: string) => new Uint8Array(readFileSync(new URL(url.replace(/^\//, ""), pub)));
const get = async (url: string): Promise<Checked<Uint8Array>> => { try { return { ok: true, value: bytes(url) }; } catch { return fail("DATASET INTEGRITY", url); } };
globalThis.fetch = (async (url: unknown) => { try { return new Response(bytes(String(url))); } catch { return new Response(null, { status: 404 }); } }) as typeof fetch;
const r = (x: number, d = 1) => Number(x.toFixed(d));

const TARGETS = { shuyak: { lat: 18.45068954, lon: 77.40143171 }, mageik: { lat: 18.45068664, lon: 77.40143554 } };

function where(grid: TerrainGrid, p: { lat: number; lon: number }) {
  const m = grid.meta, proj = geoToProj(m, p), col = (proj.E - m.x0) / m.dx_proj, row = (m.y0 - proj.N) / m.dy_proj, cell = projToCell(m, proj);
  const k = cell ? cell.row * m.nx + cell.col : -1;
  return {
    fractional_cell: { row: r(row), col: r(col) }, grid_size: { ny: m.ny, nx: m.nx }, inside: cell !== null, cell,
    outside_by_m: cell ? null : { west: r(Math.max(0, -col) * m.dx_ground_m, 0), east: r(Math.max(0, col - m.nx) * m.dx_ground_m, 0), north: r(Math.max(0, -row) * m.dy_ground_m, 0), south: r(Math.max(0, row - m.ny) * m.dy_ground_m, 0) },
    validity: cell ? grid.validity[k] : null, slope_deg: cell ? r(grid.slope[k]) : null, neighbourhood_slope_deg: cell ? r(gateGrid(grid, true).slope[k]) : null,
  };
}

const m0a = await loadM0A(get), roi = await loadRoiA(), regional = await loadRegional(get);
const atlas = await loadAres1Catalog(async (url) => { try { return bytes(url); } catch { return null; } });
if (!m0a.ok || !roi.ok || !regional.ok || !atlas.ok) throw new Error("bundle did not load");
const g = m0a.value.grid, at = where(g, TARGETS.shuyak);
const routes = (from: { row: number; col: number }, label: string) => {
  if (!at.cell) return null;
  const pair = planPair(g, from, at.cell), k = planConservative(g, from, at.cell, ROUTE_PARAMS, M0A_SLOPE_SIGMA_DEG, pair.routes.terrain);
  const row = (x: typeof k) => (x.status !== "OK" ? { status: x.status, note: x.constraint_notes.at(-1) } : { status: "OK", length_m: r(x.length_horizontal_m, 3), cost: r(x.cost_flat_equiv_m, 3), ...(() => { const s = summarizeTerrain(routeTerrain(g, x)); return { max_step_deg: r(s.max_grade_deg), max_ground_deg: r(s.max_cell_slope_deg), max_cross_deg: r(s.max_cross_slope_deg), m_over_15: r(s.metres_over[15], 0), m_over_20: r(s.metres_over[20], 0), m_over_25: r(s.metres_over[25], 0) }; })() });
  return { from: label, distance: row(pair.routes.distance), terrain: row(pair.routes.terrain), conservative: row(k) };
};
const result = {
  targets: TARGETS,
  m0a_grid: { dataset: g.meta.dataset_version, shuyak: at, mageik: where(g, TARGETS.mageik) },
  roi_a_grid: { dataset: roi.value.grid.meta.dataset_version, shuyak: where(roi.value.grid, TARGETS.shuyak) },
  straight_line_m: {
    note: "great circle on the catalog sphere between recorded rover positions; not a walking distance",
    m0_reference_waypoint_to_b: r(greatCircleM(missionPoint("M0", regional.value)!, TARGETS.shuyak), 0),
    ...Object.fromEntries(scienceTargets(atlas.catalog).filter((t) => t.mission === "A" && t.kind === "outcrop").map((t) => [`${t.name.toLowerCase().replace(" ", "_")}_sampling_position_to_b`, r(greatCircleM(t, TARGETS.shuyak), 0)])),
    shuyak_to_mageik: r(greatCircleM(TARGETS.shuyak, TARGETS.mageik), 2),
  },
  routes_to_b: at.cell ? [routes(m0a.value.start, "M0 reference start (Bearwallow-drop rover position)"), routes(m0a.value.goal, "A reference goal (Skinner Ridge rover position)")] : "not planned: B is outside the validated grid",
};
mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
writeFileSync(new URL("./results/b_coverage.json", import.meta.url), JSON.stringify(result, null, 1) + "\n");
console.log(JSON.stringify(result, null, 1));
