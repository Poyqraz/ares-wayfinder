// S15: the three route strategies to B (Amalik) on the wider M0-A-B grid, with what lies under each, plus two checks
// that the wider grid is the frozen grid where they overlap: the cells, and the M0 -> A reference route.
// Read-only on the bundles; writes results/b_routes.json. Run from the repo root:
//   node --experimental-strip-types analysis/s15/b_routes.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { TerrainGrid } from "../../core/src/index.ts";
import { planConservative } from "../../web/src/conservative.ts";
import { fail, type Checked } from "../../web/src/integrity.ts";
import { planPair, ROUTE_PARAMS } from "../../web/src/plan.ts";
import { loadM0A } from "../../web/src/regions.ts";
import { M0A_SLOPE_SIGMA_DEG, routeTerrain, summarizeTerrain } from "../../web/src/traverse.ts";

type Cell = { row: number; col: number };
globalThis.URL.createObjectURL ??= () => "blob:audit";
const pub = new URL("../../web/public/", import.meta.url);
const bytes = (url: string) => new Uint8Array(readFileSync(new URL(url.replace(/^\//, ""), pub)));
const get = async (url: string): Promise<Checked<Uint8Array>> => { try { return { ok: true, value: bytes(url) }; } catch { return fail("DATASET INTEGRITY", url); } };
const r = (x: number, d = 3) => Number(x.toFixed(d));

function three(grid: TerrainGrid, a: Cell, b: Cell) {
  const pair = planPair(grid, a, b), k = planConservative(grid, a, b, ROUTE_PARAMS, M0A_SLOPE_SIGMA_DEG, pair.routes.terrain);
  const row = (x: typeof k) => {
    if (x.status !== "OK") return { status: x.status, note: x.constraint_notes.at(-1) };
    const s = summarizeTerrain(routeTerrain(grid, x));
    return { status: "OK", length_m: r(x.length_horizontal_m), cost_flat_equiv_m: r(x.cost_flat_equiv_m), ascent_m: r(x.ascent_m, 2), descent_m: r(x.descent_m, 2), max_step_deg: r(s.max_grade_deg, 1),
      max_ground_deg: r(s.max_cell_slope_deg, 1), max_cross_deg: r(s.max_cross_slope_deg, 1), m_over_15: r(s.metres_over[15], 0), m_over_20: r(s.metres_over[20], 0), m_over_25: r(s.metres_over[25], 0) };
  };
  return { start: a, goal: b, distance: row(pair.routes.distance), terrain: row(pair.routes.terrain), conservative: row(k), relation: pair.comparison?.relation ?? null };
}

const frozen = await loadM0A(get), wide = await loadM0A(get, "m0ab");
if (!frozen.ok || !wide.ok) throw new Error("bundle did not load");
const f = frozen.value.grid, w = wide.value.grid, sup = (w.meta as unknown as { superset_of: { row_offset: number; col_offset: number } }).superset_of;
let same = 0;
for (let row = 0; row < f.meta.ny; row++) for (let col = 0; col < f.meta.nx; col++) {
  const i = row * f.meta.nx + col, j = (row + sup.row_offset) * w.meta.nx + col + sup.col_offset;
  if (Object.is(f.dem[i], w.dem[j]) && Object.is(f.slope[i], w.slope[j]) && f.validity[i] === w.validity[j]) same += 1;
}
const shift = (c: Cell): Cell => ({ row: c.row + sup.row_offset, col: c.col + sup.col_offset });
const a = shift(frozen.value.goal); // the Skinner Ridge sampling rover position, on the wider grid
const result = {
  wide_dataset: w.meta.dataset_version, frozen_dataset: f.meta.dataset_version, gates: (w.meta as unknown as { gates: unknown }).gates,
  overlap: { cells: f.meta.nx * f.meta.ny, identical_cells: same, same_ground_spacing: f.meta.dx_ground_m === w.meta.dx_ground_m },
  m0_to_a_on_frozen_grid: three(f, frozen.value.start, frozen.value.goal),
  m0_to_a_on_wider_grid: three(w, shift(frozen.value.start), a),
  m0_to_b: three(w, wide.value.start, wide.value.goal),
  b_to_m0: three(w, wide.value.goal, wide.value.start),
  a_to_b: three(w, a, wide.value.goal),
};
mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
writeFileSync(new URL("./results/b_routes.json", import.meta.url), JSON.stringify(result, null, 1) + "\n");
console.log(JSON.stringify(result, null, 1));
