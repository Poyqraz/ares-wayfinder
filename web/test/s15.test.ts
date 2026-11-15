// S15: the wider M0-A-B HiRISE grid that lets mission B be routed. It must be the frozen M0-A grid where they overlap,
// reproduce the frozen reference route, agree with the independent Python oracle, and carry the owner's decision on its two human gates.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { geoToProj, planRoute, projToCell } from "@ares/core";
import { conservativeCost, planConservative } from "../src/conservative.ts";
import { fail, type Checked } from "../src/integrity.ts";
import { SHUYAK } from "../src/missionB.ts";
import { isExplore, MISSIONS } from "../src/missions.ts";
import { planPair, ROUTE_PARAMS } from "../src/plan.ts";
import { loadM0A, M0AB_NOTES, M0AB_SCENARIO } from "../src/regions.ts";
import { M0A_SLOPE_SIGMA_DEG, routeTerrain, summarizeTerrain } from "../src/traverse.ts";

globalThis.URL.createObjectURL ??= () => "blob:test";
const pub = new URL("../public/", import.meta.url);
const bytes = (url: string) => new Uint8Array(readFileSync(new URL(url.replace(/^\//, ""), pub)));
const get = async (url: string): Promise<Checked<Uint8Array>> => { try { return { ok: true, value: bytes(url) }; } catch { return fail("DATASET INTEGRITY", url); } };
const near = (x: number, y: number, tol = 1e-3) => Math.abs(x - y) < tol;

describe("wider M0-A-B grid (mission B)", async () => {
  const frozen = await loadM0A(get), wide = await loadM0A(get, "m0ab");
  assert.ok(frozen.ok && wide.ok);
  if (!frozen.ok || !wide.ok) return;
  const f = frozen.value.grid, w = wide.value.grid;
  const meta = w.meta as unknown as { roi_id: string; gates: Record<string, string>; superset_of: { dataset_version: string; row_offset: number; col_offset: number } };
  const shift = (c: { row: number; col: number }) => ({ row: c.row + meta.superset_of.row_offset, col: c.col + meta.superset_of.col_offset });

  it("is a separate dataset with its own gate record: automated gates pass, the two human gates carry the owner's decision", () => {
    assert.equal(meta.roi_id, "m0ab");
    assert.notEqual(w.meta.dataset_version, f.meta.dataset_version);
    assert.equal(f.meta.dataset_version, "f8de9017164a", "the frozen bundle is still the frozen bundle");
    assert.match(meta.gates.G1_G2, /^PASS/);
    assert.match(meta.gates.G3, /^PASS/);
    assert.match(meta.gates.G4, /MEETS_LIMITS; approved for prototype analysis, owner \(Poyraz\), 2026-11-15/);
    assert.match(meta.gates.G5, /confirmed for the wider box, owner \(Poyraz\), 2026-11-15/);
    const signed = JSON.parse(readFileSync(new URL("../../analysis/m0ab/validation/signoff.json", import.meta.url), "utf8")) as { G4: string; scope: string };
    assert.match(signed.scope, /does not verify the vertical datum.*or approve a merge/, "the decision's limits are written down with it");
    assert.ok(meta.gates.G4.includes(signed.G4));
    assert.ok(M0AB_NOTES.some((n) => /approved for prototype analysis on 15 Nov 2026 \(G4, G5\)/.test(n)));
    assert.ok(M0AB_NOTES.some((n) => /Vertical datum UNVERIFIED/.test(n)), "the open items stay stated");
    assert.match(M0AB_SCENARIO, /candidate route corridor \(prototype, wider grid\)/);
  });

  it("holds the frozen M0-A grid cell for cell: elevation, slope and validity are bit-identical", () => {
    assert.equal(meta.superset_of.dataset_version, f.meta.dataset_version);
    assert.equal(w.meta.dx_ground_m, f.meta.dx_ground_m);
    assert.ok(w.meta.nx > f.meta.nx && w.meta.ny > f.meta.ny);
    let different = 0;
    for (let row = 0; row < f.meta.ny; row++) for (let col = 0; col < f.meta.nx; col++) {
      const i = row * f.meta.nx + col, j = (row + meta.superset_of.row_offset) * w.meta.nx + col + meta.superset_of.col_offset;
      if (!Object.is(f.dem[i], w.dem[j]) || !Object.is(f.slope[i], w.slope[j]) || f.validity[i] !== w.validity[j]) different += 1;
    }
    assert.equal(different, 0);
    assert.ok(w.validity.every((v) => v === 0), "no NoData in the wider box");
  });

  it("reproduces the frozen M0 -> A reference on the wider grid, for all three strategies", () => {
    const a = shift(frozen.value.start), b = shift(frozen.value.goal), pair = planPair(w, a, b), old = planPair(f, frozen.value.start, frozen.value.goal);
    assert.ok(near(pair.routes.terrain.length_horizontal_m, 416.4257) && near(pair.routes.terrain.cost_flat_equiv_m, 664.3901));
    assert.equal(pair.routes.terrain.cost_flat_equiv_m, old.routes.terrain.cost_flat_equiv_m);
    assert.equal(pair.routes.distance.length_horizontal_m, old.routes.distance.length_horizontal_m);
    assert.deepEqual(pair.routes.terrain.cells, old.routes.terrain.cells.map(shift), "the same cells, not only the same numbers");
    const k = planConservative(w, a, b, ROUTE_PARAMS, M0A_SLOPE_SIGMA_DEG, pair.routes.terrain);
    assert.ok(near(k.length_horizontal_m, 453.513) && near(k.cost_flat_equiv_m, 695.372));
  });

  it("M0 -> B: endpoints are the recorded rover positions, and the three strategies give the audited numbers", () => {
    assert.deepEqual(wide.value.start, shift(frozen.value.start), "the same M0 rover position as the frozen grid's start");
    assert.deepEqual(projToCell(w.meta, geoToProj(w.meta, { lat: SHUYAK.lat, lon: SHUYAK.lon })), wide.value.goal, "Shuyak's and Mageik's sampling positions fall in the same 2 m cell");
    const pair = planPair(w, wide.value.start, wide.value.goal), d = pair.routes.distance, t = pair.routes.terrain;
    assert.ok(d.status === "OK" && t.status === "OK");
    assert.ok(near(d.length_horizontal_m, 438.587) && near(t.length_horizontal_m, 438.587) && near(t.cost_flat_equiv_m, 615.136));
    assert.equal(pair.comparison?.relation, "LOWER");
    assert.ok(t.max_edge_grade <= ROUTE_PARAMS.g_max);
    const k = planConservative(w, wide.value.start, wide.value.goal, ROUTE_PARAMS, M0A_SLOPE_SIGMA_DEG, t);
    assert.equal(k.status, "OK");
    assert.ok(near(k.length_horizontal_m, 438.587) && near(k.cost_flat_equiv_m, 619.149));
    assert.notEqual(conservativeCost(w, k.cells, ROUTE_PARAMS, M0A_SLOPE_SIGMA_DEG), null, "every hard rule holds along it");
    const sk = summarizeTerrain(routeTerrain(w, k)), st = summarizeTerrain(routeTerrain(w, t));
    assert.ok(sk.max_cell_slope_deg < st.max_cell_slope_deg && sk.metres_over[15] === 0, `conservative ${sk.max_cell_slope_deg.toFixed(1)} deg, terrain-aware ${st.max_cell_slope_deg.toFixed(1)} deg`);
    for (const route of [d, t, k]) for (const c of route.cells) assert.equal(w.validity[c.row * w.meta.nx + c.col], 0);
  });

  it("agrees with the independent Python oracle on every pair and direction", () => {
    const ver = w.meta.dataset_version;
    const oracle = JSON.parse(readFileSync(new URL(`../../analysis/m0ab/results/oracle_${ver}.json`, import.meta.url), "utf8")) as { dataset_version: string; g6: { all_pairs_connected: Record<string, boolean> }; cases: { id: string; start: [number, number]; goal: [number, number]; mode: "distance" | "terrain"; curve: "minetti" | "tobler"; g_max: number; expected_cost: number }[] };
    assert.equal(oracle.dataset_version, ver);
    assert.deepEqual(oracle.g6.all_pairs_connected, { "M0->A": true, "M0->B": true, "A->B": true });
    assert.equal(oracle.cases.length, 18);
    for (const c of oracle.cases) {
      const r = planRoute(w, { start: { frame: "ROI_GRID", row: c.start[0], col: c.start[1] }, goal: { frame: "ROI_GRID", row: c.goal[0], col: c.goal[1] }, mode: c.mode,
        params: { cost_curve: c.curve, g_max: c.g_max, cell_slope_gate_deg: null, connectivity: 8 }, dataset_version: ver });
      assert.equal(r.status, "OK", c.id);
      assert.ok(Math.abs(r.cost_flat_equiv_m - c.expected_cost) <= 1e-9 * Math.max(1, c.expected_cost), `${c.id}: ${r.cost_flat_equiv_m} vs ${c.expected_cost}`);
    }
  });

  it("mission B plans on this grid; C still has none", () => {
    assert.equal(MISSIONS.B.planning, "m0a");
    assert.equal(MISSIONS.B.noRoute, undefined);
    assert.deepEqual([isExplore("B"), isExplore("C")], [false, true]);
    assert.ok(MISSIONS.B.readiness.some((x) => /owner-approved for prototype analysis/.test(x.label) && x.state === "prototype"));
  });
});
