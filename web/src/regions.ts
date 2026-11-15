// Analysis regions beyond ROI-A and the regional basemap (docs/decisions/MAP-LAYERS-AND-UI-CONTRACT.md).
// Every byte is hash-checked before use; any failure keeps the region disabled with the reason shown.
import type { Cell, Poi, SourceRecord, TerrainMeta } from "@ares/contracts";
import { geoToProj, projToCell, type TerrainGrid } from "@ares/core";
import { assembleGrid, fail, sha256Hex, verifyRoiBundle, type Checked } from "./integrity.ts";

export type RegionId = "roi_a" | "m0a";

export const M0A_NOTES = [
  "Analysis grid: USGS HiRISE DTM (1 m) averaged to 2 m; effective terrain resolution is several metres. Rocks and small hazards are not represented.",
  "Endpoints are rover positions from PDS/NASA records, not tube, core or rock points.",
  "Cost curve shape comes from Earth, unsuited walking data (pending S6); flat-equivalent metres are relative, not energy or time.",
  "g_max 0.45 (24.2°) is an experimental algorithm threshold, not an astronaut safety limit.",
  "Candidate route corridor, not a surveyed path: independent HiRISE stereo DTMs move the terrain-route line by up to ~39 m at <0.5 % cost change.",
  "Vertical datum UNVERIFIED; G1/S-4 DEM registration open. The ~1.2 m CTX/HiRISE ortho match does not validate DEM registration.",
];

/** Notes for routes on the wider M0-A-B grid (mission B). Figures from analysis/m0ab/results/sensitivity_<version>.json. */
export const M0AB_NOTES = [
  ...M0A_NOTES.slice(0, 4),
  "Candidate route corridor, not a surveyed path: independent HiRISE stereo DTMs move the M0 → B terrain-route line by up to ~44 m at about 1 % cost change.",
  "Wider M0–A–B grid: the automated gates G1–G3 pass and the G4 registration numbers meet their limits. The owner approved for prototype analysis on 15 Nov 2026 (G4, G5), on the same terms as the M0–A grid.",
  "Vertical datum UNVERIFIED; G1/S-4 DEM registration open. The endpoint at Amalik is the rover position during sampling, not the outcrop or a drill hole.",
];

export const M0AB_SCENARIO = "M0 Bearwallow-drop rover position → Amalik sampling rover position — candidate route corridor (prototype, wider grid)";

export const M0A_SCENARIO = "M0 Bearwallow-drop rover position → Skinner Ridge sampling rover position — candidate route corridor (prototype)";

export interface M0AEndpoint { lat: number; lon: number; semantics: string; row: number; col: number; validity: number; snap_distance_ground_m: number }

export type HiriseArea = "m0a" | "m0ab"; // the frozen M0-A grid, and the wider grid that also holds Amalik (mission B)

export interface LoadedM0A {
  area: HiriseArea;
  meta: TerrainMeta;
  grid: TerrainGrid;
  pois: Poi[];
  sources: SourceRecord[];
  orthoUrl: string;
  hillshadeUrl: string;
  start: Cell;
  goal: Cell;
}

export interface RegionalFeature { kind: string; lat?: number; lon?: number; x_px?: number; y_px?: number; nw?: { x_px: number; y_px: number }; se?: { x_px: number; y_px: number } }

export interface RegionalMeta {
  version: string;
  crs_proj4: string;
  source: { id: string; url: string; product: string; agency: string; native_pixel_m: number };
  assets: { "science_6m.jpg": { x0: number; y0: number; dx: number; dy: number; nx: number; ny: number; nodata_share: number } };
  features_px_in_science_6m: Record<string, RegionalFeature>;
  registration_vs_hirise_ortho: Record<string, { status: string; shift_east_m?: number; shift_north_m?: number; ncc?: number }>;
  limits: string[];
}

export interface LoadedRegional { meta: RegionalMeta; imageUrl: string; radius_m: number }

type Fetcher = (url: string) => Promise<Checked<Uint8Array>>;

function blobUrl(bytes: Uint8Array, type: string): string {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return URL.createObjectURL(new Blob([buffer], { type }));
}

function json<T>(bytes: Uint8Array, name: string): Checked<T> {
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as T };
  } catch {
    return fail("DATASET INTEGRITY", `${name} is not valid JSON`);
  }
}

async function manifestFiles(get: Fetcher, base: string): Promise<Checked<{ manifest: Uint8Array; files: Map<string, Uint8Array> }>> {
  const manifest = await get(`${base}manifest.json`);
  if (!manifest.ok) return manifest;
  const list = json<{ file: string }[]>(manifest.value, "manifest.json");
  if (!list.ok) return list;
  if (!Array.isArray(list.value)) return fail("DATASET INTEGRITY", "manifest.json is not a list");
  const files = new Map<string, Uint8Array>();
  for (const entry of list.value) {
    if (typeof entry?.file !== "string" || entry.file.includes("/")) return fail("DATASET INTEGRITY", "manifest entry is malformed");
    const bytes = await get(`${base}${entry.file}`);
    if (!bytes.ok) return bytes;
    files.set(entry.file, bytes.value);
  }
  return { ok: true, value: { manifest: manifest.value, files } };
}

/** Rover positions from the bundle's own endpoints.json, shown as POIs. Never tube or rock points. */
function endpointPois(ends: Record<string, M0AEndpoint>, version: string): Poi[] {
  const make = (id: string, name: string, e: M0AEndpoint, kind: "pds_rover_position" | "other", product: string, locator: string,
    url: string, elev: number, ref: "areoid" | "unknown"): Poi => ({
    id, name, geo: { lat: e.lat, lon: e.lon },
    claim: `${e.semantics} Snapped to analysis cell (${e.row}, ${e.col}), ${e.snap_distance_ground_m.toFixed(2)} m from the record.`,
    source: `M0-A analysis bundle ${version} endpoints.json (ARES-1 catalog 572fba1ce61f)`,
    confidence: "medium",
    evidence: {
      schema: "ares-poi-evidence/1",
      coordinate_source: { status: "VERIFIED", kind, product, locator, url, printed: { lat: e.lat, lon: e.lon, elev_m: elev },
        convention: { latitude: "planetocentric", longitude: "east_positive", lon_domain: "-180..180", elevation_reference: ref }, cross_checks: [] },
      target_location: { precision: "APPROXIMATE", basis: "Rover position at the event; the tube or rock lies near, not at, this point. Tube and rock centres are not verified." },
      ctx_registration: { status: "UNRESOLVED", ref: "G1/S-4", note: "M0-A uses the HiRISE DTM frame; CTX DEM registration remains open." },
      vertical_datum: { status: "UNVERIFIED" },
      role: { kind: kind === "pds_rover_position" ? "sampling_site" : "other", validated_habitat: false, text: name },
    },
  });
  return [
    // Source facts copied from ARES-1 catalog 572fba1ce61f (reference_waypoints / outcrops positions and source_register).
    make("m0_bearwallow", "M0 rover position (Bearwallow drop; not a tube location)", ends.start_M0, "other",
      "NASA MMGIS M20 rover waypoints (end-of-drive localization)", "RMC 32_774 (sol 674)",
      "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json", -2545.443, "unknown"),
    make("a_skinner", "A rover position (Skinner Ridge sampling; not a rock centre)", ends.goal_A, "pds_rover_position",
      "PDS Mars 2020 Sample Dossier Initial Reports, volume 2", "p. 14",
      "https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_sample_dossier/initial_reports/initial_reports_volume2.pdf", -2520.185, "areoid"),
    ...(ends.goal_B ? [make("b_amalik", "B rover position (Amalik sampling, Mageik sheet; not the outcrop or a drill hole)", ends.goal_B, "pds_rover_position",
      "PDS Mars 2020 Sample Dossier Initial Reports, volume 2", "p. 145",
      "https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_sample_dossier/initial_reports/initial_reports_volume2.pdf", -2526.292, "areoid")] : []),
  ];
}

const M0A_SOURCES = (version: string): SourceRecord[] => [
  { id: "hirise_dtm_1m", url: "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif",
    agency: "USGS Astrogeology / NASA", mission: "MRO", instrument: "HiRISE", product_version: `JEZ_hirise_soc_006 (M0-A analysis bundle ${version})`,
    citation: "USGS Astrogeology, Mars 2020 TRN HiRISE DTM mosaic", crs: "eqc lat_ts 0, R 3396190 m", native_pixel_m: 1,
    vertical_reference: "UNVERIFIED (MOLA-tied, DeltaGeoid)", license: "NASA/USGS public data", confidence: "medium",
    limitations: ["2 x 2 block mean to the 2 m ANALYSIS grid (G5, prototype)", "stereo pairs C/W/DL differ by up to 2.4 m", "not used outside M0-A"] },
  { id: "hirise_ortho_25cm", url: "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_007_orthoMosaic_25cm_Ortho_blend120.tif",
    agency: "USGS Astrogeology / NASA", mission: "MRO", instrument: "HiRISE", product_version: "JEZ_hirise_soc_007",
    citation: "USGS Astrogeology, Mars 2020 TRN HiRISE orthomosaic", crs: "orthographic lat_0 18.4663 lon_0 77.4298 (warped to the DTM grid)", native_pixel_m: 0.25,
    vertical_reference: "n/a", license: "NASA/USGS public data", confidence: "medium", limitations: ["display texture only (1 m)", "contrast stretched"] },
];

export async function loadM0A(get: Fetcher, area: HiriseArea = "m0a"): Promise<Checked<LoadedM0A>> {
  const idx = await get(`/data/${area}/index.json`);
  if (!idx.ok) return idx;
  const index = json<Record<string, { dataset_version?: unknown; path?: unknown; terrain_json_sha256?: unknown; role?: unknown } | undefined>>(idx.value, `${area} index.json`);
  if (!index.ok) return index;
  const e = index.value[area];
  if (typeof e?.dataset_version !== "string" || typeof e.terrain_json_sha256 !== "string") return fail("DATASET INTEGRITY", "m0a index entry is incomplete");
  if (e.path !== `data/${area}/${e.dataset_version}/` || e.role !== "prototype_analysis") return fail("DATASET INTEGRITY", "m0a index path or role is wrong");
  const base = `/${e.path}`;
  const listed = await manifestFiles(get, base);
  if (!listed.ok) return listed;
  const terrain = await get(`${base}terrain.json`);
  if (!terrain.ok) return terrain;
  const verified = await verifyRoiBundle({ datasetVersion: e.dataset_version, terrainJsonSha256: e.terrain_json_sha256, manifestBytes: listed.value.manifest,
    terrainBytes: terrain.value, files: listed.value.files,
    requiredFiles: ["dem.f32.bin", "slope_deg.f32.bin", "validity.u8.bin", "ortho_1m.jpg", "hillshade.png", "endpoints.json", "sources.json"] });
  if (!verified.ok) return verified;
  const meta = verified.value as TerrainMeta & { analysis_role?: string };
  // Runtime validation specific to this region: the accepted grid, nothing else.
  if (meta.roi_id !== area || meta.dx_proj !== 2 || meta.dy_proj !== 2 || meta.lat_ts_deg !== 0 || meta.radius_m !== 3396190) {
    return fail("DATASET INTEGRITY", "terrain.json is not the accepted M0-A 2 m HiRISE grid");
  }
  if (Math.abs(meta.dx_ground_m / meta.dx_proj - Math.cos((((meta.bounds_geo.lat_min + meta.bounds_geo.lat_max) / 2) * Math.PI) / 180)) > 1e-4) {
    return fail("DATASET INTEGRITY", "dx_ground_m does not apply cos(latitude) exactly once");
  }
  const f = listed.value.files;
  const grid = assembleGrid(meta, f.get("dem.f32.bin")!, f.get("slope_deg.f32.bin")!, f.get("validity.u8.bin")!);
  if (!grid.ok) return grid;
  const ends = json<{ endpoints: Record<string, M0AEndpoint> }>(f.get("endpoints.json")!, "endpoints.json");
  if (!ends.ok) return ends;
  if (area === "m0ab") { // the wider grid must declare that it holds the frozen grid cell for cell (checked again in the unit tests)
    const sup = (meta as unknown as { superset_of?: { identical?: { dem?: boolean; slope?: boolean; validity?: boolean } } }).superset_of?.identical;
    if (!sup?.dem || !sup.slope || !sup.validity) return fail("DATASET INTEGRITY", "the wider grid does not declare the frozen M0-A grid as an identical subset");
  }
  const cells: Cell[] = [];
  for (const key of area === "m0ab" ? ["start_M0", "goal_B"] : ["start_M0", "goal_A"]) {
    const p = ends.value.endpoints[key];
    if (!p) return fail("DATASET INTEGRITY", `endpoints.json has no ${key}`);
    const c = projToCell(meta, geoToProj(meta, { lat: p.lat, lon: p.lon }));
    if (!c || c.row !== p.row || c.col !== p.col) return fail("DATASET INTEGRITY", `${key} does not snap to its recorded cell`);
    const v = grid.value.validity[c.row * meta.nx + c.col];
    if (v !== 0 && v !== 3) return fail("DATASET INTEGRITY", `${key} lies on NoData`);
    cells.push(c);
  }
  return { ok: true, value: { area, meta, grid: grid.value, pois: endpointPois(ends.value.endpoints, meta.dataset_version), sources: M0A_SOURCES(meta.dataset_version),
    orthoUrl: blobUrl(f.get("ortho_1m.jpg")!, "image/jpeg"), hillshadeUrl: blobUrl(f.get("hillshade.png")!, "image/png"), start: cells[0], goal: cells[1] } };
}

export async function loadRegional(get: Fetcher): Promise<Checked<LoadedRegional>> {
  const idx = await get("/data/regional/index.json");
  if (!idx.ok) return idx;
  const index = json<{ regional?: { version?: unknown; path?: unknown; regional_json_sha256?: unknown } }>(idx.value, "regional index.json");
  if (!index.ok) return index;
  const e = index.value.regional;
  if (typeof e?.version !== "string" || e.path !== `data/regional/${e.version}/` || typeof e.regional_json_sha256 !== "string") {
    return fail("DATASET INTEGRITY", "regional index entry is incomplete");
  }
  const base = `/${e.path}`;
  const listed = await manifestFiles(get, base);
  if (!listed.ok) return listed;
  const manifest = json<{ file: string; sha256: string }[]>(listed.value.manifest, "manifest.json");
  if (!manifest.ok) return manifest;
  for (const m of manifest.value) {
    if ((await sha256Hex(listed.value.files.get(m.file)!)) !== m.sha256) return fail("DATASET INTEGRITY", `${m.file} does not match the regional manifest`);
  }
  if ((await sha256Hex(listed.value.manifest)).slice(0, 12) !== e.version) return fail("DATASET_VERSION_MISMATCH", "regional manifest does not match its version");
  const sidecar = await get(`${base}regional.json`);
  if (!sidecar.ok) return sidecar;
  if ((await sha256Hex(sidecar.value)) !== e.regional_json_sha256) return fail("DATASET INTEGRITY", "regional.json does not match the index");
  const meta = json<RegionalMeta>(sidecar.value, "regional.json");
  if (!meta.ok) return meta;
  const R = /\+R=(\d+(?:\.\d+)?)/.exec(meta.value.crs_proj4);
  if (!/\+proj=eqc/.test(meta.value.crs_proj4) || !/\+lat_ts=0\b/.test(meta.value.crs_proj4) || !/\+lon_0=0\b/.test(meta.value.crs_proj4) || !R) return fail("DATASET INTEGRITY", "regional basemap is not the expected eqc lat_ts 0 grid");
  const img = listed.value.files.get("science_6m.jpg");
  if (!img) return fail("DATASET INTEGRITY", "science_6m.jpg is not in the regional manifest");
  return { ok: true, value: { meta: meta.value, imageUrl: blobUrl(img, "image/jpeg"), radius_m: Number(R[1]) } };
}

/** Regional basemap pixel (pixel-edge coordinates, row 0 = north) <-> planetocentric lat / east lon. eqc, lat_ts 0. */
export function regionalPixelToGeo(r: LoadedRegional, x: number, y: number): { lat: number; lon: number } {
  const a = r.meta.assets["science_6m.jpg"];
  const E = a.x0 + x * a.dx, N = a.y0 - y * a.dy;
  return { lat: (N / r.radius_m) * (180 / Math.PI), lon: (E / r.radius_m) * (180 / Math.PI) };
}

export function regionalGeoToPixel(r: LoadedRegional, lat: number, lon: number): { x: number; y: number } {
  const a = r.meta.assets["science_6m.jpg"];
  const E = r.radius_m * (lon * Math.PI) / 180, N = r.radius_m * (lat * Math.PI) / 180;
  return { x: (E - a.x0) / a.dx, y: (a.y0 - N) / a.dy };
}
