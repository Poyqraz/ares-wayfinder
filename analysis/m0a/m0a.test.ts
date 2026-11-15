// M0-A prototype route tests on the real analysis bundle. Run: node --test analysis/m0a/m0a.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { cellCenter, geoToProj, planRoute, projToCell, projToGeo, type TerrainGrid } from "../../core/src/index.ts";
import { loadM0A, PARAMS } from "./route_m0a.ts";

const { grid, meta, endpoints } = loadM0A();
const ver = meta.dataset_version;
const S = { row: endpoints.start_M0.row, col: endpoints.start_M0.col };
const T = { row: endpoints.goal_A.row, col: endpoints.goal_A.col };
const req = (a: { row: number; col: number }, b: { row: number; col: number }, mode: "distance" | "terrain", g = grid, curve: "minetti" | "tobler" = "minetti", gmax = 0.45) =>
  planRoute(g, { start: { frame: "ROI_GRID", ...a }, goal: { frame: "ROI_GRID", ...b }, mode, params: PARAMS(curve, gmax), dataset_version: ver });
const withValidity = (edit: (v: Uint8Array) => void): TerrainGrid => {
  const v = new Uint8Array(grid.validity);
  edit(v);
  return { ...grid, validity: v };
};
const idx = (c: { row: number; col: number }) => c.row * meta.nx + c.col;

function assertLegal(g: TerrainGrid, cells: { row: number; col: number }[]) {
  const ok = (r: number, c: number) => r >= 0 && c >= 0 && r < meta.ny && c < meta.nx && (g.validity[r * meta.nx + c] === 0 || g.validity[r * meta.nx + c] === 3);
  for (const c of cells) assert.ok(ok(c.row, c.col), `route uses a non-routable cell ${JSON.stringify(c)}`);
  for (let k = 1; k < cells.length; k++) {
    const a = cells[k - 1], b = cells[k];
    assert.equal(Math.max(Math.abs(b.row - a.row), Math.abs(b.col - a.col)), 1, "steps are 8-connected");
    if (a.row !== b.row && a.col !== b.col) assert.ok(ok(a.row, b.col) && ok(b.row, a.col), "no corner cutting");
  }
}

describe("M0-A analysis bundle", () => {
  it("is the HiRISE-derived 2 m prototype grid, fully valid, outside the ROI-A index", () => {
    assert.equal(meta.roi_id, "m0a");
    assert.equal(meta.dx_proj, 2);
    assert.equal(meta.lat_ts_deg, 0);
    assert.ok(Math.abs(meta.dx_ground_m / meta.dx_proj - Math.cos((18.4557 * Math.PI) / 180)) < 1e-4, "cos(lat) applied once for lat_ts 0");
    assert.ok(Array.prototype.every.call(grid.validity, (v: number) => v === 0));
    const live = JSON.parse(readFileSync(new URL("../../web/public/data/index.json", import.meta.url), "utf8"));
    assert.equal(live.m0a, undefined, "M0-A must not be in the live ROI-A index");
  });

  it("snaps rover positions to the containing cell (PixelIsArea, floor) and round-trips geo <-> proj", () => {
    for (const e of [endpoints.start_M0, endpoints.goal_A]) {
      const q = geoToProj(meta, { lat: e.lat, lon: e.lon });
      assert.ok(Math.abs(q.E - e.E) < 1e-6 && Math.abs(q.N - e.N) < 1e-6, "TS and Python projection agree");
      const c = projToCell(meta, q)!;
      assert.deepEqual(c, { row: e.row, col: e.col });
      const ctr = cellCenter(meta, c);
      assert.ok(Math.abs(ctr.E - q.E) <= meta.dx_proj / 2 && Math.abs(ctr.N - q.N) <= meta.dy_proj / 2, "point lies inside its cell");
      const back = projToGeo(meta, q);
      assert.ok(Math.abs(back.lat - e.lat) < 1e-12 && Math.abs(back.lon - e.lon) < 1e-12);
    }
    // a point exactly on the west/north edge of a cell belongs to that cell; the east edge to the next one
    const corner = { E: meta.x0 + 10 * meta.dx_proj, N: meta.y0 - 20 * meta.dy_proj };
    assert.deepEqual(projToCell(meta, corner), { row: 20, col: 10 });
    assert.equal(projToCell(meta, { E: meta.x0 - 0.001, N: meta.y0 - 1 }), null);
    assert.equal(projToCell(meta, { E: meta.x0 + meta.nx * meta.dx_proj, N: meta.y0 - 1 }), null);
  });

  it("matches the independent Python oracle for every policy and direction", () => {
    const oracle = JSON.parse(readFileSync(new URL(`results/oracle_${ver}.json`, import.meta.url), "utf8"));
    assert.equal(oracle.g6.result, "CONNECTED");
    for (const c of oracle.cases) {
      const r = planRoute(grid, { start: { frame: "ROI_GRID", row: c.start[0], col: c.start[1] }, goal: { frame: "ROI_GRID", row: c.goal[0], col: c.goal[1] },
        mode: c.mode, params: PARAMS(c.curve), dataset_version: ver });
      assert.equal(r.status, "OK", c.id);
      assert.ok(Math.abs(r.cost_flat_equiv_m - c.expected_cost) <= 1e-9 * Math.max(1, c.expected_cost), `${c.id}: ${r.cost_flat_equiv_m} vs ${c.expected_cost}`);
      assertLegal(grid, r.cells);
    }
  });

  it("is deterministic", () => {
    const a = req(S, T, "terrain"), b = req(S, T, "terrain");
    assert.deepEqual(a.cells, b.cells);
    assert.equal(a.cost_flat_equiv_m, b.cost_flat_equiv_m);
  });

  it("routes around NoData placed on the nominal route and never cuts its corners", () => {
    const nominal = req(S, T, "terrain");
    const mid = nominal.cells[Math.floor(nominal.cells.length / 2)];
    const g = withValidity((v) => {
      for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) v[idx({ row: mid.row + dr, col: mid.col + dc })] = 1;
      // a diagonal "gate" of two NoData cells next to the block: passing between them would be corner cutting
      v[idx({ row: mid.row - 5, col: mid.col + 5 })] = 1;
      v[idx({ row: mid.row - 4, col: mid.col + 4 })] = 1;
    });
    const r = req(S, T, "terrain", g);
    assert.equal(r.status, "OK");
    assertLegal(g, r.cells);
    assert.ok(r.cost_flat_equiv_m >= nominal.cost_flat_equiv_m - 1e-9);
    assert.ok(!r.cells.some((c) => Math.abs(c.row - mid.row) <= 3 && Math.abs(c.col - mid.col) <= 3));
  });

  it("refuses NoData endpoints and reports NO_ROUTE instead of relaxing the threshold", () => {
    assert.equal(req(S, T, "terrain", withValidity((v) => { v[idx(T)] = 1; })).status, "INVALID_ENDPOINT_NODATA");
    const ring = withValidity((v) => {
      for (let d = -6; d <= 6; d++) for (const [r, c] of [[T.row - 6, T.col + d], [T.row + 6, T.col + d], [T.row + d, T.col - 6], [T.row + d, T.col + 6]]) v[r * meta.nx + c] = 1;
    });
    assert.equal(req(S, T, "terrain", ring).status, "NO_ROUTE");
    assert.equal(req(S, T, "terrain", grid, "minetti", 0.001).status, "NO_ROUTE");
  });

  it("handles grid-corner endpoints and rejects endpoints outside the grid", () => {
    const r = req({ row: 0, col: 0 }, { row: meta.ny - 1, col: meta.nx - 1 }, "distance");
    assert.equal(r.status, "OK");
    assertLegal(grid, r.cells);
    const out = planRoute(grid, { start: { frame: "PROJ", E: meta.x0 - 1, N: meta.y0 - 1 }, goal: { frame: "ROI_GRID", ...T }, mode: "distance", params: PARAMS("minetti"), dataset_version: ver });
    assert.equal(out.status, "ENDPOINT_OUTSIDE_ROI");
    const wrong = planRoute(grid, { start: { frame: "ROI_GRID", ...S }, goal: { frame: "ROI_GRID", ...T }, mode: "distance", params: PARAMS("minetti"), dataset_version: "roi_a" });
    assert.equal(wrong.status, "DATASET_VERSION_MISMATCH");
  });

  it("keeps the terrain route no costlier than the shortest route under the same model, in both directions", () => {
    for (const [a, b] of [[S, T], [T, S]] as const) {
      const t = req(a, b, "terrain"), d = req(a, b, "distance");
      assert.ok(t.length_horizontal_m >= d.length_horizontal_m - 1e-9, "distance mode is the shortest");
      assert.ok(t.max_edge_grade <= 0.45 + 1e-12);
    }
  });
});
