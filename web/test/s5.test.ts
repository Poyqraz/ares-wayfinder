import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Poi } from "@ares/contracts";
import { inspectDestination, type AnalysisGridRef } from "@ares/core";
import { destinationCard, VALIDITY_TEXT } from "../src/destinationView.ts";
import { fail, type Checked } from "../src/integrity.ts";
import { mapGeometry } from "../src/mapGeometry.ts";
import { displayStatus, evidenceKind, evidenceProblems } from "../src/poiStatus.ts";
import { loadM0A } from "../src/regions.ts";
import { buildTerrainMesh } from "../src/terrainMesh.ts";

globalThis.URL.createObjectURL ??= () => "blob:test";
const pub = new URL("../public/", import.meta.url);
const get = async (url: string): Promise<Checked<Uint8Array>> => {
  try { return { ok: true, value: new Uint8Array(readFileSync(new URL(url.replace(/^\//, ""), pub))) }; } catch { return fail("DATASET INTEGRITY", url); }
};

describe("geographic proportions on the M0-A grid (CR-005)", async () => {
  const m = await loadM0A(get);
  assert.ok(m.ok);
  if (!m.ok) return;
  const meta = m.value.meta;
  const g = mapGeometry(meta);

  it("2D view has the ground aspect ratio, not the projected one", () => {
    const ground = (meta.nx * meta.dx_ground_m) / (meta.ny * meta.dy_ground_m);
    assert.ok(Math.abs(g.view.w / g.view.h - ground) < 1e-9);
    assert.ok(Math.abs(g.view.w / g.view.h - (meta.nx * meta.dx_proj) / (meta.ny * meta.dy_proj)) > 0.05 * ground, "5 % stretch is gone");
  });

  it("independent E-W and N-S control distances: 100 ground metres are the same map length", () => {
    const E = meta.x0 + 200, dE = 100 / (meta.dx_ground_m / meta.dx_proj);
    const ew = g.toX(E + dE) - g.toX(E);
    const ns = 100; // SVG y is metres south of y0 (dy_ground = dy_proj)
    assert.ok(Math.abs(ew - ns) < 1e-9);
    assert.ok(Math.abs(g.groundPerUnitX - 1) < 1e-12, "scale bar: one SVG unit = one ground metre east-west");
  });

  it("click-to-ground and ground-to-screen round trip lands in the same DEM cell", () => {
    for (const c of [{ row: 0, col: 0 }, { row: 273, col: 161 }, { row: meta.ny - 1, col: meta.nx - 1 }]) {
      const E = meta.x0 + (c.col + 0.5) * meta.dx_proj;
      const back = g.toE(g.toX(E));
      assert.ok(Math.abs(back - E) < 1e-6);
      assert.equal(Math.floor((back - meta.x0) / meta.dx_proj), c.col);
    }
  });

  it("3D mesh spans the true ground width east-west and the true height north-south", () => {
    const mesh = buildTerrainMesh(meta, m.value.grid.dem, 1);
    const last = (meta.nx - 1) * 3, lastRow = (meta.nx * (meta.ny - 1)) * 3;
    assert.ok(Math.abs(mesh.positions[last] - mesh.positions[0] - (meta.nx - 1) * meta.dx_ground_m) < 1e-2);
    assert.ok(Math.abs(mesh.positions[lastRow + 2] - mesh.positions[2] - (meta.ny - 1) * meta.dy_ground_m) < 1e-2);
  });
});

describe("POI evidence status: missing, incompatible, invalid and valid are distinct", async () => {
  const m = await loadM0A(get);
  assert.ok(m.ok);
  if (!m.ok) return;
  const [m0, a] = m.value.pois;

  it("shows the M0-A rover positions as source-verified, approximate targets (never a tube or rock centre)", () => {
    for (const p of [m0, a]) {
      assert.equal(evidenceKind(p), "valid");
      const s = displayStatus(p);
      assert.equal(s.notice, null);
      assert.equal(s.coordinate, "VERIFIED");
      assert.equal(s.target_precision, "APPROXIMATE");
    }
    assert.match(displayStatus(a).coordinate_label, /PDS rover position VERIFIED/);
    assert.match(m0.name + a.name, /not a tube location.*not a rock centre/);
  });

  it("keeps legacy, incompatible and invalid records apart", () => {
    const legacy: Poi = { ...a, evidence: undefined };
    assert.equal(evidenceKind(legacy), "missing");
    assert.equal(displayStatus(legacy).notice, null);
    const other = { ...a, evidence: { ...a.evidence!, schema: "ares-poi-evidence/2" } } as unknown as Poi;
    assert.equal(evidenceKind(other), "incompatible");
    assert.match(displayStatus(other).notice!, /schema ares-poi-evidence\/2 is not supported/);
    const broken: Poi = { ...a, evidence: { ...a.evidence!, coordinate_source: { ...a.evidence!.coordinate_source, url: "" } } };
    assert.equal(evidenceKind(broken), "invalid");
    assert.equal(displayStatus(broken).notice, "POI evidence record invalid; showing legacy statuses");
    assert.deepEqual(evidenceProblems(broken), ["coordinate_source.url"]);
  });
});

describe("validity mask semantics and routability", async () => {
  const m = await loadM0A(get);
  assert.ok(m.ok);
  if (!m.ok) return;
  const ref = (validity: Uint8Array, routable = true): AnalysisGridRef[] =>
    [{ id: "m0a", role: "prototype_analysis", routable, grid: { ...m.value.grid, validity } as AnalysisGridRef["grid"] }];
  const p = m.value.pois[1].geo, k = 89 * m.value.meta.nx + 97;

  it("labels mask codes by the contract convention and routes only 0 and 3", () => {
    assert.deepEqual(Object.keys(VALIDITY_TEXT), ["0", "1", "2", "3"]);
    for (const [code, routable] of [[0, true], [3, true], [1, false], [2, false]] as const) {
      const v = new Uint8Array(m.value.grid.validity);
      v[k] = code;
      const info = inspectDestination("typed", p.lat, p.lon, ref(v));
      assert.equal(info.routable_in !== null, routable, `code ${code}`);
      const card = destinationCard(info, null);
      if (code === 1) assert.equal(card.status, "nodata");
      else assert.match(card.fields.coverage!, new RegExp(VALIDITY_TEXT[code].replace(/[()/]/g, ".")));
    }
    assert.doesNotMatch(destinationCard(inspectDestination("typed", p.lat, p.lon, ref(m.value.grid.validity as Uint8Array)), null).fields.coverage!, /validity 0/);
  });
});

describe("terrain-feature evidence layer (F01-F03)", async () => {
  const { loadFeatures } = await import("../src/features.ts");
  it("loads hash-checked, keeps F02/F03 unmeasured and refuses tampering", async () => {
    const ok = await loadFeatures(get);
    assert.ok(ok.ok);
    if (!ok.ok) return;
    assert.deepEqual(ok.value.features.map((f) => f.feature_id), ["F01", "F02", "F03"]);
    assert.ok(ok.value.features.slice(1).every((f) => Object.values(f.measurements).every((v) => v === null) && f.three_raster_validation === "PENDING"));
    assert.equal(ok.value.features[0].three_raster_validation, "AUTOMATED_MEASUREMENT_PENDING_REVIEW");
    const bad = await loadFeatures(async (url) => {
      const r = await get(url);
      if (!r.ok || !url.endsWith("F01_panel.png")) return r;
      const c = new Uint8Array(r.value); c[200] ^= 0xff; return { ok: true, value: c };
    });
    assert.equal(bad.ok, false);
  });
});
