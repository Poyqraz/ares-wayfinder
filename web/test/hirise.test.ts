import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { TerrainMeta } from "@ares/contracts";
import { projToScene } from "@ares/core";
import { assembleGrid, parsePois, verifyRoiBundle } from "../src/integrity.ts";
import { demoEndpoints, planPair } from "../src/plan.ts";
import {
  drapeRouteOnHirise,
  hiriseLevelForMaxTexture,
  loadHiriseDisplay,
  sampleHiriseHeight,
  type CtxAlign,
} from "../src/hirise.ts";
import { buildTerrainMesh } from "../src/terrainMesh.ts";

const dataRoot = fileURLToPath(new URL("../public/data/", import.meta.url));

function diskBytes(url: string): Uint8Array | null {
  if (!url.startsWith("/data/")) return null;
  try {
    return new Uint8Array(readFileSync(join(dataRoot, url.slice("/data/".length))));
  } catch {
    return null;
  }
}

function ctxAlign(): CtxAlign {
  const index = JSON.parse(readFileSync(join(dataRoot, "index.json"), "utf8")) as { roi_a: { path: string } };
  const terrainPath = join(dataRoot, index.roi_a.path.replace(/^data\//, ""), "terrain.json");
  return JSON.parse(readFileSync(terrainPath, "utf8")) as TerrainMeta;
}

describe("HiRISE display loader", () => {
  it("accepts the committed bundle and the 2 m reference cells", async () => {
    const loaded = await loadHiriseDisplay(diskBytes, ctxAlign(), "high");
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    const hiriseIndex = JSON.parse(readFileSync(join(dataRoot, "hirise/index.json"), "utf8")) as { roi_a: { dataset_version: string } };
    assert.equal(loaded.value.version, hiriseIndex.roi_a.dataset_version);
    assert.equal(loaded.value.heights.length, 740 * 900);
    assert.equal(loaded.value.textureNx, 2960);
    assert.equal(loaded.value.textureNy, 3600);
    const at = (row: number, col: number) => loaded.value.heights[row * 740 + col]!;
    assert.ok(Math.abs(at(220, 426) - -2569.881) < 0.001);
    assert.ok(Math.abs(at(631, 243) - -2574.548) < 0.001);
    assert.ok(Math.abs(at(722, 448) - -2584.897) < 0.001);
    assert.ok(Math.abs(at(242, 470) - -2568.601) < 0.001);
    const low = await loadHiriseDisplay(diskBytes, ctxAlign(), "low");
    assert.equal(low.ok, true);
    if (!low.ok) return;
    assert.equal(low.value.heights.byteLength, 666000);
    assert.equal(low.value.textureNx, 1480);
    assert.equal(low.value.textureNy, 1800);
  });

  it("rejects a flipped byte, a bad manifest, a foreign CTX version, and a bad role", async () => {
    const flip = (name: string) => async (url: string) => {
      const bytes = diskBytes(url);
      if (!bytes || !url.endsWith(name)) return bytes;
      const copy = bytes.slice();
      copy[100] ^= 0xff;
      return copy;
    };
    for (const [level, name] of [
      ["low", "dtm_4m.f32.bin"],
      ["low", "ortho_1m.jpg"],
      ["low", "manifest.json"],
      ["high", "dtm_2m.f32.bin"],
      ["high", "ortho_0p5m.jpg"],
    ] as const) {
      const rejected = await loadHiriseDisplay(flip(name), ctxAlign(), level);
      assert.equal(rejected.ok, false, name);
    }
    const ctx = ctxAlign();
    const wrong = await loadHiriseDisplay(diskBytes, { ...ctx, dataset_version: "000000000000" }, "low");
    assert.equal(wrong.ok, false);
    const badRole = async (url: string) => {
      if (!url.endsWith("index.json")) return diskBytes(url);
      const json = JSON.parse(new TextDecoder().decode(diskBytes(url)!)) as { roi_a: { role: string } };
      json.roi_a.role = "routing";
      return new TextEncoder().encode(JSON.stringify(json));
    };
    const role = await loadHiriseDisplay(badRole, ctx, "low");
    assert.equal(role.ok, false);
  });

  it("picks 4 m when the GPU cannot hold a 4096 texture", () => {
    assert.equal(hiriseLevelForMaxTexture("high", 2048), "low");
    assert.equal(hiriseLevelForMaxTexture("high", 4096), "high");
    assert.equal(hiriseLevelForMaxTexture("low", 2048), "low");
    assert.equal(hiriseLevelForMaxTexture("low", 1024), null);
  });

  it("drapes CTX plan vertices onto HiRISE heights without moving them horizontally", async () => {
    const index = JSON.parse(readFileSync(join(dataRoot, "index.json"), "utf8")) as {
      roi_a: { dataset_version: string; terrain_json_sha256: string };
    };
    const base = join(dataRoot, "roi_a", index.roi_a.dataset_version);
    const manifestBytes = new Uint8Array(readFileSync(join(base, "manifest.json")));
    const files = new Map<string, Uint8Array>([["manifest.json", manifestBytes]]);
    for (const entry of JSON.parse(new TextDecoder().decode(manifestBytes)) as { file: string }[]) {
      files.set(entry.file, new Uint8Array(readFileSync(join(base, entry.file))));
    }
    files.set("terrain.json", new Uint8Array(readFileSync(join(base, "terrain.json"))));
    const verified = await verifyRoiBundle({
      datasetVersion: index.roi_a.dataset_version,
      terrainJsonSha256: index.roi_a.terrain_json_sha256,
      manifestBytes,
      terrainBytes: files.get("terrain.json")!,
      files,
    });
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const pois = parsePois(files.get("pois.json")!);
    assert.equal(pois.ok, true);
    if (!pois.ok) return;
    const grid = assembleGrid(verified.value, files.get("dem.f32.bin")!, files.get("slope_deg.f32.bin")!, files.get("validity.u8.bin")!);
    assert.equal(grid.ok, true);
    if (!grid.ok) return;
    const ends = demoEndpoints(verified.value, pois.value);
    assert.equal(ends.ok, true);
    if (!ends.ok) return;
    const planned = planPair(grid.value, ends.value.start, ends.value.goal);
    assert.equal(planned.routes.distance.length_horizontal_m.toFixed(3), "969.161");
    const hirise = await loadHiriseDisplay(diskBytes, verified.value, "low");
    assert.equal(hirise.ok, true);
    if (!hirise.ok) return;
    const route = planned.routes.distance;
    for (const ve of [1, 2.5, 10]) {
      const drawn = drapeRouteOnHirise(verified.value.h_min, hirise.value.grid, hirise.value.heights, route.vertices_proj, route.profile, ve);
      assert.ok(drawn);
      if (!drawn) return;
      const frame = { ...hirise.value.grid, h_min: verified.value.h_min };
      for (let i = 0; i < route.vertices_proj.length; i++) {
        const vertex = route.vertices_proj[i]!;
        const h = sampleHiriseHeight(hirise.value.grid, hirise.value.heights, vertex.E, vertex.N);
        assert.ok(h !== null);
        const scene = projToScene(frame, vertex, h ?? 0, ve);
        const ctxScene = projToScene(verified.value, vertex, grid.value.dem[ends.value.start.row * verified.value.nx + ends.value.start.col] ?? 0, ve);
        let nearest = Infinity;
        for (let p = 0; p < drawn.positions.length; p += 3) {
          const dx = drawn.positions[p]! - scene.x;
          const dz = drawn.positions[p + 2]! - scene.z;
          nearest = Math.min(nearest, Math.hypot(dx, dz));
          if (Math.hypot(dx, dz) < 1e-4) {
            assert.ok(drawn.positions[p + 1]! >= scene.y + 0.5 - 1e-6);
            assert.ok(Math.abs(drawn.positions[p + 1]! - (scene.y + 0.5)) < 1e-4);
            assert.notEqual(drawn.positions[p + 1], ctxScene.y + 0.5);
          }
        }
        assert.ok(nearest < 1e-4, `vertex ${i} left the CTX ground track`);
      }
    }
    const poisoned = hirise.value.heights.slice();
    const mid = route.vertices_proj[Math.floor(route.vertices_proj.length / 2)]!;
    const col = Math.floor((mid.E - hirise.value.grid.x0) / hirise.value.grid.dx_proj - 0.5);
    const row = Math.floor((hirise.value.grid.y0 - mid.N) / hirise.value.grid.dy_proj - 0.5);
    for (const r of [row, row + 1]) {
      for (const c of [col, col + 1]) poisoned[r * hirise.value.grid.nx + c] = Number.NaN;
    }
    assert.equal(drapeRouteOnHirise(verified.value.h_min, hirise.value.grid, poisoned, route.vertices_proj, route.profile, 1), null);
  });

  it("puts north at a higher texture v than south", () => {
    const mesh = buildTerrainMesh(
      { nx: 4, ny: 4, x0: 0, y0: 40, dx_proj: 10, dy_proj: 10, h_min: -10 },
      new Float32Array(16).fill(0),
      1,
    );
    const north = mesh.uvs[1]!;
    const south = mesh.uvs[(mesh.uvs.length / 2) + 1]!;
    assert.ok(north > south);
  });
});
