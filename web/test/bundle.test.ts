import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { geoToProj, projToCell } from "@ares/core";
import { assembleGrid, parsePois, verifyOverview, verifyRoiBundle } from "../src/integrity.ts";
import { formatMetres, lengthsEqual } from "../src/explain.ts";
import { demoEndpoints, planPair } from "../src/plan.ts";

const dataRoot = fileURLToPath(new URL("../public/data/", import.meta.url));

function readBundle() {
  const index = JSON.parse(readFileSync(join(dataRoot, "index.json"), "utf8")) as {
    roi_a: { dataset_version: string; terrain_json_sha256: string };
  };
  const base = join(dataRoot, "roi_a", index.roi_a.dataset_version);
  const manifestBytes = new Uint8Array(readFileSync(join(base, "manifest.json")));
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as { file: string }[];
  const files = new Map<string, Uint8Array>();
  for (const entry of manifest) files.set(entry.file, new Uint8Array(readFileSync(join(base, entry.file))));
  files.set("manifest.json", manifestBytes);
  const terrainBytes = new Uint8Array(readFileSync(join(base, "terrain.json")));
  return { index: index.roi_a, base, manifestBytes, terrainBytes, files };
}

describe("ROI-A integrity", () => {
  it("accepts the published bundle", async () => {
    const bundle = readBundle();
    const verified = await verifyRoiBundle({
      datasetVersion: bundle.index.dataset_version,
      terrainJsonSha256: bundle.index.terrain_json_sha256,
      manifestBytes: bundle.manifestBytes,
      terrainBytes: bundle.terrainBytes,
      files: bundle.files,
    });
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    assert.equal(verified.value.nx, 74);
    assert.equal(verified.value.dataset_version, bundle.index.dataset_version);
  });

  it("reports DATASET INTEGRITY when one byte of a copied DEM is flipped", async () => {
    const bundle = readBundle();
    const dir = mkdtempSync(join(tmpdir(), "ares-bundle-"));
    try {
      const source = bundle.files.get("dem.f32.bin");
      assert.ok(source);
      const copyPath = join(dir, "dem.f32.bin");
      writeFileSync(copyPath, source);
      const corrupted = readFileSync(copyPath);
      corrupted[0] ^= 0xff;
      writeFileSync(copyPath, corrupted);
      bundle.files.set("dem.f32.bin", new Uint8Array(readFileSync(copyPath)));
      const verified = await verifyRoiBundle({
        datasetVersion: bundle.index.dataset_version,
        terrainJsonSha256: bundle.index.terrain_json_sha256,
        manifestBytes: bundle.manifestBytes,
        terrainBytes: bundle.terrainBytes,
        files: bundle.files,
      });
      assert.equal(verified.ok, false);
      if (verified.ok) return;
      assert.equal(verified.failure.kind, "DATASET INTEGRITY");
      assert.match(verified.failure.detail, /dem\.f32\.bin/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports DATASET_VERSION_MISMATCH when the manifest prefix does not match", async () => {
    const bundle = readBundle();
    const verified = await verifyRoiBundle({
      datasetVersion: "000000000000",
      terrainJsonSha256: bundle.index.terrain_json_sha256,
      manifestBytes: bundle.manifestBytes,
      terrainBytes: bundle.terrainBytes,
      files: bundle.files,
    });
    assert.equal(verified.ok, false);
    if (verified.ok) return;
    assert.equal(verified.failure.kind, "DATASET_VERSION_MISMATCH");
  });
});

describe("CTX overview", () => {
  it("matches the sidecar hash", async () => {
    const sidecar = new Uint8Array(readFileSync(join(dataRoot, "context", "ctx_overview.json")));
    const jpg = new Uint8Array(readFileSync(join(dataRoot, "context", "ctx_overview.jpg")));
    const verified = await verifyOverview(sidecar, jpg);
    assert.equal(verified.ok, true);
  });

  it("reports DATASET INTEGRITY for a copied overview with one flipped byte", async () => {
    const sidecar = new Uint8Array(readFileSync(join(dataRoot, "context", "ctx_overview.json")));
    const dir = mkdtempSync(join(tmpdir(), "ares-overview-"));
    try {
      const copyPath = join(dir, "ctx_overview.jpg");
      writeFileSync(copyPath, readFileSync(join(dataRoot, "context", "ctx_overview.jpg")));
      const corrupted = readFileSync(copyPath);
      corrupted[32] ^= 0xff;
      writeFileSync(copyPath, corrupted);
      const verified = await verifyOverview(sidecar, new Uint8Array(readFileSync(copyPath)));
      assert.equal(verified.ok, false);
      if (verified.ok) return;
      assert.equal(verified.failure.kind, "DATASET INTEGRITY");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("demo route through the UI planner", () => {
  it("matches the Rochette/Montdenier to Landing reference numbers", async () => {
    const bundle = readBundle();
    const verified = await verifyRoiBundle({
      datasetVersion: bundle.index.dataset_version,
      terrainJsonSha256: bundle.index.terrain_json_sha256,
      manifestBytes: bundle.manifestBytes,
      terrainBytes: bundle.terrainBytes,
      files: bundle.files,
    });
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const pois = parsePois(bundle.files.get("pois.json")!);
    assert.equal(pois.ok, true);
    if (!pois.ok) return;
    const grid = assembleGrid(verified.value, bundle.files.get("dem.f32.bin")!, bundle.files.get("slope_deg.f32.bin")!, bundle.files.get("validity.u8.bin")!);
    assert.equal(grid.ok, true);
    if (!grid.ok) return;
    const ends = demoEndpoints(verified.value, pois.value);
    assert.equal(ends.ok, true);
    if (!ends.ok) return;
    const rochette = pois.value.find((poi) => poi.id === "rochette");
    assert.ok(rochette);
    assert.deepEqual(ends.value.start, projToCell(verified.value, geoToProj(verified.value, rochette.geo)));
    const planned = planPair(grid.value, ends.value.start, ends.value.goal);
    assert.equal(planned.fault, null);
    assert.equal(planned.routes.distance.status, "OK");
    assert.equal(planned.routes.terrain.status, "OK");
    assert.equal(formatMetres(planned.routes.distance.length_horizontal_m, 3), "969.161");
    assert.equal(formatMetres(planned.routes.terrain.length_horizontal_m, 3), "969.161");
    assert.equal(lengthsEqual(planned.routes.distance.length_horizontal_m, planned.routes.terrain.length_horizontal_m), true);
    assert.ok(planned.comparison);
    assert.equal(formatMetres(planned.comparison.baseline_cost ?? NaN, 3), "1093.229");
    assert.equal(formatMetres(planned.comparison.terrain_cost, 3), "1058.299");
    assert.equal(planned.comparison.relation, "LOWER");
  });
});
