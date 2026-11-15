import type { ProjPoint } from "@ares/contracts";
import { projToScene } from "@ares/core";
import { fail, sha256Hex, type Checked } from "./integrity.ts";
import { ROUTE_LIFT_M, type RouteDisplayPath } from "./terrainMesh.ts";

/** CR-003 display package. Not a routing DEM. */
export type HiriseLevel = "low" | "high";

export interface CtxAlign {
  dataset_version: string;
  nx: number;
  ny: number;
  x0: number;
  y0: number;
  dx_proj: number;
  dy_proj: number;
  h_min: number;
}

export interface HiriseGrid {
  nx: number;
  ny: number;
  x0: number;
  y0: number;
  dx_proj: number;
  dy_proj: number;
}

export interface HiriseLabels {
  median: number;
  std: number;
  offsetEast: number;
  offsetNorth: number;
  uncertaintyM: number;
  lineCount: number;
  stepMedian: number;
  stepMax: number;
  verticalReference: string;
  dois: string[];
  citations: string[];
  credit: string;
  processing: string[];
  limitations: string[];
}

export interface HirisePackage {
  level: HiriseLevel;
  version: string;
  grid: HiriseGrid;
  heights: Float32Array;
  textureBytes: Uint8Array;
  textureNx: number;
  textureNy: number;
  labels: HiriseLabels;
}

const LEVEL_IDS: Record<HiriseLevel, { dtm: string; tex: string }> = {
  low: { dtm: "dtm_4m", tex: "ortho_1m" },
  high: { dtm: "dtm_2m", tex: "ortho_0p5m" },
};

/** 4 m needs 2048; 2 m needs 4096. A short GPU gets the 4 m pair instead of a failed 2 m load. */
export function hiriseLevelForMaxTexture(requested: HiriseLevel, maxTextureSize: number): HiriseLevel | null {
  if (!(maxTextureSize >= 2048)) return null;
  if (requested === "high" && maxTextureSize < 4096) return "low";
  return requested;
}

export function hiriseUnavailable(reason: string): string {
  return `HiRISE layer unavailable (${reason}). Showing CTX 20 m.`;
}

export const HIRISE_ROUTE_NOTICE = "Route cannot be drawn on HiRISE here; showing CTX.";

interface GridFile {
  nx: number;
  ny: number;
  dx_proj: number;
  dy_proj: number;
  x0: number;
  y0: number;
  file: string;
}

function jpegSize(bytes: Uint8Array): { width: number; height: number; components: number } | null {
  let i = 2;
  while (i + 8 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1] ?? 0;
    const len = ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0);
    if (marker >= 0xc0 && marker <= 0xc2) {
      return {
        height: ((bytes[i + 5] ?? 0) << 8) | (bytes[i + 6] ?? 0),
        width: ((bytes[i + 7] ?? 0) << 8) | (bytes[i + 8] ?? 0),
        components: bytes[i + 9] ?? 0,
      };
    }
    i += 2 + len;
  }
  return null;
}

function finiteGrid(value: unknown): value is GridFile {
  if (!value || typeof value !== "object") return false;
  const grid = value as GridFile;
  return Number.isInteger(grid.nx) && grid.nx > 0
    && Number.isInteger(grid.ny) && grid.ny > 0
    && grid.dx_proj > 0 && grid.dy_proj > 0
    && Number.isFinite(grid.x0) && Number.isFinite(grid.y0)
    && typeof grid.file === "string";
}

function readFloat32LE(bytes: Uint8Array, count: number): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}

/**
 * CR-003 §7. Hash the exact bytes. A failure here must not touch the CTX bundle.
 * getBytes returns null when the file is missing.
 */
export async function loadHiriseDisplay(
  getBytes: (url: string) => Promise<Uint8Array | null>,
  ctx: CtxAlign,
  level: HiriseLevel,
): Promise<Checked<HirisePackage>> {
  const indexBytes = await getBytes("/data/hirise/index.json");
  if (!indexBytes) return fail("DATASET INTEGRITY", "index.json missing");
  let indexJson: { roi_a?: Record<string, unknown> };
  try {
    indexJson = JSON.parse(new TextDecoder().decode(indexBytes)) as { roi_a?: Record<string, unknown> };
  } catch {
    return fail("DATASET INTEGRITY", "index.json is not JSON");
  }
  const index = indexJson.roi_a;
  if (!index || index.role !== "display_only") return fail("DATASET INTEGRITY", "index role");
  if (index.aligned_to_ctx_dataset_version !== ctx.dataset_version) return fail("DATASET INTEGRITY", "not aligned to loaded CTX");
  if (typeof index.path !== "string" || typeof index.manifest_sha256 !== "string" || typeof index.dataset_version !== "string") {
    return fail("DATASET INTEGRITY", "index fields");
  }
  const manifestBytes = await getBytes(`/${index.path}manifest.json`);
  if (!manifestBytes) return fail("DATASET INTEGRITY", "manifest.json missing");
  const manifestHash = await sha256Hex(manifestBytes);
  if (manifestHash !== index.manifest_sha256 || manifestHash.slice(0, 12) !== index.dataset_version) {
    return fail("DATASET INTEGRITY", "manifest hash");
  }
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as Record<string, unknown>;
  } catch {
    return fail("DATASET INTEGRITY", "manifest.json is not JSON");
  }
  if (typeof manifest.schema !== "string" || !manifest.schema.startsWith("ares-hirise-display-layer")) {
    return fail("DATASET INTEGRITY", "schema");
  }
  if (typeof manifest.layer_role !== "string" || !manifest.layer_role.startsWith("DISPLAY ONLY.")) {
    return fail("DATASET INTEGRITY", "layer_role");
  }
  const aligned = manifest.aligned_to_ctx_bundle as { dataset_version?: unknown } | undefined;
  if (aligned?.dataset_version !== ctx.dataset_version) return fail("DATASET INTEGRITY", "manifest CTX version");
  const elevation = manifest.elevation as { adjusted_to_ctx?: unknown; vertical_reference?: unknown; ctx_minus_hirise_at_20m_m?: { median?: unknown; std?: unknown }; line_artifacts_1m_source?: { count?: unknown; step_m_median?: unknown; step_m_max?: unknown } } | undefined;
  const registration = manifest.registration as { applied_correction_m?: { east?: unknown; north?: unknown }; offset_hirise_minus_ctx_m?: { east?: unknown; north?: unknown }; estimated_uncertainty_m?: unknown } | undefined;
  if (elevation?.adjusted_to_ctx !== false) return fail("DATASET INTEGRITY", "adjusted");
  if (registration?.applied_correction_m?.east !== 0 || registration?.applied_correction_m?.north !== 0) {
    return fail("DATASET INTEGRITY", "adjusted");
  }
  const extent = manifest.extent_proj_m as { x_min?: unknown; x_max?: unknown; y_min?: unknown; y_max?: unknown } | undefined;
  const xMax = ctx.x0 + ctx.nx * ctx.dx_proj;
  const yMin = ctx.y0 - ctx.ny * ctx.dy_proj;
  if (
    typeof extent?.x_min !== "number" || typeof extent.y_max !== "number"
    || typeof extent.x_max !== "number" || typeof extent.y_min !== "number"
    || Math.abs(extent.x_min - ctx.x0) > 1e-6 || Math.abs(extent.y_max - ctx.y0) > 1e-6
    || Math.abs(extent.x_max - xMax) > 1e-6 || Math.abs(extent.y_min - yMin) > 1e-6
  ) {
    return fail("DATASET INTEGRITY", "extent");
  }
  const grids = manifest.grids as Record<string, unknown> | undefined;
  const files = manifest.files as { file?: unknown; bytes?: unknown; sha256?: unknown }[] | undefined;
  if (!grids || !Array.isArray(files)) return fail("DATASET INTEGRITY", "grids");
  const ids = LEVEL_IDS[level];
  const dtm = grids[ids.dtm];
  const tex = grids[ids.tex];
  if (!finiteGrid(dtm) || !finiteGrid(tex)) return fail("DATASET INTEGRITY", "grid fields");
  const dtmBytes = await readCheckedFile(getBytes, `/${index.path}`, dtm.file, files);
  if (!dtmBytes.ok) return dtmBytes;
  if (dtmBytes.value.byteLength !== dtm.nx * dtm.ny * 4) return fail("DATASET INTEGRITY", "dtm length");
  const texBytes = await readCheckedFile(getBytes, `/${index.path}`, tex.file, files);
  if (!texBytes.ok) return texBytes;
  const jpeg = jpegSize(texBytes.value);
  if (!jpeg || jpeg.width !== tex.nx || jpeg.height !== tex.ny || jpeg.components !== 1) {
    return fail("DATASET INTEGRITY", "jpeg size");
  }
  const sources = manifest.sources as { doi?: unknown }[] | undefined;
  const median = elevation?.ctx_minus_hirise_at_20m_m?.median;
  const std = elevation?.ctx_minus_hirise_at_20m_m?.std;
  const offset = registration?.offset_hirise_minus_ctx_m;
  if (typeof median !== "number" || typeof std !== "number" || typeof offset?.east !== "number" || typeof offset.north !== "number") {
    return fail("DATASET INTEGRITY", "label fields");
  }
  if (typeof elevation?.vertical_reference !== "string" || !elevation.vertical_reference.startsWith("UNVERIFIED")) {
    return fail("DATASET INTEGRITY", "vertical reference");
  }
  const lines = elevation?.line_artifacts_1m_source;
  if (typeof lines?.count !== "number" || typeof lines.step_m_median !== "number" || typeof lines.step_m_max !== "number") {
    return fail("DATASET INTEGRITY", "line artifacts");
  }
  if (typeof registration?.estimated_uncertainty_m !== "number") return fail("DATASET INTEGRITY", "uncertainty");
  const dois = (sources ?? []).map((source) => source.doi).filter((doi): doi is string => typeof doi === "string");
  if (dois.length === 0) return fail("DATASET INTEGRITY", "sources");
  return {
    ok: true,
    value: {
      level,
      version: index.dataset_version,
      grid: { nx: dtm.nx, ny: dtm.ny, x0: dtm.x0, y0: dtm.y0, dx_proj: dtm.dx_proj, dy_proj: dtm.dy_proj },
      heights: readFloat32LE(dtmBytes.value, dtm.nx * dtm.ny),
      textureBytes: texBytes.value,
      textureNx: tex.nx,
      textureNy: tex.ny,
      labels: {
        median,
        std,
        offsetEast: offset.east,
        offsetNorth: offset.north,
        uncertaintyM: registration.estimated_uncertainty_m,
        lineCount: lines.count,
        stepMedian: lines.step_m_median,
        stepMax: lines.step_m_max,
        verticalReference: elevation.vertical_reference,
        dois,
        citations: stringList(manifest.citations),
        credit: typeof manifest.credit === "string" ? manifest.credit : "",
        processing: stringList(manifest.processing),
        limitations: stringList(manifest.limitations),
      },
    },
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function readCheckedFile(
  getBytes: (url: string) => Promise<Uint8Array | null>,
  base: string,
  file: string,
  files: { file?: unknown; bytes?: unknown; sha256?: unknown }[],
): Promise<Checked<Uint8Array>> {
  const entry = files.find((item) => item.file === file);
  if (!entry || typeof entry.bytes !== "number" || typeof entry.sha256 !== "string") {
    return fail("DATASET INTEGRITY", `missing file entry ${file}`);
  }
  const bytes = await getBytes(base + file);
  if (!bytes) return fail("DATASET INTEGRITY", `${file} missing`);
  if (bytes.byteLength !== entry.bytes || (await sha256Hex(bytes)) !== entry.sha256) {
    return fail("DATASET INTEGRITY", `hash ${file}`);
  }
  return { ok: true, value: bytes };
}

/** Barycentric height on the same SW–NE split as buildTerrainMesh. Null if any corner is missing. */
export function sampleHiriseHeight(grid: HiriseGrid, heights: Float32Array, E: number, N: number): number | null {
  const cF = (E - grid.x0) / grid.dx_proj - 0.5;
  const rF = (grid.y0 - N) / grid.dy_proj - 0.5;
  const col = Math.floor(cF);
  const row = Math.floor(rF);
  if (col < 0 || row < 0 || col + 1 >= grid.nx || row + 1 >= grid.ny) return null;
  const fx = cF - col;
  const fy = rF - row;
  const at = (r: number, c: number) => heights[r * grid.nx + c] ?? Number.NaN;
  const nw = at(row, col);
  const ne = at(row, col + 1);
  const sw = at(row + 1, col);
  const se = at(row + 1, col + 1);
  if (fx + fy <= 1) {
    if (!Number.isFinite(nw) || !Number.isFinite(sw) || !Number.isFinite(ne)) return null;
    return nw * (1 - fx - fy) + sw * fy + ne * fx;
  }
  if (!Number.isFinite(sw) || !Number.isFinite(se) || !Number.isFinite(ne)) return null;
  return sw * (1 - fx) + ne * (1 - fy) + se * (fx + fy - 1);
}

/**
 * CTX (E, N) and s_m stay. Only the drawn height comes from the HiRISE mesh.
 * One missing sample rejects the whole line so CTX and HiRISE heights are never mixed.
 */
export function drapeRouteOnHirise(
  ctxHMin: number,
  grid: HiriseGrid,
  heights: Float32Array,
  vertices: ProjPoint[],
  profile: ReadonlyArray<{ s_m: number }>,
  ve: number,
  lift = ROUTE_LIFT_M,
): RouteDisplayPath | null {
  if (vertices.length === 0 || vertices.length !== profile.length) return null;
  const frame = { ...grid, h_min: ctxHMin };
  const xyz: number[] = [];
  const sOut: number[] = [];
  const push = (E: number, N: number, s: number): boolean => {
    const h = sampleHiriseHeight(grid, heights, E, N);
    if (h === null) return false;
    const scene = projToScene(frame, { E, N }, h, ve);
    xyz.push(scene.x, scene.y + lift, scene.z);
    sOut.push(s);
    return true;
  };
  for (let i = 0; i < vertices.length; i++) {
    const vertex = vertices[i];
    const sample = profile[i];
    if (!vertex || !sample) return null;
    if (i === 0) {
      if (!push(vertex.E, vertex.N, sample.s_m)) return null;
      continue;
    }
    const prev = vertices[i - 1];
    const prevS = profile[i - 1];
    if (!prev || !prevS) return null;
    const ds = sample.s_m - prevS.s_m;
    const steps = Math.max(1, Math.ceil(Math.abs(ds) / 1));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      if (!push(prev.E + (vertex.E - prev.E) * t, prev.N + (vertex.N - prev.N) * t, prevS.s_m + ds * t)) return null;
    }
  }
  return { positions: Float32Array.from(xyz), s_m: Float64Array.from(sOut) };
}
