import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { TerrainMeta } from "@ares/contracts";
import { cellCenter, projToScene } from "@ares/core";
import { assembleGrid, parsePois, verifyRoiBundle } from "../src/integrity.ts";
import { demoEndpoints, planPair } from "../src/plan.ts";
import { ROUTE_LIFT_M, buildTerrainMesh, cellUv, routeScenePositions, triangleNormalY } from "../src/terrainMesh.ts";

const meta = {
  nx: 2,
  ny: 2,
  x0: 1000,
  y0: 5000,
  dx_proj: 20,
  dy_proj: 20,
  h_min: 0,
} as TerrainMeta;

describe("terrain mesh", () => {
  it("keeps horizontal metres and scales only height", () => {
    const dem = [10, 10, 10, 30];
    const flat = buildTerrainMesh(meta, dem, 1);
    const tall = buildTerrainMesh(meta, dem, 5);
    const northWest = projToScene(meta, cellCenter(meta, { row: 0, col: 0 }), 10, 1);
    assert.equal(flat.positions[0], northWest.x);
    assert.equal(flat.positions[1], northWest.y);
    assert.equal(flat.positions[2], northWest.z);
    assert.ok(flat.positions[0]! < flat.positions[3]!, "east is +X");
    assert.ok(flat.positions[2]! < flat.positions[8]!, "south is +Z, so north is -Z");
    for (let i = 0; i < flat.positions.length; i += 3) {
      assert.equal(tall.positions[i], flat.positions[i]);
      assert.equal(tall.positions[i + 1], (flat.positions[i + 1] ?? 0) * 5);
      assert.equal(tall.positions[i + 2], flat.positions[i + 2]);
    }
  });

  it("winds triangles so the normal faces up", () => {
    const mesh = buildTerrainMesh(meta, [1, 2, 3, 4], 1);
    assert.equal(mesh.indices.length / 3, 2);
    assert.ok(triangleNormalY(mesh.positions, mesh.indices, 0) > 0);
    assert.ok(triangleNormalY(mesh.positions, mesh.indices, 1) > 0);
  });

  it("drops any triangle that would cross a missing sample", () => {
    const mesh = buildTerrainMesh(meta, [1, 2, Number.NaN, 4], 1);
    assert.equal(mesh.indices.length, 0);
    assert.equal(mesh.vertexOfCell[2], -1);
  });

  it("places the north-west cell on the centre of the top-left texel", () => {
    const mesh = buildTerrainMesh(meta, [1, 1, 1, 1], 1);
    const uv = cellUv(2, 2, 0, 0);
    assert.equal(uv.u, 0.25);
    assert.equal(uv.v, 0.75);
    assert.equal(mesh.uvs[0], uv.u);
    assert.equal(mesh.uvs[1], uv.v);
  });

  it("lifts NW→SE midpoints above the SW–NE split at high VE", () => {
    // Linear NW–SE mean is 0; SW–NE ridge is 100, so the draw midpoint must clear the split.
    const dem = [0, 100, 100, 0];
    const cells = [
      { row: 0, col: 0 },
      { row: 1, col: 1 },
    ];
    const vertices = [cellCenter(meta, cells[0]!), cellCenter(meta, cells[1]!)];
    const profile = [{ s_m: 0 }, { s_m: 28.284 }];
    const ve = 10;
    const drawn = routeScenePositions(meta, dem, cells, vertices, ve, profile);
    assert.ok(drawn);
    assert.equal(drawn.positions.length / 3, 3);
    assert.equal(drawn.s_m.length, 3);
    const ridge = projToScene(meta, { E: (vertices[0]!.E + vertices[1]!.E) / 2, N: (vertices[0]!.N + vertices[1]!.N) / 2 }, 100, ve);
    const endA = projToScene(meta, vertices[0]!, 0, ve);
    const endB = projToScene(meta, vertices[1]!, 0, ve);
    assert.ok(drawn.positions[1]! >= endA.y + ROUTE_LIFT_M - 1e-9);
    assert.ok(drawn.positions[4]! >= ridge.y + ROUTE_LIFT_M - 1e-9);
    assert.ok(drawn.positions[7]! >= endB.y + ROUTE_LIFT_M - 1e-9);
  });

  it("lifts both real ROI-A routes without moving them horizontally", async () => {
    const root = fileURLToPath(new URL("../public/data/", import.meta.url));
    const index = JSON.parse(readFileSync(join(root, "index.json"), "utf8")).roi_a;
    const base = join(root, "roi_a", index.dataset_version);
    const manifestBytes = new Uint8Array(readFileSync(join(base, "manifest.json")));
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as { file: string }[];
    const files = new Map<string, Uint8Array>();
    for (const entry of manifest) files.set(entry.file, new Uint8Array(readFileSync(join(base, entry.file))));
    const terrainBytes = new Uint8Array(readFileSync(join(base, "terrain.json")));
    const verified = await verifyRoiBundle({
      datasetVersion: index.dataset_version,
      terrainJsonSha256: index.terrain_json_sha256,
      manifestBytes,
      terrainBytes,
      files,
    });
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const pois = parsePois(files.get("pois.json")!);
    const grid = assembleGrid(verified.value, files.get("dem.f32.bin")!, files.get("slope_deg.f32.bin")!, files.get("validity.u8.bin")!);
    assert.equal(pois.ok && grid.ok, true);
    if (!pois.ok || !grid.ok) return;
    const ends = demoEndpoints(verified.value, pois.value);
    assert.equal(ends.ok, true);
    if (!ends.ok) return;
    const planned = planPair(grid.value, ends.value.start, ends.value.goal);
    for (const route of [planned.routes.distance, planned.routes.terrain]) {
      assert.equal(route.status, "OK");
      const drawn = routeScenePositions(verified.value, grid.value.dem, route.cells, route.vertices_proj, 1, route.profile);
      assert.ok(drawn);
      const first = route.cells[0];
      const last = route.cells[route.cells.length - 1];
      assert.ok(first && last);
      const start = projToScene(verified.value, route.vertices_proj[0]!, grid.value.dem[first.row * verified.value.nx + first.col]!, 1);
      const goal = projToScene(verified.value, route.vertices_proj.at(-1)!, grid.value.dem[last.row * verified.value.nx + last.col]!, 1);
      assert.equal(drawn.positions[0], start.x);
      assert.equal(drawn.positions[1], start.y + ROUTE_LIFT_M);
      assert.equal(drawn.positions[2], start.z);
      const end = drawn.positions.length - 3;
      assert.equal(drawn.positions[end], goal.x);
      assert.equal(drawn.positions[end + 2], goal.z);
      const tall = routeScenePositions(verified.value, grid.value.dem, route.cells, route.vertices_proj, 10, route.profile);
      assert.ok(tall);
      const startTall = projToScene(verified.value, route.vertices_proj[0]!, grid.value.dem[first.row * verified.value.nx + first.col]!, 10);
      assert.equal(tall.positions[1], startTall.y + ROUTE_LIFT_M);
      assert.equal(tall.positions[0], startTall.x);
    }
  });
});
