// S13: the Conservative Terrain strategy. Its search is checked against an independent relaxation written here,
// its hard rules are re-checked cell by cell, and the two frozen strategies are confirmed untouched.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Cell } from "@ares/contracts";
import { costMultiplier, planRoute, type TerrainGrid } from "@ares/core";
import { CONSERVATIVE, conservativeCost, planConservative, slopePenalty } from "../src/conservative.ts";
import { ENVIRONMENT, ENV_CATEGORY, SCENARIO_STORM } from "../src/environment.ts";
import { fail, type Checked } from "../src/integrity.ts";
import { loadRoiA } from "../src/load.ts";
import { demoEndpoints, planPair, ROUTE_PARAMS } from "../src/plan.ts";
import { loadM0A } from "../src/regions.ts";
import { cellGradient, gateGrid, routeTerrain, summarizeTerrain } from "../src/traverse.ts";

globalThis.URL.createObjectURL ??= () => "blob:test";
const pub = new URL("../public/", import.meta.url);
const bytes = (url: string) => new Uint8Array(readFileSync(new URL(url.replace(/^\//, ""), pub)));
const get = async (url: string): Promise<Checked<Uint8Array>> => { try { return { ok: true, value: bytes(url) }; } catch { return fail("DATASET INTEGRITY", url); } };
globalThis.fetch = (async (url: unknown) => { try { return new Response(bytes(String(url))); } catch { return new Response(null, { status: 404 }); } }) as typeof fetch;

const DEG = 180 / Math.PI, tan = (d: number) => Math.tan(d / DEG);
function terrain(nx: number, ny: number, h: (r: number, c: number) => number): TerrainGrid {
  const dem = new Float32Array(nx * ny), validity = new Uint8Array(nx * ny), slope = new Float32Array(nx * ny);
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) dem[r * nx + c] = h(r, c);
  const g: TerrainGrid = { meta: { nx, ny, x0: 0, y0: 1000, dx_proj: 2, dy_proj: 2, dx_ground_m: 2, dy_ground_m: 2, dataset_version: "synthetic" }, dem, validity, slope };
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
    const q = cellGradient(g, Math.min(ny - 2, Math.max(1, r)), Math.min(nx - 2, Math.max(1, c)));
    slope[r * nx + c] = q ? Math.atan(Math.hypot(q.east, q.north)) * DEG : NaN;
  }
  return g;
}
const ref = (g: TerrainGrid, a: Cell, b: Cell) => planRoute(g, { start: { frame: "ROI_GRID", ...a }, goal: { frame: "ROI_GRID", ...b }, mode: "terrain", params: ROUTE_PARAMS, dataset_version: g.meta.dataset_version });
const cons = (g: TerrainGrid, a: Cell, b: Cell, sigma = 0) => planConservative(g, a, b, ROUTE_PARAMS, sigma, ref(g, a, b));
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** Independent check: Bellman-Ford relaxation over every edge with the documented cost, written without the module's search. */
function bellmanFord(g: TerrainGrid, s: Cell, t: Cell, sigma: number): number {
  const { nx, ny } = g.meta, near = gateGrid(g, true).slope, d = new Float64Array(nx * ny).fill(Infinity);
  const ok = (r: number, c: number) => r >= 0 && c >= 0 && r < ny && c < nx && g.validity[r * nx + c] === 0 && near[r * nx + c] <= CONSERVATIVE.gate_deg;
  if (!ok(s.row, s.col)) return Infinity;
  d[s.row * nx + s.col] = 0;
  for (let pass = 0; pass < nx * ny; pass++) {
    let changed = false;
    for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
      const du = d[r * nx + c];
      if (!Number.isFinite(du)) continue;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if ((!dr && !dc) || !ok(r + dr, c + dc)) continue;
        if (dr && dc && !(ok(r, c + dc) && ok(r + dr, c))) continue;
        const L = dr && dc ? Math.sqrt(8) : 2, grade = (g.dem[(r + dr) * nx + c + dc] - g.dem[r * nx + c]) / L;
        if (Math.abs(grade) > ROUTE_PARAMS.g_max) continue;
        const p = Math.min(1, Math.max(0, (near[(r + dr) * nx + c + dc] + sigma - 5) / 20)) ** 2;
        const alt = du + L * costMultiplier("minetti", grade) * (1 + 4 * p);
        if (alt < d[(r + dr) * nx + c + dc] - 1e-12) { d[(r + dr) * nx + c + dc] = alt; changed = true; }
      }
    }
    if (!changed) break;
  }
  return d[t.row * nx + t.col];
}

describe("Conservative Terrain: the search and its rules", () => {
  it("finds the least-cost path of its own documented objective (independent Bellman-Ford agrees on 12 rough terrains)", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const next = rng(seed), bumps = Array.from({ length: 5 }, () => [next() * 14, next() * 14, 1 + next() * 3.5, 2 + next() * 4]);
      const g = terrain(14, 14, (r, c) => bumps.reduce((z, [br, bc, amp, w]) => z + amp * Math.exp(-((r - br) ** 2 + (c - bc) ** 2) / (w * w)), 0));
      const a = { row: 1, col: 1 }, b = { row: 12, col: 12 }, sigma = seed % 2 ? 0 : 4, route = cons(g, a, b, sigma), oracle = bellmanFord(g, a, b, sigma);
      if (route.status !== "OK") { assert.ok(!Number.isFinite(oracle), `seed ${seed}: both say there is no corridor`); continue; }
      const own = conservativeCost(g, route.cells, ROUTE_PARAMS, sigma)!;
      assert.ok(Math.abs(own - oracle) < 1e-9 * Math.max(1, oracle), `seed ${seed}: ${own} vs ${oracle}`);
    }
  });

  it("the preference is zero on gentle ground, grows with slope, and includes the uncertainty margin", () => {
    assert.equal(slopePenalty(3, 0), 0);
    assert.equal(slopePenalty(5, 0), 0);
    assert.ok(slopePenalty(15, 0) > 0 && slopePenalty(15, 0) < slopePenalty(20, 0) && slopePenalty(25, 0) === 1);
    assert.ok(slopePenalty(12, 4) > slopePenalty(12, 0), "a slope that might be steeper is treated as steeper");
  });

  it("on level ground it is simply the shortest route: it never lengthens a path for its own sake", () => {
    const g = terrain(40, 30, (r, c) => 0.01 * c + 0.005 * r), a = { row: 3, col: 3 }, b = { row: 25, col: 36 };
    assert.equal(cons(g, a, b).length_horizontal_m, ref(g, a, b).length_horizontal_m);
  });

  it("goes round an 18 degree rise that the terrain-aware route crosses, and reports a longer, gentler path", () => {
    // a ridge 18 degrees steep on both flanks across the direct line, with level ground round its southern end
    const g = terrain(60, 40, (r, c) => (r < 26 ? Math.max(0, 6 - Math.abs(c - 30)) * 2 * tan(18) : 0));
    const a = { row: 10, col: 6 }, b = { row: 10, col: 54 }, t = ref(g, a, b), k = cons(g, a, b);
    assert.equal(t.status, "OK");
    assert.equal(k.status, "OK");
    const mt = summarizeTerrain(routeTerrain(g, t)), mk = summarizeTerrain(routeTerrain(g, k));
    assert.ok(mt.max_cell_slope_deg > 15, `terrain-aware crosses ${mt.max_cell_slope_deg.toFixed(1)} degree ground`);
    assert.ok(mk.max_cell_slope_deg < 6, `conservative stays on ${mk.max_cell_slope_deg.toFixed(1)} degree ground`);
    assert.ok(k.length_horizontal_m > t.length_horizontal_m && k.length_horizontal_m < 2.2 * t.length_horizontal_m, "longer, but not by more than the detour needs");
    assert.ok(k.constraint_notes.some((n) => n.includes("Experimental parameters, not safety limits")));
  });

  it("fails closed: steep ground round the goal gives NO_ROUTE, a steep endpoint is reported, and no cells are returned", () => {
    const hill = terrain(50, 50, (r, c) => { const d = Math.hypot(r - 25, c - 25) * 2; return d < 12 ? 10 : d < 12 + 10 / tan(28) ? 10 - (d - 12) * tan(28) : 0; });
    const ring = cons(hill, { row: 3, col: 3 }, { row: 25, col: 25 });
    assert.equal(ring.status, "NO_ROUTE");
    assert.equal(ring.cells.length, 0);
    assert.ok(ring.constraint_notes.at(-1)!.includes("Nothing was relaxed"));
    assert.equal(ref(hill, { row: 3, col: 3 }, { row: 25, col: 25 }).status, "OK", "the terrain-aware route does climb it");
    const onSlope = cons(hill, { row: 3, col: 3 }, { row: 25, col: 34 });
    assert.equal(onSlope.status, "ENDPOINT_BLOCKED_BY_POLICY");
    assert.ok(onSlope.constraint_notes.at(-1)!.includes("the destination lies on or beside ground steeper than 25°"));
  });
});

describe("Conservative Terrain on the real bundles", async () => {
  const m0a = await loadM0A(get), roi = await loadRoiA();
  assert.ok(m0a.ok && roi.ok);
  if (!m0a.ok || !roi.ok) return;
  const ends = demoEndpoints(roi.value.meta, roi.value.pois);
  assert.ok(ends.ok);
  if (!ends.ok) return;

  it("M0-A reference: a valid corridor that holds every hard rule, on gentler ground than the terrain-aware route", () => {
    const g = m0a.value.grid, nx = g.meta.nx, pair = planPair(g, m0a.value.start, m0a.value.goal);
    assert.ok(Math.abs(pair.routes.terrain.length_horizontal_m - 416.4257) < 1e-3 && Math.abs(pair.routes.terrain.cost_flat_equiv_m - 664.3901) < 1e-3, "frozen reference untouched");
    const k = planConservative(g, m0a.value.start, m0a.value.goal, ROUTE_PARAMS, 4, pair.routes.terrain), near = gateGrid(g, true).slope;
    assert.equal(k.status, "OK");
    assert.deepEqual([k.cells[0], k.cells.at(-1)], [m0a.value.start, m0a.value.goal]);
    for (let i = 0; i < k.cells.length; i++) {
      const c = k.cells[i];
      assert.equal(g.validity[c.row * nx + c.col], 0);
      assert.ok(near[c.row * nx + c.col] <= CONSERVATIVE.gate_deg, `cell ${i}: neighbourhood slope within the gate`);
      if (i > 0) {
        const q = k.cells[i - 1], L = Math.hypot((c.col - q.col) * g.meta.dx_ground_m, (c.row - q.row) * g.meta.dy_ground_m);
        assert.ok(Math.max(Math.abs(c.row - q.row), Math.abs(c.col - q.col)) === 1 && Math.abs(g.dem[c.row * nx + c.col] - g.dem[q.row * nx + q.col]) / L <= ROUTE_PARAMS.g_max + 1e-12);
      }
    }
    const mk = summarizeTerrain(routeTerrain(g, k)), mt = summarizeTerrain(routeTerrain(g, pair.routes.terrain));
    assert.ok(mk.metres_over[15] <= mt.metres_over[15], `on ground over 15 degrees: conservative ${mk.metres_over[15].toFixed(0)} m, terrain-aware ${mt.metres_over[15].toFixed(0)} m`);
    assert.ok(k.length_horizontal_m >= pair.routes.distance.length_horizontal_m - 1e-9 && k.length_horizontal_m < 1.6 * pair.routes.distance.length_horizontal_m, "longer than the shortest route by a bounded detour");
    assert.ok(conservativeCost(g, k.cells, ROUTE_PARAMS, 4)! <= conservativeCost(g, pair.routes.terrain.cells, ROUTE_PARAMS, 4)! + 1e-9, "under its own objective it is at least as good as the terrain-aware path");
    assert.ok(k.cost_flat_equiv_m >= pair.routes.terrain.cost_flat_equiv_m - 1e-9, "and it cannot beat the terrain-aware route on plain walking cost");
  });

  it("ROI-A reference: valid, and at 20 m cells barely different from the terrain-aware route (stated as a limit)", () => {
    const g = roi.value.grid, pair = planPair(g, ends.value.start, ends.value.goal);
    assert.ok(Math.abs(pair.routes.terrain.length_horizontal_m - 969.161) < 1e-3, "frozen reference untouched");
    const k = planConservative(g, ends.value.start, ends.value.goal, ROUTE_PARAMS, 0, pair.routes.terrain);
    assert.equal(k.status, "OK");
    assert.ok(Math.abs(k.length_horizontal_m - pair.routes.terrain.length_horizontal_m) < 0.1 * pair.routes.terrain.length_horizontal_m);
    assert.ok(k.constraint_notes.some((n) => n.includes("not quantified for this grid")));
  });
});

describe("environmental context", () => {
  it("every entry says what kind of statement it is, where and when it holds, and where it comes from", () => {
    assert.deepEqual([...new Set(ENVIRONMENT.map((e) => e.layer))].sort(), ["dust", "radiation", "weather"]);
    for (const e of ENVIRONMENT) {
      assert.ok(e.category in ENV_CATEGORY, e.id);
      assert.ok(e.title && e.value && e.where && e.when && e.limits, e.id);
      if (e.category === "measured" || e.category === "model") assert.ok(e.source.length > 8, `${e.id} cites a source`);
      if (e.category === "measured") assert.ok(!/Jezero-wide|map of/i.test(e.where) || /not/i.test(e.limits), e.id);
    }
    for (const layer of ["dust", "weather", "radiation"]) assert.ok(ENVIRONMENT.some((e) => e.layer === layer && e.category === "unknown"), `${layer}: what is not known is stated`);
    assert.ok(ENVIRONMENT.every((e) => e.category !== "measured" || !e.spatial), "no measurement is offered as a map of the region");
    const text = JSON.stringify(ENVIRONMENT);
    assert.ok(!/\bsafe\b|forecast for|live /i.test(text.replace(/not a (verified )?(NASA )?(weather )?forecast|no live|not live/gi, "")));
  });

  it("the storm is a scenario event, never presented as a forecast", () => {
    assert.equal(SCENARIO_STORM.category, "scenario");
    assert.equal(SCENARIO_STORM.message, "Dust storm expected in 2 hours.");
    assert.match(SCENARIO_STORM.disclaimer, /not a verified NASA weather forecast/);
    assert.match(SCENARIO_STORM.clock, /does not run with the walk playback/);
  });
});
