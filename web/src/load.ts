import type { Poi, SourceRecord, TerrainMeta } from "@ares/contracts";
import type { TerrainGrid } from "@ares/core";
import {
  assembleGrid,
  fail,
  parsePois,
  parseSources,
  verifyOverview,
  verifyRoiBundle,
  type Checked,
  type OverviewSidecar,
} from "./integrity.ts";

export interface LoadedRoi {
  meta: TerrainMeta;
  grid: TerrainGrid;
  pois: Poi[];
  sources: SourceRecord[];
  orthoUrl: string;
  hillshadeUrl: string;
  overviewUrl: string;
  overview: OverviewSidecar;
}

interface IndexEntry {
  dataset_version?: unknown;
  path?: unknown;
  terrain_json_sha256?: unknown;
}

function blobUrl(bytes: Uint8Array, type: string): string {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return URL.createObjectURL(new Blob([buffer], { type }));
}

export async function fetchBytes(url: string): Promise<Checked<Uint8Array>> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "network error";
    return fail("DATASET INTEGRITY", `could not read ${url} (${detail})`);
  }
  if (!response.ok) return fail("DATASET INTEGRITY", `could not read ${url} (HTTP ${response.status})`);
  return { ok: true, value: new Uint8Array(await response.arrayBuffer()) };
}

export async function loadRoiA(): Promise<Checked<LoadedRoi>> {
  const indexBytes = await fetchBytes("/data/index.json");
  if (!indexBytes.ok) return indexBytes;
  let index: { roi_a?: IndexEntry };
  try {
    index = JSON.parse(new TextDecoder().decode(indexBytes.value)) as { roi_a?: IndexEntry };
  } catch {
    return fail("DATASET INTEGRITY", "index.json is not valid JSON");
  }
  const entry = index.roi_a;
  const version = entry?.dataset_version;
  const path = entry?.path;
  const terrainHash = entry?.terrain_json_sha256;
  if (typeof version !== "string" || !/^[a-f0-9]{12}$/.test(version)) {
    return fail("DATASET_VERSION_MISMATCH", "index.json roi_a.dataset_version is not a 12-character hex id");
  }
  if (path !== `data/roi_a/${version}/`) {
    return fail("DATASET INTEGRITY", "index.json path does not match roi_a dataset_version");
  }
  if (typeof terrainHash !== "string") return fail("DATASET INTEGRITY", "index.json terrain_json_sha256 is missing");

  const base = `/${path}`;
  const names = [
    "manifest.json",
    "terrain.json",
    "dem.f32.bin",
    "slope_deg.f32.bin",
    "validity.u8.bin",
    "ortho.jpg",
    "hillshade.png",
    "pois.json",
    "sources.json",
  ] as const;
  const loaded = new Map<string, Uint8Array>();
  for (const name of names) {
    const bytes = await fetchBytes(`${base}${name}`);
    if (!bytes.ok) return bytes;
    loaded.set(name, bytes.value);
  }
  const verified = await verifyRoiBundle({
    datasetVersion: version,
    terrainJsonSha256: terrainHash,
    manifestBytes: loaded.get("manifest.json")!,
    terrainBytes: loaded.get("terrain.json")!,
    files: loaded,
  });
  if (!verified.ok) return verified;

  const pois = parsePois(loaded.get("pois.json")!);
  if (!pois.ok) return pois;
  const sources = parseSources(loaded.get("sources.json")!);
  if (!sources.ok) return sources;
  const grid = assembleGrid(
    verified.value,
    loaded.get("dem.f32.bin")!,
    loaded.get("slope_deg.f32.bin")!,
    loaded.get("validity.u8.bin")!,
  );
  if (!grid.ok) return grid;

  const sidecar = await fetchBytes("/data/context/ctx_overview.json");
  if (!sidecar.ok) return sidecar;
  const overviewJpg = await fetchBytes("/data/context/ctx_overview.jpg");
  if (!overviewJpg.ok) return overviewJpg;
  const overview = await verifyOverview(sidecar.value, overviewJpg.value);
  if (!overview.ok) return overview;

  return {
    ok: true,
    value: {
      meta: verified.value,
      grid: grid.value,
      pois: pois.value,
      sources: sources.value,
      orthoUrl: blobUrl(loaded.get("ortho.jpg")!, "image/jpeg"),
      hillshadeUrl: blobUrl(loaded.get("hillshade.png")!, "image/png"),
      overviewUrl: blobUrl(overviewJpg.value, "image/jpeg"),
      overview: overview.value,
    },
  };
}
