// S8: the DEM surface used by the first-person view, the walker's pose, and the re-checked any-angle line.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Cell, RouteResult } from "@ares/contracts";
import { cellCenter, costMultiplier, planRoute, type TerrainGrid } from "@ares/core";
import { fail, type Checked } from "../src/integrity.ts";
import { loadRoiA } from "../src/load.ts";
import { demoEndpoints, planPair, ROUTE_PARAMS } from "../src/plan.ts";
import { loadM0A } from "../src/regions.ts";
import { buildTerrainMesh } from "../src/terrainMesh.ts";
import { EYE_HEIGHT_M, groundDistance, guidanceMarks, smoothRoute, surfaceHeight, walkPose } from "../src/walk.ts";

globalThis.URL.createObjectURL ??= () => "blob:test";
const pub = new URL("../public/", import.meta.url);
const bytes = (url: string) => new Uint8Array(readFileSync(new URL(url.replace(/^\//, ""), pub)));
const get = async (url: string): Promise<Checked<Uint8Array>> => { try { return { ok: true, value: bytes(url) }; } catch { return fail("DATASET INTEGRITY", url); } };
globalThis.fetch = (async (url: unknown) => { try { return new Response(bytes(String(url))); } catch { return new Response(null, { status: 404 }); } }) as typeof fetch;

/** Flat synthetic grid with optional heights and blocked cells. */
function synthetic(nx: number, ny: number, h: (r: number, c: number) => number, blocked: Cell[] = []): TerrainGrid {
  const dem = new Float32Array(nx * ny), validity = new Uint8Array(nx * ny), slope = new Float32Array(nx * ny);
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) dem[r * nx + c] = h(r, c);
  for (const b of blocked) validity[b.row * nx + b.col] = 1;
  return { meta: { nx, ny, x0: 1000, y0: 5000, dx_proj: 2, dy_proj: 2, dx_ground_m: 2, dy_ground_m: 2, dataset_version: "synthetic" }, dem, validity, slope };
}
const plan = (g: TerrainGrid, a: Cell, b: Cell, mode: "distance" | "terrain") =>
  planRoute(g, { start: { frame: "ROI_GRID", ...a }, goal: { frame: "ROI_GRID", ...b }, mode, params: ROUTE_PARAMS, dataset_version: g.meta.dataset_version });

describe("DEM surface and any-angle line on synthetic grids", () => {
  it("surfaceHeight is the mesh surface: DEM at cell centres, SW-NE diagonal inside a quad, NaN off the grid or on NoData", () => {
    const g = synthetic(3, 3, (r, c) => 10 * r + c * c);
    const c00 = cellCenter(g.meta, { row: 0, col: 0 });
    assert.equal(surfaceHeight(g, c00.E, c00.N), 0);
    const nw = 0, ne = 1, sw = 10, se = 11;
    assert.ok(Math.abs(surfaceHeight(g, c00.E + 1, c00.N - 1) - (sw + ne) / 2) < 1e-9, "quad centre lies on the SW-NE diagonal");
    assert.ok(Math.abs(surfaceHeight(g, c00.E + 0.5, c00.N - 0.5) - (nw + 0.25 * (ne - nw) + 0.25 * (sw - nw))) < 1e-9);
    assert.ok(Math.abs(surfaceHeight(g, c00.E + 1.5, c00.N - 1.5) - (se + 0.25 * (sw - se) + 0.25 * (ne - se))) < 1e-9);
    assert.ok(Number.isNaN(surfaceHeight(g, c00.E - 1.01, c00.N)));
    assert.ok(Number.isNaN(surfaceHeight(synthetic(3, 3, () => 0, [{ row: 1, col: 1 }]), c00.E + 1, c00.N - 1)));
  });

  it("on open flat ground the smoothed line is the straight line, shorter than the 8-connected route", () => {
    for (const [nx, goal] of [[30, { row: 12, col: 27 }], [220, { row: 65, col: 210 }]] as const) { // the second route has 205 grid steps
      const g = synthetic(nx, 80, () => 5), r = plan(g, { row: 2, col: 2 }, goal, "terrain");
      const line = smoothRoute(g, r, "terrain", ROUTE_PARAMS)!;
      const straight = groundDistance(g, r.vertices_proj[0], r.vertices_proj.at(-1)!);
      assert.ok(Math.abs(line.length_horizontal_m - straight) < 1e-9, `${r.cells.length - 1} steps: straight`);
      assert.ok(r.length_horizontal_m > straight * 1.03, "the grid route carries the 8-direction detour");
      assert.equal(line.turns, 0);
    }
  });

  it("never cuts across NoData or a step steeper than g_max: the line bends around them like the grid route", () => {
    const wall = Array.from({ length: 12 }, (_, k) => ({ row: k, col: 10 })); // a NoData wall with a gap at the bottom
    const g = synthetic(20, 16, () => 0, wall), r = plan(g, { row: 2, col: 2 }, { row: 2, col: 17 }, "terrain");
    const line = smoothRoute(g, r, "terrain", ROUTE_PARAMS)!;
    assert.ok(line.vertices_proj.length > 2, "the line keeps at least one bend to pass the gap");
    for (let k = 1; k < line.vertices_proj.length; k++) {
      const a = line.vertices_proj[k - 1], b = line.vertices_proj[k];
      for (let t = 0; t <= 1; t += 0.02) assert.ok(Number.isFinite(surfaceHeight(g, a.E + (b.E - a.E) * t, a.N + (b.N - a.N) * t)), "every point of the line is on routable terrain");
    }
    const cliff = synthetic(20, 5, (_r, c) => (c >= 10 ? 3 : 0)); // a 3 m step over one 2 m cell: grade 1.5, far above g_max
    assert.equal(plan(cliff, { row: 2, col: 2 }, { row: 2, col: 17 }, "terrain").status, "NO_ROUTE");
    const over = plan(cliff, { row: 2, col: 2 }, { row: 2, col: 17 }, "distance");
    assert.ok(over.max_edge_grade > ROUTE_PARAMS.g_max, "the shortest-distance route has no grade limit");
  });
});

describe("real bundles: walker pose, guidance and smoothing", async () => {
  const m0a = await loadM0A(get), roi = await loadRoiA();
  assert.ok(m0a.ok && roi.ok);
  if (!m0a.ok || !roi.ok) return;
  const ends = demoEndpoints(roi.value.meta, roi.value.pois);
  assert.ok(ends.ok);
  if (!ends.ok) return;
  const cases: [string, TerrainGrid, RouteResult, "distance" | "terrain"][] = [];
  for (const [name, grid, a, b] of [["M0-A", m0a.value.grid, m0a.value.start, m0a.value.goal], ["ROI-A", roi.value.grid, ends.value.start, ends.value.goal]] as const) {
    const planned = planPair(grid, a, b);
    cases.push([`${name} distance`, grid, planned.routes.distance, "distance"], [`${name} terrain`, grid, planned.routes.terrain, "terrain"]);
  }

  it("the eye is always eye height above the drawn surface and stays on the computed route", () => {
    for (const [name, grid, route] of cases) {
      const cell = Math.hypot(grid.meta.dx_ground_m, grid.meta.dy_ground_m);
      for (let q = 0; q <= 600; q++) {
        const pose = walkPose(grid, route, (route.length_horizontal_m * q) / 600);
        const surface = surfaceHeight(grid, pose.eye.E, pose.eye.N);
        assert.ok(pose.eye.h - surface >= EYE_HEIGHT_M - 1e-6, `${name}: eye is above the terrain at sample ${q}`);
        assert.ok(route.vertices_proj.some((v) => groundDistance(grid, v, pose.eye) <= cell), `${name}: eye is on the route`);
        assert.ok(groundDistance(grid, pose.eye, pose.look) > 1, `${name}: the gaze points along the route, not at the feet`);
      }
    }
  });

  it("surfaceHeight is the surface of the mesh the 3D views really draw", () => {
    for (const [name, grid] of [["M0-A", m0a.value.grid], ["ROI-A", roi.value.grid]] as const) {
      const m = grid.meta, mesh = buildTerrainMesh({ ...m, h_min: 0 }, grid.dem, 1);
      const cellOf = new Int32Array(mesh.positions.length / 3);
      mesh.vertexOfCell.forEach((vertex, cell) => { if (vertex >= 0) cellOf[vertex] = cell; });
      const step = Math.max(1, Math.floor(mesh.indices.length / 3 / 5000)); // about 5000 triangles spread over the grid
      for (let t = 0; t < mesh.indices.length / 3; t += step) {
        const cells = [0, 1, 2].map((k) => cellOf[mesh.indices[t * 3 + k]]);
        if (!cells.every((c) => grid.validity[c] === 0)) continue;
        const mean = (f: (c: number) => number) => cells.reduce((a, c) => a + f(c), 0) / 3;
        const E = mean((c) => m.x0 + ((c % m.nx) + 0.5) * m.dx_proj), N = mean((c) => m.y0 - (Math.floor(c / m.nx) + 0.5) * m.dy_proj);
        const h = surfaceHeight(grid, E, N);
        if (Number.isFinite(h)) assert.ok(Math.abs(h - mean((c) => grid.dem[c])) < 1e-3, `${name}: triangle ${t} centre`); // NaN only where the neighbouring triangle of the quad is not routable
      }
    }
  });

  it("guidance marks sit on the route and on the surface", () => {
    for (const [name, grid, route] of cases) {
      const marks = guidanceMarks(grid, route, 3);
      assert.equal(marks.length, Math.ceil(route.length_horizontal_m / 3) - 1, name);
      for (const g of marks) assert.ok(g.h >= surfaceHeight(grid, g.E, g.N) - 1e-6 && Number.isFinite(g.bearing_deg));
    }
  });

  it("the smoothed line is re-checked on the DEM and is never worse than the grid route it came from", () => {
    for (const [name, grid, route, mode] of cases) {
      const line = smoothRoute(grid, route, mode, ROUTE_PARAMS)!;
      assert.deepEqual([line.vertices_proj[0], line.vertices_proj.at(-1)], [route.vertices_proj[0], route.vertices_proj.at(-1)], `${name}: same endpoints`);
      assert.ok(line.length_horizontal_m <= route.length_horizontal_m + 1e-9, `${name}: not longer`);
      assert.ok(line.turns <= line.turns_grid, `${name}: not more turns`);
      assert.ok(Math.abs(line.grid_cost_flat_equiv_m - (mode === "terrain" ? route.cost_flat_equiv_m : route.length_horizontal_m)) < 1e-6, `${name}: grid cost reproduced from the profile`);
      assert.ok(line.cost_flat_equiv_m <= line.grid_cost_flat_equiv_m * (1 + 1e-9), `${name}: model cost not higher`);
      // independent recomputation of the line's metrics from its own dense profile
      let len = 0, cost = 0;
      for (let k = 1; k < line.profile.length; k++) {
        const L = line.profile[k].s_m - line.profile[k - 1].s_m, g = line.profile[k].grade;
        if (mode === "terrain") assert.ok(Math.abs(g) <= ROUTE_PARAMS.g_max + 1e-12, `${name}: no sampled step above g_max`);
        len += L;
        cost += mode === "terrain" ? L * costMultiplier("minetti", g) : L;
      }
      assert.ok(Math.abs(len - line.length_horizontal_m) < 1e-6 && Math.abs(cost - line.cost_flat_equiv_m) < 1e-6, `${name}: metrics recomputed`);
      for (let k = 1; k < line.vertices_proj.length; k++) {
        const a = line.vertices_proj[k - 1], b = line.vertices_proj[k];
        for (let t = 0; t <= 1; t += 0.05) assert.ok(Number.isFinite(surfaceHeight(grid, a.E + (b.E - a.E) * t, a.N + (b.N - a.N) * t)), `${name}: on routable terrain`);
      }
    }
  });

  it("the reference routes are untouched by any of this", () => {
    assert.ok(Math.abs(cases[0][2].length_horizontal_m - 416.4257) < 1e-3);
    assert.ok(Math.abs(cases[2][2].length_horizontal_m - 969.161) < 1e-3);
  });
});
