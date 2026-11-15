import { CONTRACT_VERSION } from "@ares/contracts";
import type { Poi, SourceRecord, TerrainMeta } from "@ares/contracts";
import type { TerrainGrid } from "@ares/core";

export interface DatasetFailure {
  kind: "DATASET INTEGRITY" | "DATASET_VERSION_MISMATCH";
  detail: string;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; failure: DatasetFailure };

export function fail(kind: DatasetFailure["kind"], detail: string): Checked<never> {
  return { ok: false, failure: { kind, detail } };
}

const REQUIRED_FILES = [
  "dem.f32.bin",
  "slope_deg.f32.bin",
  "validity.u8.bin",
  "ortho.jpg",
  "hillshade.png",
  "pois.json",
  "sources.json",
] as const;

const FILE_NAME = /^[a-z0-9_.-]+$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;

interface ManifestEntry {
  file: string;
  sha256: string;
}

/** SHA-256 of the exact bytes. Same function the browser loader and the node tests use. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  let hex = "";
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function decodeJson(bytes: Uint8Array, label: string): Checked<unknown> {
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return fail("DATASET INTEGRITY", `${label} is not valid JSON`);
  }
}

function readManifest(bytes: Uint8Array, required: readonly string[] = REQUIRED_FILES): Checked<ManifestEntry[]> {
  const parsed = decodeJson(bytes, "manifest.json");
  if (!parsed.ok) return parsed;
  if (!Array.isArray(parsed.value)) return fail("DATASET INTEGRITY", "manifest.json is not an array");
  const entries: ManifestEntry[] = [];
  for (const row of parsed.value) {
    if (!row || typeof row !== "object") return fail("DATASET INTEGRITY", "manifest.json has a row that is not an object");
    const file = (row as { file?: unknown }).file;
    const sha256 = (row as { sha256?: unknown }).sha256;
    if (typeof file !== "string" || !FILE_NAME.test(file)) {
      return fail("DATASET INTEGRITY", "manifest.json has a file name that is not a single bundle filename");
    }
    if (typeof sha256 !== "string" || !SHA256_HEX.test(sha256)) {
      return fail("DATASET INTEGRITY", `manifest.json sha256 for ${file} is not 64 hex characters`);
    }
    entries.push({ file, sha256 });
  }
  for (const name of required) {
    if (!entries.some((entry) => entry.file === name)) {
      return fail("DATASET INTEGRITY", `manifest.json is missing ${name}`);
    }
  }
  return { ok: true, value: entries };
}

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function readMeta(bytes: Uint8Array, datasetVersion: string): Checked<TerrainMeta> {
  const parsed = decodeJson(bytes, "terrain.json");
  if (!parsed.ok) return parsed;
  if (!parsed.value || typeof parsed.value !== "object") return fail("DATASET INTEGRITY", "terrain.json is not an object");
  const meta = parsed.value as TerrainMeta;
  if (meta.contract_version !== CONTRACT_VERSION) {
    return fail(
      "DATASET_VERSION_MISMATCH",
      `terrain.json contract_version ${String(meta.contract_version)} != ${CONTRACT_VERSION}`,
    );
  }
  if (meta.dataset_version !== datasetVersion) {
    return fail("DATASET_VERSION_MISMATCH", "terrain.json dataset_version does not match the index");
  }
  if (!Number.isInteger(meta.nx) || !Number.isInteger(meta.ny) || meta.nx <= 0 || meta.ny <= 0) {
    return fail("DATASET INTEGRITY", "terrain.json nx/ny are not positive integers");
  }
  if (![meta.dx_proj, meta.dy_proj, meta.dx_ground_m, meta.dy_ground_m, meta.x0, meta.y0, meta.radius_m, meta.lat_ts_deg, meta.central_meridian_deg, meta.h_min, meta.h_max].every(finite)) {
    return fail("DATASET INTEGRITY", "terrain.json grid or projection fields are not finite numbers");
  }
  if (!(meta.dx_proj > 0) || !(meta.dy_proj > 0) || !(meta.dx_ground_m > 0) || !(meta.dy_ground_m > 0) || !(meta.radius_m > 0)) {
    return fail("DATASET INTEGRITY", "terrain.json spacing or radius is not positive");
  }
  return { ok: true, value: meta };
}

/**
 * Hash check for one ROI bundle.
 * terrain.json is not inside manifest.json: its digest is the index field, because the
 * manifest digest is what dataset_version is derived from.
 */
export async function verifyRoiBundle(input: {
  datasetVersion: string;
  terrainJsonSha256: string;
  manifestBytes: Uint8Array;
  terrainBytes: Uint8Array;
  files: ReadonlyMap<string, Uint8Array>;
  /** Files the manifest must list; ROI-A's set by default. */
  requiredFiles?: readonly string[];
}): Promise<Checked<TerrainMeta>> {
  if (!/^[a-f0-9]{12}$/.test(input.datasetVersion)) {
    return fail("DATASET_VERSION_MISMATCH", "dataset_version is not a 12-character hex id");
  }
  if (!SHA256_HEX.test(input.terrainJsonSha256)) {
    return fail("DATASET INTEGRITY", "index terrain_json_sha256 is not 64 hex characters");
  }
  const manifest = readManifest(input.manifestBytes, input.requiredFiles);
  if (!manifest.ok) return manifest;
  for (const entry of manifest.value) {
    const bytes = input.files.get(entry.file);
    if (!bytes) return fail("DATASET INTEGRITY", `${entry.file} is listed in the manifest but was not loaded`);
    const actual = await sha256Hex(bytes);
    if (actual !== entry.sha256) return fail("DATASET INTEGRITY", `${entry.file} does not match the manifest sha256`);
  }
  const manifestHash = await sha256Hex(input.manifestBytes);
  if (manifestHash.slice(0, 12) !== input.datasetVersion) {
    return fail("DATASET_VERSION_MISMATCH", `manifest sha256 prefix ${manifestHash.slice(0, 12)} != ${input.datasetVersion}`);
  }
  const terrainHash = await sha256Hex(input.terrainBytes);
  if (terrainHash !== input.terrainJsonSha256) {
    return fail("DATASET INTEGRITY", "terrain.json sha256 does not match index.json");
  }
  const meta = readMeta(input.terrainBytes, input.datasetVersion);
  if (!meta.ok) return meta;
  const n = meta.value.nx * meta.value.ny;
  const dem = input.files.get("dem.f32.bin");
  const slope = input.files.get("slope_deg.f32.bin");
  const validity = input.files.get("validity.u8.bin");
  if (!dem || dem.byteLength !== n * 4) return fail("DATASET INTEGRITY", "dem.f32.bin length does not match nx*ny");
  if (!slope || slope.byteLength !== n * 4) return fail("DATASET INTEGRITY", "slope_deg.f32.bin length does not match nx*ny");
  if (!validity || validity.byteLength !== n) return fail("DATASET INTEGRITY", "validity.u8.bin length does not match nx*ny");
  return meta;
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

/** Lengths are checked in verifyRoiBundle; call this only on a verified bundle. */
export function assembleGrid(meta: TerrainMeta, dem: Uint8Array, slope: Uint8Array, validity: Uint8Array): Checked<TerrainGrid> {
  return {
    ok: true,
    value: {
      meta,
      dem: new Float32Array(copyBuffer(dem)),
      slope: new Float32Array(copyBuffer(slope)),
      validity: new Uint8Array(copyBuffer(validity)),
    },
  };
}

function isConfidence(v: unknown): v is Poi["confidence"] {
  return v === "high" || v === "medium" || v === "low";
}

export function parsePois(bytes: Uint8Array): Checked<Poi[]> {
  const parsed = decodeJson(bytes, "pois.json");
  if (!parsed.ok) return parsed;
  if (!Array.isArray(parsed.value)) return fail("DATASET INTEGRITY", "pois.json is not an array");
  for (const row of parsed.value) {
    if (!row || typeof row !== "object") return fail("DATASET INTEGRITY", "pois.json has an entry that is not an object");
    const poi = row as Poi;
    if (typeof poi.id !== "string" || typeof poi.name !== "string" || typeof poi.claim !== "string" || typeof poi.source !== "string") {
      return fail("DATASET INTEGRITY", "pois.json entry is missing id, name, claim, or source");
    }
    if (!isConfidence(poi.confidence)) return fail("DATASET INTEGRITY", `pois.json confidence for ${poi.id} is not high, medium, or low`);
    if (!finite(poi.geo?.lat) || !finite(poi.geo?.lon)) return fail("DATASET INTEGRITY", `pois.json geo for ${poi.id} is not numeric`);
  }
  return { ok: true, value: parsed.value as Poi[] };
}

export function parseSources(bytes: Uint8Array): Checked<SourceRecord[]> {
  const parsed = decodeJson(bytes, "sources.json");
  if (!parsed.ok) return parsed;
  if (!Array.isArray(parsed.value)) return fail("DATASET INTEGRITY", "sources.json is not an array");
  for (const row of parsed.value) {
    if (!row || typeof row !== "object") return fail("DATASET INTEGRITY", "sources.json has an entry that is not an object");
    const source = row as SourceRecord;
    if (typeof source.id !== "string" || typeof source.mission !== "string" || typeof source.instrument !== "string") {
      return fail("DATASET INTEGRITY", "sources.json entry is missing id, mission, or instrument");
    }
    if (typeof source.product_version !== "string" || typeof source.citation !== "string" || typeof source.url !== "string") {
      return fail("DATASET INTEGRITY", `sources.json entry ${source.id} is missing product_version, citation, or url`);
    }
    if (!Array.isArray(source.limitations) || source.limitations.some((item) => typeof item !== "string")) {
      return fail("DATASET INTEGRITY", `sources.json limitations for ${source.id} are not a string list`);
    }
  }
  return { ok: true, value: parsed.value as SourceRecord[] };
}

export interface OverviewSidecar {
  title: string;
  is_not: string[];
  mission: string;
  instrument: string;
  product_id: string;
  product_version: string;
  citation: string;
  scale_note: string;
  orientation: string;
  extent_proj_m: { x_min: number; x_max: number; y_min: number; y_max: number };
  extent_geo_deg: { lat_min: number; lat_max: number; lon_min: number; lon_max: number };
  preview_size_px: [number, number];
  jpg_sha256: string;
  jpg_bytes: number;
}

/** The overview hash lives in its sidecar, not in the ROI manifest. Both must match the bytes. */
export async function verifyOverview(sidecarBytes: Uint8Array, jpgBytes: Uint8Array): Promise<Checked<OverviewSidecar>> {
  const parsed = decodeJson(sidecarBytes, "ctx_overview.json");
  if (!parsed.ok) return parsed;
  if (!parsed.value || typeof parsed.value !== "object") return fail("DATASET INTEGRITY", "ctx_overview.json is not an object");
  const side = parsed.value as OverviewSidecar;
  if (typeof side.title !== "string" || typeof side.mission !== "string" || typeof side.instrument !== "string") {
    return fail("DATASET INTEGRITY", "ctx_overview.json is missing title, mission, or instrument");
  }
  if (typeof side.product_version !== "string" || typeof side.citation !== "string" || typeof side.product_id !== "string") {
    return fail("DATASET INTEGRITY", "ctx_overview.json is missing product identity or citation");
  }
  if (!Array.isArray(side.is_not) || side.is_not.some((item) => typeof item !== "string")) {
    return fail("DATASET INTEGRITY", "ctx_overview.json is_not is not a string list");
  }
  const ext = side.extent_proj_m;
  if (!ext || ![ext.x_min, ext.x_max, ext.y_min, ext.y_max].every((n) => finite(n)) || !(ext.x_max > ext.x_min) || !(ext.y_max > ext.y_min)) {
    return fail("DATASET INTEGRITY", "ctx_overview.json extent_proj_m is not a usable box");
  }
  const geo = side.extent_geo_deg;
  if (!geo || ![geo.lat_min, geo.lat_max, geo.lon_min, geo.lon_max].every((n) => finite(n))) {
    return fail("DATASET INTEGRITY", "ctx_overview.json extent_geo_deg is incomplete");
  }
  if (!Array.isArray(side.preview_size_px) || side.preview_size_px.length !== 2 || !side.preview_size_px.every((n) => Number.isInteger(n) && n > 0)) {
    return fail("DATASET INTEGRITY", "ctx_overview.json preview_size_px is not two positive integers");
  }
  if (typeof side.jpg_sha256 !== "string" || !SHA256_HEX.test(side.jpg_sha256)) {
    return fail("DATASET INTEGRITY", "ctx_overview.json jpg_sha256 is not 64 hex characters");
  }
  if (side.jpg_bytes !== jpgBytes.byteLength) {
    return fail("DATASET INTEGRITY", `ctx_overview.jpg length ${jpgBytes.byteLength} != sidecar jpg_bytes ${String(side.jpg_bytes)}`);
  }
  const actual = await sha256Hex(jpgBytes);
  if (actual !== side.jpg_sha256) return fail("DATASET INTEGRITY", "ctx_overview.jpg does not match the sidecar sha256");
  return { ok: true, value: side };
}
