// Terrain route vs distance baseline under ONE model, with float tolerance and tie cases.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { RouteMode, RouteParams, RouteRequest } from "@ares/contracts";
import { compareToBaseline, evaluatePath, planRoute, type TerrainGrid } from "../src/index.ts";

const P: RouteParams = { cost_curve: "minetti", g_max: 0.45, cell_slope_gate_deg: null, connectivity: 8 };
const grid = (nx: number, ny: number, dem: number[]): TerrainGrid => ({
  meta: { nx, ny, x0: 0, y0: 0, dx_proj: 20, dy_proj: 20, dx_ground_m: 20, dy_ground_m: 20, dataset_version: "t" },
  dem, validity: dem.map(() => 0), slope: dem.map(() => 0),
});
const req = (s: [number, number], g: [number, number], mode: RouteMode): RouteRequest => ({
  start: { frame: "ROI_GRID", row: s[0], col: s[1] }, goal: { frame: "ROI_GRID", row: g[0], col: g[1] },
  mode, params: P, dataset_version: "t",
});

describe("evaluatePath", () => {
  it("reproduces the planner's own cost in both modes", () => {
    const g = grid(5, 4, [0, 1, 2, 3, 4, 1, 2, 3, 4, 5, 0, 0, 1, 1, 2, 3, 2, 1, 0, 0]);
    for (const mode of ["distance", "terrain"] as const) {
      const r = planRoute(g, req([0, 0], [3, 4], mode));
      const c = evaluatePath(g, r.cells, mode, P)!;
      assert.ok(Math.abs(c - r.cost_flat_equiv_m) < 1e-12);
    }
  });
  it("rejects non-adjacent steps and over-limit grades", () => {
    const g = grid(3, 1, [0, 0, 100]);
    assert.equal(evaluatePath(g, [{ row: 0, col: 0 }, { row: 0, col: 2 }], "distance", P), null);
    assert.equal(evaluatePath(g, [{ row: 0, col: 1 }, { row: 0, col: 2 }], "terrain", P), null);
    assert.equal(evaluatePath(g, [{ row: 0, col: 1 }, { row: 0, col: 2 }], "distance", P), 20);
  });
});

describe("compareToBaseline", () => {
  it("flat grid: tie is reported as EQUAL, not LOWER", () => {
    const g = grid(6, 6, Array(36).fill(-2500));
    const c = compareToBaseline(g, planRoute(g, req([0, 0], [5, 3], "terrain")), planRoute(g, req([0, 0], [5, 3], "distance")), P);
    assert.equal(c.relation, "EQUAL");
  });
  it("baseline over the grade limit is BASELINE_NOT_ALLOWED", () => {
    const dem = Array(25).fill(0); for (let r = 0; r < 4; r++) dem[r * 5 + 2] = 10;
    const g = grid(5, 5, dem);
    const c = compareToBaseline(g, planRoute(g, req([0, 0], [0, 4], "terrain")), planRoute(g, req([0, 0], [0, 4], "distance")), P);
    assert.equal(c.relation, "BASELINE_NOT_ALLOWED");
    assert.equal(c.baseline_cost, null);
  });
  it("random grids: terrain route is never costlier than the baseline under the terrain model", () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const seen = { LOWER: 0, EQUAL: 0, BASELINE_NOT_ALLOWED: 0 };
    for (let n = 0; n < 300; n++) {
      const g = grid(8, 7, Array.from({ length: 56 }, () => Math.fround(rnd() * 15)));
      const s: [number, number] = [Math.floor(rnd() * 7), Math.floor(rnd() * 8)], t: [number, number] = [Math.floor(rnd() * 7), Math.floor(rnd() * 8)];
      const tr = planRoute(g, req(s, t, "terrain")), dr = planRoute(g, req(s, t, "distance"));
      if (tr.status !== "OK") continue;
      seen[compareToBaseline(g, tr, dr, P).relation]++; // throws if terrain > baseline
    }
    assert.ok(seen.LOWER > 0 && seen.EQUAL > 0 && seen.BASELINE_NOT_ALLOWED > 0, JSON.stringify(seen));
  });
});
