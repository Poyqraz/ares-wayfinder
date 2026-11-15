import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CostCurve, RouteMode, RouteRequest } from "@ares/contracts";
import { costMultiplier, minMultiplier, planRoute, type TerrainGrid } from "../src/index.ts";

const VER = "test";

function grid(nx: number, ny: number, dem: number[], validity?: number[], slope?: number[], dx = 20, dy = 20): TerrainGrid {
  return {
    meta: { nx, ny, x0: 0, y0: 0, dx_proj: dx, dy_proj: dy, dx_ground_m: dx, dy_ground_m: dy, dataset_version: VER },
    dem,
    validity: validity ?? dem.map(() => 0),
    slope: slope ?? dem.map(() => 0),
  };
}

function req(s: [number, number], g: [number, number], mode: RouteMode = "distance", curve: CostCurve = "minetti", gate: number | null = null): RouteRequest {
  return {
    start: { frame: "ROI_GRID", row: s[0], col: s[1] },
    goal: { frame: "ROI_GRID", row: g[0], col: g[1] },
    mode,
    params: { cost_curve: curve, g_max: 0.45, cell_slope_gate_deg: gate, connectivity: 8 },
    dataset_version: VER,
  };
}

const close = (a: number, b: number, rel = 1e-9) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

describe("cost curves (C1)", () => {
  for (const c of ["minetti", "tobler"] as const) {
    it(`${c}: m(0) = 1 and m_min is a lower bound`, () => {
      close(costMultiplier(c, 0), 1);
      const mMin = minMultiplier(c, 0.45);
      for (let g = -0.45; g <= 0.45; g += 0.0001) assert.ok(costMultiplier(c, g) >= mMin);
    });
  }
});

describe("edge cases", () => {
  const flat = grid(5, 5, Array(25).fill(-2500));
  it("A1: empty grid distance = anisotropic octile", () => {
    const g = grid(6, 4, Array(24).fill(0), undefined, undefined, 19, 20);
    const r = planRoute(g, req([0, 0], [3, 5]));
    assert.equal(r.status, "OK");
    close(r.cost_flat_equiv_m, 3 * Math.sqrt(19 * 19 + 20 * 20) + 2 * 19);
    close(r.length_horizontal_m, r.cost_flat_equiv_m);
  });
  it("E2: start == goal gives one cell, cost 0", () => {
    const r = planRoute(flat, req([2, 2], [2, 2]));
    assert.equal(r.status, "OK");
    assert.deepEqual(r.cells, [{ row: 2, col: 2 }]);
    assert.equal(r.cost_flat_equiv_m, 0);
  });
  it("E1: NoData endpoint, outside endpoint, policy-blocked endpoint", () => {
    const v = Array(25).fill(0); v[0] = 1;
    assert.equal(planRoute(grid(5, 5, flat.dem as number[], v), req([0, 0], [4, 4])).status, "INVALID_ENDPOINT_NODATA");
    assert.equal(planRoute(flat, req([0, 0], [5, 4])).status, "ENDPOINT_OUTSIDE_ROI");
    const s = Array(25).fill(1); s[24] = 30;
    assert.equal(planRoute(grid(5, 5, flat.dem as number[], undefined, s), req([0, 0], [4, 4], "distance", "minetti", 20)).status, "ENDPOINT_BLOCKED_BY_POLICY");
  });
  it("E3: a full wall gives NO_ROUTE, not an exception", () => {
    const v = Array(25).fill(0); for (let r = 0; r < 5; r++) v[r * 5 + 2] = 1;
    assert.equal(planRoute(grid(5, 5, flat.dem as number[], v), req([0, 0], [4, 4])).status, "NO_ROUTE");
  });
  it("P3: no corner cutting between two blocked orthogonal cells", () => {
    // 2x2: blocked (0,1) and (1,0); the diagonal (0,0)->(1,1) must be refused.
    assert.equal(planRoute(grid(2, 2, [0, 0, 0, 0], [0, 1, 1, 0]), req([0, 0], [1, 1])).status, "NO_ROUTE");
  });
  it("version mismatch is reported", () => {
    assert.equal(planRoute(flat, { ...req([0, 0], [1, 1]), dataset_version: "other" }).status, "DATASET_VERSION_MISMATCH");
  });
  it("terrain mode avoids a steep ridge that distance mode crosses", () => {
    // ridge with grade 10/20 = 0.5 > g_max (0.45), gap at bottom row: terrain mode must detour
    const dem = Array(25).fill(0); for (let r = 0; r < 4; r++) dem[r * 5 + 2] = 10;
    const g = grid(5, 5, dem);
    const d = planRoute(g, req([0, 0], [0, 4], "distance"));
    const t = planRoute(g, req([0, 0], [0, 4], "terrain"));
    assert.equal(d.status, "OK"); assert.equal(t.status, "OK");
    assert.ok(t.length_horizontal_m > d.length_horizontal_m);
    assert.ok(t.ascent_m < d.ascent_m);
    assert.ok(t.baseline && t.baseline.delta_length_m > 0);
  });
});

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("P1/P2/P8: A* equals Dijkstra on 200 random grids; paths are valid and deterministic", () => {
  it("all grids, all modes", () => {
    const rnd = mulberry32(42);
    let routes = 0;
    for (let n = 0; n < 200; n++) {
      const nx = 9, ny = 7, N = nx * ny;
      const dem = Array.from({ length: N }, () => Math.fround(rnd() * 12));
      const validity = Array.from({ length: N }, () => (rnd() < 0.15 ? 1 : rnd() < 0.1 ? 3 : 0));
      const slope = Array.from({ length: N }, (_, k) => (validity[k] === 3 ? NaN : rnd() * 10));
      const g = grid(nx, ny, dem, validity, slope, 20.003, 20);
      const cells = [...Array(N).keys()].filter((k) => validity[k] !== 1);
      const s = cells[Math.floor(rnd() * cells.length)], t = cells[Math.floor(rnd() * cells.length)];
      for (const [mode, curve, gate] of [["distance", "minetti", null], ["terrain", "minetti", null], ["terrain", "tobler", null], ["terrain", "minetti", 6]] as const) {
        const q = req([Math.floor(s / nx), s % nx], [Math.floor(t / nx), t % nx], mode, curve, gate);
        const a = planRoute(g, q);
        const d = planRoute(g, q, { heuristic: false });
        assert.equal(a.status, d.status, `grid ${n} ${mode}/${curve}/${gate}`);
        if (a.status !== "OK") continue;
        routes++;
        close(a.cost_flat_equiv_m, d.cost_flat_equiv_m);
        assert.deepEqual(planRoute(g, q).cells, a.cells);
        for (let k = 0; k < a.cells.length; k++) {
          const c = a.cells[k], i = c.row * nx + c.col;
          assert.ok(validity[i] === 0 || validity[i] === 3);
          if (gate !== null) assert.ok(slope[i] <= gate);
          if (k === 0) continue;
          const p = a.cells[k - 1], dr = c.row - p.row, dc = c.col - p.col;
          assert.ok(Math.max(Math.abs(dr), Math.abs(dc)) === 1);
          if (dr && dc) {
            for (const j of [p.row * nx + c.col, c.row * nx + p.col]) assert.ok(validity[j] === 0 || validity[j] === 3, "corner cut");
          }
        }
      }
    }
    assert.ok(routes > 300, `only ${routes} routes found; fixture too sparse`);
  });
});
