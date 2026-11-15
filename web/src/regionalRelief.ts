// Display-only regional relief bundle (CR-006): USGS TRN CTX DTM 20 m -> 40 m, same CRS as the regional CTX image.
// Every byte is hash-checked; the bundle is never routable and carries no slope or hazard product.
import type { ScenePoint, TerrainMeta } from "@ares/contracts";
import { geoToProj, projToCell, projToScene } from "@ares/core";
import { fail, sha256Hex, type Checked } from "./integrity.ts";

export interface ReliefMeta extends TerrainMeta {
  role: "display_only_regional_relief";
  texture: { regional_basemap_version: string; x0: number; y0: number; dx: number; dy: number; nx: number; ny: number; same_crs: boolean };
  gates: { R3_registration: string; R4_vertical_reference: string };
}
export interface LoadedRelief { meta: ReliefMeta; dem: Float32Array; validity: Uint8Array }

type Fetcher = (url: string) => Promise<Checked<Uint8Array>>;
const REQUIRED = ["dem.f32.bin", "validity.u8.bin", "hillshade.png", "sources.json"];

export async function loadRegionalRelief(get: Fetcher, basemapVersion: string): Promise<Checked<LoadedRelief>> {
  const idx = await get("/data/regional_dem/index.json");
  if (!idx.ok) return idx;
  let e: Record<string, unknown> | undefined;
  try {
    e = (JSON.parse(new TextDecoder().decode(idx.value)) as { regional_dem?: Record<string, unknown> }).regional_dem;
  } catch {
    return fail("DATASET INTEGRITY", "regional_dem index.json is not valid JSON");
  }
  const v = e?.dataset_version;
  if (typeof v !== "string" || e?.path !== `data/regional_dem/${v}/` || e?.role !== "display_only_regional_relief"
    || typeof e?.manifest_sha256 !== "string" || typeof e?.terrain_json_sha256 !== "string") {
    return fail("DATASET INTEGRITY", "regional_dem index entry is incomplete or not display-only");
  }
  const base = `/${e.path}`;
  const m = await get(`${base}manifest.json`);
  if (!m.ok) return m;
  const mh = await sha256Hex(m.value);
  if (mh !== e.manifest_sha256 || mh.slice(0, 12) !== v) return fail("DATASET_VERSION_MISMATCH", "regional_dem manifest does not match the index");
  const list = JSON.parse(new TextDecoder().decode(m.value)) as { file: string; sha256: string }[];
  const files = new Map<string, Uint8Array>();
  for (const r of list) {
    if (!/^[A-Za-z0-9_.-]+$/.test(r.file)) return fail("DATASET INTEGRITY", `regional_dem manifest entry ${r.file} is not allowed`);
    const b = await get(`${base}${r.file}`);
    if (!b.ok) return b;
    if ((await sha256Hex(b.value)) !== r.sha256) return fail("DATASET INTEGRITY", `${r.file} does not match the regional_dem manifest`);
    files.set(r.file, b.value);
  }
  if (REQUIRED.some((f) => !files.has(f))) return fail("DATASET INTEGRITY", "regional_dem manifest is missing a required file");
  const t = await get(`${base}terrain.json`);
  if (!t.ok) return t;
  if ((await sha256Hex(t.value)) !== e.terrain_json_sha256) return fail("DATASET INTEGRITY", "regional_dem terrain.json does not match the index");
  const meta = JSON.parse(new TextDecoder().decode(t.value)) as ReliefMeta;
  if (meta.dataset_version !== v || meta.roi_id !== "regional" || meta.role !== "display_only_regional_relief" || meta.lat_ts_deg !== 0
    || meta.central_meridian_deg !== 0 || meta.radius_m !== 3396190 || !meta.texture?.same_crs) {
    return fail("DATASET INTEGRITY", "regional_dem terrain.json is not the accepted display-only grid");
  }
  if (meta.texture.regional_basemap_version !== basemapVersion) return fail("DATASET_VERSION_MISMATCH", "relief texture is not the loaded regional basemap");
  const n = meta.nx * meta.ny;
  const demB = files.get("dem.f32.bin")!, valB = files.get("validity.u8.bin")!;
  if (demB.byteLength !== n * 4 || valB.byteLength !== n) return fail("DATASET INTEGRITY", "regional_dem grid lengths do not match nx*ny");
  const copy = (b: Uint8Array) => { const a = new ArrayBuffer(b.byteLength); new Uint8Array(a).set(b); return a; };
  return { ok: true, value: { meta, dem: new Float32Array(copy(demB)), validity: new Uint8Array(copy(valB)) } };
}

/** Texture coordinates from map coordinates (the texture extent differs slightly from the grid): u east, v from the top. */
export function reliefUv(meta: ReliefMeta, row: number, col: number): { u: number; v: number } {
  const E = meta.x0 + (col + 0.5) * meta.dx_proj, N = meta.y0 - (row + 0.5) * meta.dy_proj, t = meta.texture;
  return { u: (E - t.x0) / (t.nx * t.dx), v: (t.y0 - N) / (t.ny * t.dy) };
}

/** Where a latitude and longitude stand on the drawn relief: the same map projection as the 2D regional map, on the
 *  height of the 40 m cell that contains the point, times the vertical exaggeration. null off the grid or on NoData. */
export function reliefScene(relief: LoadedRelief, lat: number, lon: number, ve: number): ScenePoint | null {
  const q = geoToProj(relief.meta, { lat, lon }), cell = projToCell(relief.meta, q);
  if (!cell) return null;
  const h = relief.dem[cell.row * relief.meta.nx + cell.col];
  return Number.isFinite(h) ? projToScene(relief.meta, q, h, ve) : null;
}
