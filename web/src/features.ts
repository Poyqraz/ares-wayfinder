// Terrain-feature evidence layer F01-F03 (analysis/features, schema ares-terrain-feature/1). Read-only, hash-checked.
// Features are never routing inputs or hazards; geometry may be null until traced and reviewed.
import { fail, sha256Hex, type Checked } from "./integrity.ts";

export interface TerrainFeature {
  feature_id: "F01" | "F02" | "F03";
  name: string;
  related_missions: string[];
  anchor: { lat: number; lon: number; sol: number; rmc: string; source: string; is_feature_centre: false };
  observation: string;
  geometry_status: string;
  measurements: Record<string, number | null>;
  three_raster_validation: string;
  evidence_level: string;
  qa_status: string;
  validated_for_human_eva: false;
  used_in_routing: false;
}

export interface LoadedFeatures {
  version: string;
  features: TerrainFeature[];
  f01: { panelUrl: string; profileUrl: string; qa: { uncertainty: Record<string, unknown>; registration: Record<string, { east_m: number; north_m: number; ncc: number }>; status: Record<string, unknown> } } | null;
}

type Fetcher = (url: string) => Promise<Checked<Uint8Array>>;
const FILE = /^(?:F0[1-3]\/)?[A-Za-z0-9_.-]+$/;

function blobUrl(bytes: Uint8Array, type: string): string {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return URL.createObjectURL(new Blob([buffer], { type }));
}

export async function loadFeatures(get: Fetcher): Promise<Checked<LoadedFeatures>> {
  const idx = await get("/data/features/index.json");
  if (!idx.ok) return idx;
  let entry: { version?: unknown; path?: unknown } | undefined;
  try {
    entry = (JSON.parse(new TextDecoder().decode(idx.value)) as { terrain_features?: { version?: unknown; path?: unknown } }).terrain_features;
  } catch {
    return fail("DATASET INTEGRITY", "features index.json is not valid JSON");
  }
  if (typeof entry?.version !== "string" || entry.path !== `data/features/${entry.version}/`) return fail("DATASET INTEGRITY", "features index entry is incomplete");
  const base = `/${entry.path}`;
  const mBytes = await get(`${base}manifest.json`);
  if (!mBytes.ok) return mBytes;
  if ((await sha256Hex(mBytes.value)).slice(0, 12) !== entry.version) return fail("DATASET_VERSION_MISMATCH", "features manifest does not match its version");
  const manifest = JSON.parse(new TextDecoder().decode(mBytes.value)) as { file: string; sha256: string }[];
  const files = new Map<string, Uint8Array>();
  for (const m of manifest) {
    if (!FILE.test(m.file)) return fail("DATASET INTEGRITY", `features manifest entry ${m.file} is not allowed`);
    const b = await get(`${base}${m.file}`);
    if (!b.ok) return b;
    if ((await sha256Hex(b.value)) !== m.sha256) return fail("DATASET INTEGRITY", `${m.file} does not match the features manifest`);
    files.set(m.file, b.value);
  }
  const decode = <T,>(name: string) => JSON.parse(new TextDecoder().decode(files.get(name)!)) as T;
  const layer = decode<{ schema: string; features: TerrainFeature[] }>("terrain_features.json");
  if (layer.schema !== "ares-terrain-feature/1") return fail("DATASET INTEGRITY", "terrain_features.json schema is not ares-terrain-feature/1");
  if (layer.features.some((f) => f.validated_for_human_eva !== false || f.used_in_routing !== false || f.anchor.is_feature_centre !== false)) {
    return fail("DATASET INTEGRITY", "a terrain feature claims EVA validation, routing use or a feature-centre anchor");
  }
  const hasF01 = files.has("F01/F01_panel.png") && files.has("F01/F01_qa.json") && files.has("F01/F01_profile.png");
  return {
    ok: true,
    value: {
      version: entry.version,
      features: layer.features,
      f01: hasF01 ? { panelUrl: blobUrl(files.get("F01/F01_panel.png")!, "image/png"), profileUrl: blobUrl(files.get("F01/F01_profile.png")!, "image/png"), qa: decode("F01/F01_qa.json") } : null,
    },
  };
}
