// Test helper: load a bundle from web/public/data and verify its integrity (SRC-2).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { TerrainGrid } from "../src/index.ts";

const dataRoot = new URL("../../web/public/data/", import.meta.url);
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

export function loadBundle(roiId: string): TerrainGrid {
  const index = JSON.parse(readFileSync(new URL("index.json", dataRoot), "utf8"))[roiId];
  const base = new URL(`${roiId}/${index.dataset_version}/`, dataRoot);
  const read = (f: string) => readFileSync(new URL(f, base));
  const manifest: { file: string; sha256: string }[] = JSON.parse(read("manifest.json").toString());
  for (const m of manifest) {
    if (sha256(read(m.file)) !== m.sha256) throw new Error(`integrity: ${m.file} does not match manifest`);
  }
  if (sha256(read("manifest.json")).slice(0, 12) !== index.dataset_version) throw new Error("integrity: manifest vs dataset_version");
  if (sha256(read("terrain.json")) !== index.terrain_json_sha256) throw new Error("integrity: terrain.json vs index");
  const meta = JSON.parse(read("terrain.json").toString());
  if (meta.dataset_version !== index.dataset_version) throw new Error("integrity: terrain.json version");
  const f32 = (f: string) => new Float32Array(new Uint8Array(read(f)).buffer);
  return { meta, dem: f32("dem.f32.bin"), slope: f32("slope_deg.f32.bin"), validity: new Uint8Array(read("validity.u8.bin")) };
}
