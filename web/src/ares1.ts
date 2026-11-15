import { sha256Hex } from "./integrity.ts";

const INDEX_URL = "/data/ares1/index.json";
const CATALOG_SCHEMA = "ares1-science-catalog/1";
const BUNDLE_SCHEMA = "ares1-catalog-bundle/1";

export const ATLAS_TEXT = {
  banner: "Science Atlas (read-only). Historical NASA/PDS records; not a mission plan.",
  positions: "Positions are rover positions or approximate rover waypoints, never exact rock or tube locations.",
  consistency: "Consistency checks confirm that related records agree; they are not independent scientific validations.",
  route: "Routing to an exact ARES-1 target is not available: no exact tube or rock locations exist. Planning has an M0–A prototype corridor between two rover positions, and an M0–B corridor on a wider grid of the same kind; C (Bright Angel) has no analysis grid.",
  tubes: "Tube positions not available in the PDS records.",
  exact: "Only rover positions during sampling are published.",
  uncertaintyDisabled: "Pressure uncertainty not provided in this product.",
  utc: "No per-record UTC in this product (SCLK/LMST/LTST only).",
  caution: "Bright Angel lies in the HiRISE CR_SOUTH stereo pair (USGS: uncompensated y-parallax).",
  noLife: "No evidence of life has been established.",
  b08: "Hypothesis (low): abiotic pathways not excluded.",
  witness: "Witness tube (contamination control). Sealing: Sol 586, 19:16:40 LMST (Initial Report only; Earth date unresolved: 12 Oct 2022 per Initial Report, 14 Oct 2022 per NASA page).",
  witnessRow: "Earth sealing date unresolved: 12 Oct 2022 (Initial Report) vs 14 Oct 2022 (NASA page).",
  samplingPosition: "Rover position during sampling (outcrop extent unknown).",
  medaCaption: "Historical rover-local measurement (Perseverance MEDA PS, sol 516, 2022, PDS Derived). Not a weather map, not a forecast, not an EVA risk value.",
  parserNote: "\"Parser status: valid\" means the row passed format and sanity checks only; it is not a full scientific quality assessment.",
  uncertaintyValue: "Not provided in source",
  location: "Attributed to the rover parked at the Wildcat Ridge workspace (medium confidence: no logged drives between sols 502 and 535).",
  cited: "Cited (not retrieved or verified by ARES-1)",
  tubeCenter: "Not available",
} as const;

export function atlasUnavailable(reason: string): string {
  return `ARES-1 science catalog unavailable (${reason})`;
}

export function dropTimeLabel(time: string): string {
  return `${time} (sol-local; time scale not stated by source)`;
}

export function sealingLabel(sol: number, lmst: string): string {
  return `Sol ${sol}, ${lmst} LMST`;
}

export function waypointLine(sol: number, rmc: string): string {
  return `Approximate rover waypoint (NASA MMGIS, sol ${sol}, RMC ${rmc}). Not a sample or tube point.`;
}

export function roverDropLine(lat: number, lon: number): string {
  return `Rover position during drop (not the tube): ${lat} N, ${lon} E`;
}

export function separationLine(meters: number): string {
  return `Sampling positions ${meters} m apart`;
}

export function coreBadge(location: string): "In Three Forks Depot (M0)" | "On the rover" | null {
  if (location.includes("Three Forks Depot")) return "In Three Forks Depot (M0)";
  if (location.includes("Rover")) return "On the rover";
  return null;
}

export interface SourceEntry {
  id: string;
  title: string;
  kind: string;
  url: string | null;
  sha256: string | null;
  retrieved: string | null;
}

export interface MedaRow {
  lmst: string;
  ltst: string;
  pressure: number | null;
  uncertainty: string;
  status: string;
}

export interface AtlasPosition {
  lat_deg: number;
  lon_deg_east: number;
  semantics: string;
}

export interface AtlasSample {
  id: string;
  sample_designation: string;
  sample_name: string;
  alternate_names: string[];
  nasa_public_sample_number: number | null;
  designation_tube_number: number | null;
  classification: { team_class: string; nasa_sample_type: string | null; nasa_rock_type: string | null };
  current_location: string;
  sealing_event: { sol: number; lmst: string } | null;
}

export interface AtlasDrop {
  id: string;
  sample: string;
  sample_designation: string;
  drop_sol: number;
  drop_time: string;
  rover_position: AtlasPosition;
  tube_center: { status: string };
}

export interface AtlasWaypoint {
  id: string;
  position: { semantics: string; locator: string };
}

export interface AspectEvidence {
  confidence: string;
  evidence_kind: string;
}

export interface AtlasOutcrop {
  id: string;
  name: string;
  cores: string[];
  evidence: { rock_type: AspectEvidence; scientific_interpretation: AspectEvidence; core_ids: AspectEvidence };
}

export interface AtlasRock {
  id: string;
  name: string;
  is_not: string;
  cores: string[];
}

export interface AtlasClaim {
  id: string;
  claim: string;
  confidence: string;
  evidence_kind: string;
  limitation: string;
  primary_source: string;
  primary_source_url: string | null;
}

export interface AtlasSeries {
  id: string;
  sol: number;
  start_utc: string;
  stop_utc: string;
  pressure_pa_valid: { min: number; max: number; mean: number; median: number } | null;
}

export interface AtlasCatalog {
  schema: string;
  missions: { id: string; name: string; drop_events?: string[]; outcrops?: string[]; rocks?: string[]; claims?: string[]; reference_waypoint?: string }[];
  outcrops: AtlasOutcrop[];
  rocks: AtlasRock[];
  samples: AtlasSample[];
  depot_drop_events: AtlasDrop[];
  reference_waypoints: AtlasWaypoint[];
  reference_distances_m: Record<string, number>;
  claims: AtlasClaim[];
  measurement_series: AtlasSeries[];
}

export interface AtlasReady {
  ok: true;
  catalog: AtlasCatalog;
  sources: SourceEntry[];
  rows: MedaRow[];
  anomalies: string[];
}

export interface AtlasBlocked {
  ok: false;
  reason: string;
}

export type AtlasLoad = AtlasReady | AtlasBlocked;

function blocked(reason: string): AtlasBlocked {
  return { ok: false, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function lmstSeconds(lmst: string): number | null {
  const match = /^\d+M(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(lmst);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

const SESSION_GAP_S = 2;

export interface MedaPoint {
  x: number;
  y: number;
  pressure: number;
  session: number;
}

export interface MedaTick {
  x?: number;
  y?: number;
  label: string;
}

export interface MedaLayout {
  points: MedaPoint[];
  sessions: number;
  xTicks: MedaTick[];
  yTicks: MedaTick[];
}

/** Map LMST seconds and pascals onto the canvas. A gap longer than 2 s starts a new session. */
export function layoutMeda(rows: readonly MedaRow[], width: number, height: number): MedaLayout {
  const samples: { lmst: number; pressure: number; session: number }[] = [];
  let session = -1;
  let previous: number | null = null;
  for (const row of rows) {
    const lmst = lmstSeconds(row.lmst);
    if (lmst == null || row.pressure == null) continue;
    if (previous == null || lmst - previous > SESSION_GAP_S) session += 1;
    samples.push({ lmst, pressure: row.pressure, session });
    previous = lmst;
  }
  const left = 64;
  const right = width - 16;
  const top = 16;
  const bottom = height - 36;
  if (samples.length === 0) return { points: [], sessions: 0, xTicks: [], yTicks: [] };
  const minX = Math.min(...samples.map((sample) => sample.lmst));
  const maxX = Math.max(...samples.map((sample) => sample.lmst));
  const minY = Math.min(...samples.map((sample) => sample.pressure));
  const maxY = Math.max(...samples.map((sample) => sample.pressure));
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const xOf = (lmst: number) => left + ((lmst - minX) / spanX) * (right - left);
  const yOf = (pressure: number) => bottom - ((pressure - minY) / spanY) * (bottom - top);
  const points = samples.map((sample) => ({
    x: xOf(sample.lmst),
    y: yOf(sample.pressure),
    pressure: sample.pressure,
    session: sample.session,
  }));
  const yTicks = [minY, (minY + maxY) / 2, maxY].map((pressure) => ({ y: yOf(pressure), label: `${pressure.toFixed(1)} Pa` }));
  const xTicks: MedaTick[] = [];
  for (let hour = Math.ceil(minX / 3600); hour <= Math.floor(maxX / 3600); hour += 4) {
    xTicks.push({ x: xOf(hour * 3600), label: `${String(hour).padStart(2, "0")}:00` });
  }
  return { points, sessions: session + 1, xTicks, yTicks };
}

export function parseMedaRows(text: string): MedaRow[] | string {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.length > 0);
  const header = lines[0]?.split(",") ?? [];
  if (header[2] !== "lmst_as_published" || header[3] !== "ltst_as_published" || header[4] !== "pressure_as_published" || header[5] !== "pressure_uncertainty_as_published" || header[7] !== "status") {
    return "MEDA rows header does not match the catalog extract";
  }
  const rows: MedaRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i]!.split(",");
    if (cells.length < 8) return `MEDA row ${i} is short`;
    const pressureText = cells[4] ?? "";
    const pressure = pressureText === "" ? null : Number(pressureText);
    if (pressureText !== "" && !Number.isFinite(pressure)) return `MEDA row ${i} pressure is not a number`;
    rows.push({
      lmst: cells[2] ?? "",
      ltst: cells[3] ?? "",
      pressure,
      uncertainty: cells[5] ?? "",
      status: cells[7] ?? "",
    });
  }
  return rows;
}

export function readWaypointPin(waypoint: AtlasWaypoint): string | null {
  const sol = /sol (\d+)/.exec(waypoint.position.semantics)?.[1];
  const rmc = /^RMC (\S+)/.exec(waypoint.position.locator)?.[1];
  if (!sol || !rmc) return null;
  return waypointLine(Number(sol), rmc);
}

async function mustBytes(getBytes: (url: string) => Promise<Uint8Array | null>, url: string, label: string): Promise<Uint8Array | AtlasBlocked> {
  const bytes = await getBytes(url);
  if (!bytes) return blocked(`${label} is missing`);
  return bytes;
}

function readSources(value: unknown): SourceEntry[] | string {
  if (!Array.isArray(value)) return "source register is missing";
  const sources: SourceEntry[] = [];
  for (const row of value) {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.title !== "string" || typeof row.kind !== "string") {
      return "source register entry is incomplete";
    }
    sources.push({
      id: row.id,
      title: row.title,
      kind: row.kind,
      url: textOrNull(row.url),
      sha256: textOrNull(row.sha256),
      retrieved: textOrNull(row.retrieved),
    });
  }
  return sources;
}

export async function loadAres1Catalog(getBytes: (url: string) => Promise<Uint8Array | null>): Promise<AtlasLoad> {
  try {
    const indexBytes = await mustBytes(getBytes, INDEX_URL, "index.json");
    if (!("byteLength" in indexBytes)) return indexBytes;
    const index = JSON.parse(new TextDecoder().decode(indexBytes)) as unknown;
    if (!isRecord(index) || !isRecord(index.catalog)) return blocked("index.json has no catalog entry");
    const catalogIndex = index.catalog;
    const version = catalogIndex.version;
    const path = catalogIndex.path;
    const manifestSha = catalogIndex.manifest_sha256;
    if (typeof version !== "string" || typeof path !== "string" || typeof manifestSha !== "string") {
      return blocked("index.json catalog entry is incomplete");
    }
    if (catalogIndex.role !== "development_only") return blocked("role is not development_only");
    const folder = path.split("/").filter((part) => part.length > 0).at(-1);
    if (folder !== version) return blocked("catalog folder does not match the version");
    const manifestUrl = `/${path}manifest.json`;
    const manifestBytes = await mustBytes(getBytes, manifestUrl, "manifest.json");
    if (!("byteLength" in manifestBytes)) return manifestBytes;
    const manifestHash = await sha256Hex(manifestBytes);
    if (manifestHash !== manifestSha.toLowerCase()) return blocked("manifest sha256 does not match the index");
    if (manifestHash.slice(0, 12) !== version) return blocked("manifest sha256 prefix does not match the catalog version");
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as unknown;
    if (!isRecord(manifest) || manifest.schema !== BUNDLE_SCHEMA) return blocked("manifest schema is not ares1-catalog-bundle/1");
    if (!Array.isArray(manifest.files)) return blocked("manifest files list is missing");
    const held = new Map<string, Uint8Array>();
    for (const row of manifest.files) {
      if (!isRecord(row) || typeof row.file !== "string" || typeof row.bytes !== "number" || typeof row.sha256 !== "string") {
        return blocked("manifest file entry is incomplete");
      }
      const fileBytes = await mustBytes(getBytes, `/${path}${row.file}`, row.file);
      if (!("byteLength" in fileBytes)) return fileBytes;
      if (fileBytes.byteLength !== row.bytes || (await sha256Hex(fileBytes)) !== row.sha256.toLowerCase()) {
        return blocked(`${row.file} does not match the manifest`);
      }
      held.set(row.file, fileBytes);
    }
    const catalogBytes = held.get("catalog.json");
    const qaBytes = held.get("meda_sol0516_der_ps_qa.json");
    const rowBytes = held.get("meda_sol0516_der_ps_rows.csv");
    if (!catalogBytes || !qaBytes || !rowBytes) return blocked("manifest is missing a catalog file");
    const catalog = JSON.parse(new TextDecoder().decode(catalogBytes)) as AtlasCatalog;
    if (!isRecord(catalog) || catalog.schema !== CATALOG_SCHEMA) return blocked("catalog schema is not ares1-science-catalog/1");
    const qa = JSON.parse(new TextDecoder().decode(qaBytes)) as unknown;
    if (!isRecord(qa) || !Array.isArray(qa.label_anomalies) || qa.label_anomalies.some((line) => typeof line !== "string")) {
      return blocked("MEDA label anomalies are missing");
    }
    const parsedRows = parseMedaRows(new TextDecoder().decode(rowBytes));
    if (typeof parsedRows === "string") return blocked(parsedRows);
    const sources = readSources(manifest.source_register);
    if (typeof sources === "string") return blocked(sources);
    return { ok: true, catalog, sources, rows: parsedRows, anomalies: qa.label_anomalies as string[] };
  } catch (error) {
    return blocked(error instanceof Error ? error.message : "catalog read failed");
  }
}

export function statusCounts(rows: readonly MedaRow[]): Record<string, number> {
  const counts: Record<string, number> = { valid: 0, flagged: 0, missing: 0, invalid: 0 };
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return counts;
}
