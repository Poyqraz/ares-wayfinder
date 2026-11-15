import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { inspectDestination, projToScene, sceneToProj, type AnalysisGridRef } from "@ares/core";
import { destinationCard } from "../src/destinationView.ts";
import { fail, type Checked } from "../src/integrity.ts";
import { planPair } from "../src/plan.ts";
import { loadM0A, loadRegional, regionalGeoToPixel, regionalPixelToGeo } from "../src/regions.ts";
import { buildTerrainMesh, routeScenePositions } from "../src/terrainMesh.ts";

globalThis.URL.createObjectURL ??= () => "blob:test";
const pub = new URL("../public/", import.meta.url);
const read = (url: string) => new Uint8Array(readFileSync(new URL(url.replace(/^\//, ""), pub)));
const fetcher = (edit?: (url: string, b: Uint8Array) => Uint8Array) => async (url: string): Promise<Checked<Uint8Array>> => {
  try {
    const b = read(url);
    return { ok: true, value: edit ? edit(url, b) : b };
  } catch {
    return fail("DATASET INTEGRITY", `missing ${url}`);
  }
};
const flip = (b: Uint8Array) => { const c = new Uint8Array(b); c[100] ^= 0xff; return c; };

function jpegSize(b: Uint8Array): { w: number; h: number } {
  for (let i = 2; i < b.length; ) {
    const marker = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
    if (marker >= 0xc0 && marker <= 0xc3) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + len;
  }
  throw new Error("no SOF");
}

describe("M0-A region (bundle f8de9017164a)", async () => {
  const loaded = await loadM0A(fetcher());
  assert.ok(loaded.ok, loaded.ok ? "" : loaded.failure.detail);
  if (!loaded.ok) return;
  const m = loaded.value;

  it("loads the accepted 2 m HiRISE grid and its recorded rover-position cells", () => {
    assert.equal(m.meta.dataset_version, "f8de9017164a");
    assert.deepEqual([m.start, m.goal], [{ row: 273, col: 161 }, { row: 89, col: 97 }]);
    assert.equal(m.pois.length, 2);
    assert.ok(m.pois.every((p) => p.evidence?.target_location.precision === "APPROXIMATE"));
  });

  it("refuses tampered bytes, a tampered endpoint and a wrong index role", async () => {
    for (const name of ["dem.f32.bin", "endpoints.json", "terrain.json", "ortho_1m.jpg"]) {
      const r = await loadM0A(fetcher((url, b) => (url.endsWith(name) ? flip(b) : b)));
      assert.equal(r.ok, false, name);
    }
    const role = await loadM0A(fetcher((url, b) => (url.endsWith("m0a/index.json") ? new TextEncoder().encode(new TextDecoder().decode(b).replace("prototype_analysis", "release")) : b)));
    assert.equal(role.ok, false);
  });

  it("reproduces the committed analysis routes with the web planner", () => {
    const ref = JSON.parse(readFileSync(new URL("../../analysis/m0a/results/routes_f8de9017164a.json", import.meta.url), "utf8"));
    const planned = planPair(m.grid, m.start, m.goal);
    const want = (id: string) => ref.routes.find((r: { id: string }) => r.id === id);
    assert.ok(Math.abs(planned.routes.distance.length_horizontal_m - want("M0->A distance").length_horizontal_m) < 1e-9);
    assert.ok(Math.abs(planned.routes.terrain.cost_flat_equiv_m - want("M0->A terrain-minetti").cost_flat_equiv_m) < 1e-9);
    assert.equal(planned.comparison?.relation, "LOWER");
  });

  it("puts 2D and 3D route vertices at the same horizontal position (V-2) on a north-up mesh", () => {
    const route = planPair(m.grid, m.start, m.goal).routes.terrain;
    const path = routeScenePositions(m.meta, m.grid.dem, route.cells, route.vertices_proj, 1)!;
    assert.ok(path);
    // every 2D vertex appears in the 3D polyline at the same E/N (float32 scene precision); midpoints are draw-only
    const pts: { E: number; N: number }[] = [];
    for (let i = 0; i < path.positions.length; i += 3) pts.push(sceneToProj(m.meta, { x: path.positions[i], z: path.positions[i + 2] }));
    for (const v of route.vertices_proj) {
      assert.ok(pts.some((p) => Math.abs(p.E - v.E) < 1e-3 && Math.abs(p.N - v.N) < 1e-3), `vertex ${v.E},${v.N} missing in 3D`);
    }
    for (const p of pts) {
      assert.ok(route.vertices_proj.some((v) => Math.hypot(p.E - v.E, p.N - v.N) <= Math.hypot(m.meta.dx_proj, m.meta.dy_proj) / 2 + 1e-3), "3D point off the 2D path");
    }
    const mesh = buildTerrainMesh(m.meta, m.grid.dem, 1);
    const last = (m.meta.nx * m.meta.ny - 1) * 3;
    assert.ok(mesh.positions[0] < 0 && mesh.positions[2] < 0, "row 0, col 0 is north-west (x < 0, z < 0)");
    assert.ok(mesh.positions[last] > 0 && mesh.positions[last + 2] > 0, "last cell is south-east");
    const nw = projToScene(m.meta, { E: m.meta.x0 + 1, N: m.meta.y0 - 1 }, m.meta.h_min, 1);
    assert.ok(Math.abs(mesh.positions[1] - (m.grid.dem[0] - m.meta.h_min)) < 1e-4 && nw.y === 0, "heights relative to h_min of the same grid");
  });

  it("ships an ortho texture of exactly 2 x 2 pixels per analysis cell (same footprint, pixel-centre aligned)", () => {
    const size = jpegSize(read(`/data/m0a/f8de9017164a/ortho_1m.jpg`));
    assert.deepEqual(size, { w: 2 * m.meta.nx, h: 2 * m.meta.ny });
  });
});

describe("regional basemap (d3d62fc34c56)", async () => {
  const r = await loadRegional(fetcher());
  assert.ok(r.ok, r.ok ? "" : r.failure.detail);
  if (!r.ok) return;
  const g = r.value;

  it("maps pixels and coordinates both ways and agrees with the pipeline's feature pixels", () => {
    const p = regionalPixelToGeo(g, 123.5, 456.25);
    const q = regionalGeoToPixel(g, p.lat, p.lon);
    assert.ok(Math.abs(q.x - 123.5) < 1e-9 && Math.abs(q.y - 456.25) < 1e-9);
    for (const id of ["waypoint:M0", "waypoint:A", "waypoint:B"]) {
      const f = g.meta.features_px_in_science_6m[id];
      const px = regionalGeoToPixel(g, f.lat!, f.lon!);
      assert.ok(Math.abs(px.x - f.x_px!) < 2e-3 && Math.abs(px.y - f.y_px!) < 2e-3, id);
    }
    assert.deepEqual(jpegSize(read(`/data/regional/d3d62fc34c56/science_6m.jpg`)), { w: g.meta.assets["science_6m.jpg"].nx, h: g.meta.assets["science_6m.jpg"].ny });
  });

  it("refuses a tampered basemap", async () => {
    const bad = await loadRegional(fetcher((url, b) => (url.endsWith("science_6m.jpg") ? flip(b) : b)));
    assert.equal(bad.ok, false);
  });

  it("builds a source-backed destination card, routable only inside an accepted grid", async () => {
    const m = await loadM0A(fetcher());
    assert.ok(m.ok);
    if (!m.ok) return;
    const grids: AnalysisGridRef[] = [{ id: "m0a", role: "prototype_analysis", routable: true, grid: m.value.grid as AnalysisGridRef["grid"] }];
    const sk = m.value.pois[1].geo;
    const inside = destinationCard(inspectDestination("typed", sk.lat, sk.lon, grids), g);
    assert.equal(inside.status, "ready");
    assert.equal(inside.fields.routingAvailable, true);
    assert.equal(inside.fields.elevationM, Math.round(m.value.grid.dem[89 * m.value.meta.nx + 97] * 100) / 100);
    assert.match(inside.fields.elevationSource!, /HiRISE.*f8de9017164a.*UNVERIFIED/);
    const b = g.meta.features_px_in_science_6m["waypoint:B"];
    const outside = destinationCard(inspectDestination("click", b.lat!, b.lon!, grids), g);
    assert.equal(outside.fields.routingAvailable, false);
    assert.equal(outside.fields.elevationM, null);
    assert.match(outside.fields.areaName!, /C Bright Angel catalog waypoint/);
    const locked = destinationCard(inspectDestination("typed", sk.lat, sk.lon, [{ ...grids[0], routable: false }]), g);
    assert.equal(locked.fields.routingAvailable, false);
  });
});
