// S9: what the planner constrains and what it does not, on terrain built for the purpose, then on the real bundles.
// "reference" = the frozen planner (step grade only). "gate" = the experimental terrain-slope gate.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Cell } from "@ares/contracts";
import { evaluatePath, planRoute, type TerrainGrid } from "@ares/core";
import { fail, type Checked } from "../src/integrity.ts";
import { loadRoiA } from "../src/load.ts";
import { demoEndpoints, planPair, ROUTE_PARAMS } from "../src/plan.ts";
import { loadM0A } from "../src/regions.ts";
import { cellGradient, gatedParams, gateGrid, planGated, routeTerrain, summarizeTerrain, type SlopeGate } from "../src/traverse.ts";
import { smoothRoute } from "../src/walk.ts";

globalThis.URL.createObjectURL ??= () => "blob:test";
const pub = new URL("../public/", import.meta.url);
const bytes = (url: string) => new Uint8Array(readFileSync(new URL(url.replace(/^\//, ""), pub)));
const get = async (url: string): Promise<Checked<Uint8Array>> => { try { return { ok: true, value: bytes(url) }; } catch { return fail("DATASET INTEGRITY", url); } };
globalThis.fetch = (async (url: unknown) => { try { return new Response(bytes(String(url))); } catch { return new Response(null, { status: 404 }); } }) as typeof fetch;

const DEG = 180 / Math.PI, tan = (d: number) => Math.tan(d / DEG);
/** 2 m grid with heights h(row, col); the slope raster is Horn 3x3 like the real bundles (edge cells copy their inner neighbour). */
function terrain(nx: number, ny: number, h: (r: number, c: number) => number, nodata: Cell[] = []): TerrainGrid {
  const dem = new Float32Array(nx * ny), validity = new Uint8Array(nx * ny), slope = new Float32Array(nx * ny);
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) dem[r * nx + c] = h(r, c);
  for (const b of nodata) { validity[b.row * nx + b.col] = 1; dem[b.row * nx + b.col] = NaN; }
  const g: TerrainGrid = { meta: { nx, ny, x0: 0, y0: 1000, dx_proj: 2, dy_proj: 2, dx_ground_m: 2, dy_ground_m: 2, dataset_version: "synthetic" }, dem, validity, slope };
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
    const q = cellGradient(g, Math.min(ny - 2, Math.max(1, r)), Math.min(nx - 2, Math.max(1, c)));
    slope[r * nx + c] = q ? Math.atan(Math.hypot(q.east, q.north)) * DEG : NaN;
  }
  return g;
}
const plan = (g: TerrainGrid, a: Cell, b: Cell, gate: SlopeGate = null, mode: "distance" | "terrain" = "terrain") =>
  planRoute(g, { start: { frame: "ROI_GRID", ...a }, goal: { frame: "ROI_GRID", ...b }, mode, params: gatedParams(ROUTE_PARAMS, gate), dataset_version: g.meta.dataset_version });
const measure = (g: TerrainGrid, r: ReturnType<typeof plan>) => summarizeTerrain(routeTerrain(g, r));
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

describe("terrain cases", () => {
  it("steep slope met head-on: the reference planner climbs a 30 degree face diagonally; the gate refuses it", () => {
    // flat, then a 30 degree ramp rising east across the whole map, then a plateau
    const g = terrain(40, 24, (_r, c) => Math.min(Math.max(c - 10, 0), 16) * 2 * tan(30));
    const a = { row: 12, col: 3 }, b = { row: 12, col: 36 }, ref = plan(g, a, b), m = measure(g, ref);
    assert.equal(ref.status, "OK");
    assert.ok(m.max_grade_deg <= 24.3, "every step passes the 24.2 degree step cutoff");
    assert.ok(m.max_cell_slope_deg > 29, `but the ground under the path is ${m.max_cell_slope_deg.toFixed(1)} degrees`);
    assert.ok(m.max_cross_slope_deg > 15, "and the path crosses it obliquely, so much of the slope is across the path");
    assert.equal(plan(g, a, b, 20).status, "NO_ROUTE", "20 degree gate: the face cannot be crossed anywhere, and nothing is relaxed");
    assert.equal(plan(g, a, b, 20, "distance").status, "NO_ROUTE", "the gate applies to the shortest-distance route as well");
  });

  it("sideways across a 35 degree hillside: zero grade along the path, accepted by the reference planner at flat-ground cost", () => {
    const g = terrain(40, 24, (r) => (24 - r) * 2 * tan(35)); // rises to the north; contours run east-west
    const a = { row: 12, col: 3 }, b = { row: 12, col: 36 }, ref = plan(g, a, b), m = measure(g, ref);
    assert.equal(ref.status, "OK");
    assert.ok(m.max_grade_deg < 1e-6 && Math.abs(ref.cost_flat_equiv_m - ref.length_horizontal_m) < 1e-6, "no grade, so the model charges it like level ground");
    assert.ok(Math.abs(m.max_cross_slope_deg - 35) < 0.1 && Math.abs(m.max_cell_slope_deg - 35) < 0.1, "the slope is entirely across the path: 35 degrees");
    assert.ok(Math.abs(m.cross_over_grade_m - ref.length_horizontal_m) < 1e-6);
    assert.equal(plan(g, a, b, 25).status, "ENDPOINT_BLOCKED_BY_POLICY", "under any gate the endpoints themselves are on excluded ground");
  });

  it("escarpment: walking along the foot of a 4 m scarp is legal for the reference planner, excluded by the gate, and shows as local relief", () => {
    const g = terrain(40, 24, (r) => (r < 10 ? 4 : 0)); // 4 m step between rows 9 and 10
    const along = Array.from({ length: 30 }, (_, k) => ({ row: 10, col: 4 + k })); // the row at the foot of the scarp
    assert.ok(evaluatePath(g, along, "terrain", ROUTE_PARAMS) !== null, "legal: its own steps are level");
    assert.equal(evaluatePath(g, along, "terrain", gatedParams(ROUTE_PARAMS, 25)), null, "the gate excludes cells whose Horn slope sees the scarp");
    const up = [{ row: 12, col: 20 }, { row: 11, col: 20 }, { row: 10, col: 20 }, { row: 9, col: 20 }];
    assert.equal(evaluatePath(g, up, "terrain", ROUTE_PARAMS), null, "stepping up the scarp fails the step cutoff");
    assert.equal(plan(g, { row: 20, col: 5 }, { row: 3, col: 30 }).status, "NO_ROUTE", "no route exists across an unbroken scarp");
    const walked = plan(g, { row: 10, col: 4 }, { row: 10, col: 33 });
    assert.ok(measure(g, walked).max_relief_m >= 4, "the relief column reports the scarp beside the path");
    const gated = plan(g, { row: 14, col: 4 }, { row: 14, col: 33 }, 25);
    assert.ok(gated.status === "OK" && gated.cells.every((c) => c.row >= 12), "under the gate the path stays clear of the scarp cells");
  });

  it("a one-cell ridge is seen by the search and by the smoothing samples; nothing narrower than a cell exists in a DEM", () => {
    const g = terrain(40, 24, (r, c) => (c === 20 && r < 18 ? 3 : 0)); // 3 m wall one cell wide, open at the south end
    const ref = plan(g, { row: 6, col: 5 }, { row: 6, col: 35 });
    assert.equal(ref.status, "OK");
    assert.ok(ref.cells.every((c) => !(c.col === 20 && c.row < 18)), "the route goes round the end of the ridge");
    const line = smoothRoute(g, ref, "terrain", ROUTE_PARAMS)!;
    assert.ok(line.max_grade <= ROUTE_PARAMS.g_max + 1e-12 && line.vertices_proj.length > 2, "the smoothed line does not cut through it");
  });

  it("nearly flat ground: the gate changes nothing", () => {
    const g = terrain(40, 24, (r, c) => 0.02 * c + 0.01 * r);
    const a = { row: 3, col: 3 }, b = { row: 20, col: 36 }, ref = plan(g, a, b);
    for (const gate of [25, 20, 15] as const) for (const clearance of [false, true]) {
      const p = planGated(g, a, b, gate, clearance).routes.terrain;
      assert.deepEqual(p.cells, ref.cells);
      assert.equal(p.cost_flat_equiv_m, ref.cost_flat_equiv_m);
    }
  });

  it("NoData: never entered, never bridged by smoothing, and an undefined slope fails the gate", () => {
    const hole = Array.from({ length: 14 }, (_, k) => ({ row: k, col: 20 }));
    const g = terrain(40, 24, () => 0, hole), ref = plan(g, { row: 4, col: 5 }, { row: 4, col: 35 }, 20);
    assert.equal(ref.status, "OK");
    assert.ok(ref.cells.every((c) => g.validity[c.row * 40 + c.col] === 0 && g.slope[c.row * 40 + c.col] <= 20), "gated route: valid cells with a defined slope only");
    assert.ok(Number.isNaN(g.slope[5 * 40 + 21]), "cells beside NoData have no Horn slope");
    assert.ok(plan(g, { row: 4, col: 5 }, { row: 4, col: 35 }).cells.some((c) => c.col === 21 || c.col === 19), "the reference planner may pass right beside the hole");
    assert.ok(ref.cells.every((c) => Math.abs(c.col - 20) > 1 || c.row > 14), "the gated planner cannot: slope there is unknown");
    assert.equal(plan(g, { row: 4, col: 20 }, { row: 4, col: 35 }).status, "INVALID_ENDPOINT_NODATA");
  });

  it("DEM noise: step grades on 2 m cells are noisier than the 3x3 terrain slope, so the gate is the steadier test", () => {
    const next = rng(5), gauss = () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
    const noise = new Float32Array(60 * 60).map(() => 0.15 * gauss()); // 0.15 m of uncorrelated height noise on level ground
    const g = terrain(60, 60, (r, c) => noise[r * 60 + c]);
    let step = 0, horn = 0;
    for (let r = 1; r < 59; r++) for (let c = 1; c < 58; c++) {
      step = Math.max(step, Math.atan(Math.abs(g.dem[r * 60 + c + 1] - g.dem[r * 60 + c]) / 2) * DEG);
      horn = Math.max(horn, g.slope[r * 60 + c]);
    }
    assert.ok(step > 2 * horn, `level ground with noise: worst step grade ${step.toFixed(1)} deg, worst terrain slope ${horn.toFixed(1)} deg`);
    assert.equal(plan(g, { row: 5, col: 5 }, { row: 50, col: 50 }, 15).status, "OK", "noise of this size does not close a corridor on level ground");
  });

  it("an island behind steep ground: reachable for the reference planner, NO_ROUTE under the gate, and no fallback route is returned", () => {
    // a flat-topped hill whose 28 degree flank rings the goal
    const g = terrain(50, 50, (r, c) => { const d = Math.hypot(r - 25, c - 25) * 2; return d < 12 ? 10 : d < 12 + 10 / tan(28) ? 10 - (d - 12) * tan(28) : 0; });
    const a = { row: 3, col: 3 }, b = { row: 25, col: 25 };
    assert.equal(plan(g, a, b).status, "OK");
    assert.ok(measure(g, plan(g, a, b)).max_cell_slope_deg > 25);
    const gated = planGated(g, a, b, 20, false);
    assert.equal(gated.routes.terrain.status, "NO_ROUTE");
    assert.equal(gated.routes.distance.status, "NO_ROUTE");
    assert.equal(gated.routes.terrain.cells.length, 0, "no cells: the gate is not quietly relaxed");
    assert.equal(gated.comparison, null);
  });

  it("smoothing under a gate never crosses excluded ground, and clearance keeps one cell away from it", () => {
    const g = terrain(60, 40, (r, c) => { const d = Math.hypot(r - 20, c - 30) * 2; return d < 14 ? (14 - d) * tan(32) : 0; }); // a 32 degree cone in the way
    const a = { row: 20, col: 4 }, b = { row: 20, col: 56 };
    for (const clearance of [false, true]) {
      const p = planGated(g, a, b, 20, clearance), r = p.routes.terrain;
      assert.equal(r.status, "OK");
      const near = (c: Cell) => { let w = 0; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) w = Math.max(w, g.slope[(c.row + dr) * 60 + c.col + dc]); return w; };
      assert.ok(r.cells.every((c) => g.slope[c.row * 60 + c.col] <= 20), "every cell passes the gate on the original slope raster");
      if (clearance) assert.ok(r.cells.every((c) => near(c) <= 20), "with clearance, so do all eight neighbours");
      const line = smoothRoute(p.grid, r, "terrain", p.params)!;
      assert.ok(line.vertices_proj.length > 2, "the smoothed line still bends round the cone");
      for (let k = 1; k < line.vertices_proj.length; k++) for (let t = 0; t <= 1; t += 0.01) {
        const u = line.vertices_proj[k - 1], v = line.vertices_proj[k], E = u.E + (v.E - u.E) * t, N = u.N + (v.N - u.N) * t;
        assert.ok(p.grid.slope[Math.floor((1000 - N) / 2) * 60 + Math.floor(E / 2)] <= 20, "no sample of the line is on excluded ground");
      }
    }
    assert.equal(gateGrid(g, false), g, "without clearance the planner sees the original grid");
  });
});

describe("real bundles", async () => {
  const m0a = await loadM0A(get), roi = await loadRoiA();
  assert.ok(m0a.ok && roi.ok);
  if (!m0a.ok || !roi.ok) return;
  const g = m0a.value.grid, nx = g.meta.nx;

  it("reference routes are untouched; the gate is off unless asked for", () => {
    const ref = planPair(g, m0a.value.start, m0a.value.goal).routes;
    assert.ok(Math.abs(ref.terrain.length_horizontal_m - 416.4257) < 1e-3 && Math.abs(ref.terrain.cost_flat_equiv_m - 664.3901) < 1e-3);
    assert.deepEqual(planGated(g, m0a.value.start, m0a.value.goal, null, false).routes.terrain.cells, ref.terrain.cells);
    const ends = demoEndpoints(roi.value.meta, roi.value.pois);
    assert.ok(ends.ok && Math.abs(planPair(roi.value.grid, ends.value.start, ends.value.goal).routes.terrain.length_horizontal_m - 969.161) < 1e-3);
  });

  it("M0-A reference route: about 20 degree ground and 15 degree cross-slope under a path whose steepest step is 18 degrees", () => {
    const m = summarizeTerrain(routeTerrain(g, planPair(g, m0a.value.start, m0a.value.goal).routes.terrain));
    assert.ok(Math.abs(m.max_grade_deg - 18.18) < 0.05 && Math.abs(m.max_cell_slope_deg - 19.94) < 0.05 && Math.abs(m.max_cross_slope_deg - 15.34) < 0.05);
    assert.ok(m.metres_over[15] > 30 && m.metres_over[20] === 0);
  });

  it("the reference planner lets a route contour 41 degree ground (found by the audit's random search); the gate does not", () => {
    const a = { row: 45, col: 217 }, b = { row: 125, col: 133 }, ref = plan(g, a, b), m = measure(g, ref);
    assert.equal(ref.status, "OK");
    assert.ok(m.max_grade_deg <= 24.3 && m.max_cell_slope_deg > 40 && m.max_cross_slope_deg > 35 && m.metres_over[25] > 100, JSON.stringify(m));
    const gated = plan(g, a, b, 20);
    if (gated.status === "OK") assert.ok(measure(g, gated).max_cell_slope_deg <= 20);
    else assert.ok(["NO_ROUTE", "ENDPOINT_BLOCKED_BY_POLICY"].includes(gated.status));
  });

  it("gated routes hold their declared constraints when re-checked cell by cell on the original rasters", () => {
    for (const gate of [25, 20] as const) for (const clearance of [false, true]) {
      const p = planGated(g, m0a.value.start, m0a.value.goal, gate, clearance), r = p.routes.terrain;
      if (r.status !== "OK") { assert.equal(r.status, "ENDPOINT_BLOCKED_BY_POLICY"); assert.equal(r.cells.length, 0); continue; }
      for (let k = 0; k < r.cells.length; k++) {
        const c = r.cells[k];
        assert.equal(g.validity[c.row * nx + c.col], 0);
        assert.ok(g.slope[c.row * nx + c.col] <= gate, `gate ${gate}: cell ${k}`);
        if (clearance) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) assert.ok(g.slope[(c.row + dr) * nx + c.col + dc] <= gate, `clearance: neighbour of cell ${k}`);
        if (k > 0) {
          const q = r.cells[k - 1], L = Math.hypot((c.col - q.col) * g.meta.dx_ground_m, (c.row - q.row) * g.meta.dy_ground_m);
          assert.ok(Math.abs(g.dem[c.row * nx + c.col] - g.dem[q.row * nx + q.col]) / L <= ROUTE_PARAMS.g_max + 1e-12, "step cutoff still holds");
        }
      }
      assert.equal(planRoute(p.grid, { start: { frame: "ROI_GRID", ...m0a.value.start }, goal: { frame: "ROI_GRID", ...m0a.value.goal }, mode: "terrain", params: p.params, dataset_version: g.meta.dataset_version }, { heuristic: false }).cost_flat_equiv_m, r.cost_flat_equiv_m, "A* equals Dijkstra under the gate too");
    }
    assert.equal(planGated(g, m0a.value.start, m0a.value.goal, 15, false).routes.terrain.status, "ENDPOINT_BLOCKED_BY_POLICY", "A's rover position lies on 18 degree ground: no 15 degree corridor to it");
    assert.equal(planGated(g, m0a.value.start, m0a.value.goal, 20, true).routes.terrain.status, "ENDPOINT_BLOCKED_BY_POLICY", "and ground steeper than 20 degrees touches it");
  });
});
