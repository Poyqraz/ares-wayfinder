// P7 audit on the real ROI-A grid: the A* heuristic is consistent (hence admissible),
// including on downhill edges whose cost is below their horizontal length.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CostCurve, RouteMode, RouteParams } from "@ares/contracts";
import { costMultiplier, heuristic, minMultiplier, planRoute } from "../src/index.ts";
import { loadBundle } from "./bundle.ts";

const grid = loadBundle("roi_a");
const { nx, ny, dx_ground_m: dx, dy_ground_m: dy } = grid.meta;
const goal = 72 * nx + 44; // Roubion cell (coordinates UNVERIFIED, S2); any cell would do

for (const [mode, curve] of [["distance", "minetti"], ["terrain", "minetti"], ["terrain", "tobler"]] as [RouteMode, CostCurve][]) {
  describe(`heuristic audit: ${mode}/${curve}`, () => {
    const p: RouteParams = { cost_curve: curve, g_max: 0.45, cell_slope_gate_deg: null, connectivity: 8 };
    const mMin = mode === "terrain" ? minMultiplier(curve, 0.45) : 1;
    const h = (k: number) => heuristic(grid.meta, mMin, k, goal);

    it("h(goal) = 0 and h(u) <= c(u,v) + h(v) on every edge", () => {
      assert.equal(h(goal), 0);
      let edges = 0, cheaperThanLength = 0;
      for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= ny || cc >= nx) continue;
          const u = r * nx + c, v = rr * nx + cc;
          const L = dr && dc ? Math.sqrt(dx * dx + dy * dy) : dr ? dy : dx;
          const g = (grid.dem[v] - grid.dem[u]) / L;
          if (mode === "terrain" && Math.abs(g) > 0.45) continue;
          const w = mode === "terrain" ? L * costMultiplier(curve, g) : L;
          if (w < L) cheaperThanLength++;
          edges++;
          assert.ok(h(u) <= w + h(v) + 1e-9, `inconsistent at ${u}->${v}: ${h(u)} > ${w} + ${h(v)}`);
        }
      }
      assert.ok(edges > 50000);
      if (mode === "terrain") assert.ok(cheaperThanLength > 1000, "audit must cover downhill edges with cost < length");
    });

    it("h(start) <= true optimal cost for 40 starts (Dijkstra)", () => {
      for (let i = 0; i < 40; i++) {
        const s = (i * 157) % (nx * ny);
        const r = planRoute(grid, {
          start: { frame: "ROI_GRID", row: Math.floor(s / nx), col: s % nx },
          goal: { frame: "ROI_GRID", row: Math.floor(goal / nx), col: goal % nx },
          mode, params: p, dataset_version: grid.meta.dataset_version,
        }, { heuristic: false });
        assert.equal(r.status, "OK");
        assert.ok(h(s) <= r.cost_flat_equiv_m + 1e-9);
      }
    });
  });
}
