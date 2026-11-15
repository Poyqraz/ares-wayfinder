// X1: TS A* vs the independent Python/SciPy oracle (pipeline/oracle.py). Regenerate goldens with
// `cd pipeline && uv run python oracle.py` after any bundle or contract change.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CostCurve, RouteMode, RouteRequest } from "@ares/contracts";
import { planRoute, type TerrainGrid } from "../src/index.ts";
import { loadBundle } from "./bundle.ts";

const here = new URL(".", import.meta.url);
const load = (p: string) => JSON.parse(readFileSync(new URL(p, here), "utf8"));

interface Case { id: string; start: [number, number]; goal: [number, number]; mode: RouteMode; curve: CostCurve; g_max: number; gate: number | null; expected_cost: number | null }

function check(grid: TerrainGrid, c: Case, ver: string) {
  const req: RouteRequest = {
    start: { frame: "ROI_GRID", row: c.start[0], col: c.start[1] },
    goal: { frame: "ROI_GRID", row: c.goal[0], col: c.goal[1] },
    mode: c.mode,
    params: { cost_curve: c.curve, g_max: c.g_max, cell_slope_gate_deg: c.gate, connectivity: 8 },
    dataset_version: ver,
  };
  const r = planRoute(grid, req);
  if (c.expected_cost === null) return assert.equal(r.status, "NO_ROUTE", c.id);
  assert.equal(r.status, "OK", c.id);
  const rel = Math.abs(r.cost_flat_equiv_m - c.expected_cost) / Math.max(1, c.expected_cost);
  assert.ok(rel < 1e-9, `${c.id}: TS ${r.cost_flat_equiv_m} vs oracle ${c.expected_cost}`);
}

describe("X1 parity with the Python oracle", () => {
  it("random grids", () => {
    const { cases } = load("golden/oracle_random.json");
    assert.ok(cases.length > 400);
    for (const c of cases) {
      const grid: TerrainGrid = {
        meta: { nx: c.nx, ny: c.ny, x0: 0, y0: 0, dx_proj: c.dx, dy_proj: c.dy, dx_ground_m: c.dx, dy_ground_m: c.dy, dataset_version: "rnd" },
        dem: Float32Array.from(c.dem),
        validity: Uint8Array.from(c.validity),
        slope: Float32Array.from(c.slope.map((v: number | null) => (v === null ? NaN : v))),
      };
      check(grid, c, "rnd");
    }
  });

  it("real ROI-A bundle, POI-to-POI routes", () => {
    const g = load("golden/oracle_roi_a.json");
    const grid = loadBundle(g.roi_id); // throws on any manifest / terrain.json integrity mismatch
    assert.equal(grid.meta.dataset_version, g.dataset_version, "golden built from another bundle (SRC-2)");
    for (const c of g.cases) check(grid, c, grid.meta.dataset_version);
  });
});
