import type { Poi, PoiEvidence } from "@ares/contracts";

const SCHEMA = "ares-poi-evidence/1";
const COORD_STATUS = new Set(["VERIFIED", "UNVERIFIED"]);
const COORD_KIND = new Set(["pds_rover_position", "pds_landing_site", "publication", "other"]);
const PRECISION = new Set(["EXACT", "APPROXIMATE", "UNKNOWN"]);
const REG_STATUS = new Set(["VERIFIED", "UNRESOLVED"]);
const DATUM_STATUS = new Set(["VERIFIED", "UNVERIFIED"]);
const ROLE_KIND = new Set(["historical_landing_reference", "sampling_site", "other"]);
const GEO_TOL_DEG = 1e-9;

export interface PoiDisplayStatus {
  notice: string | null;
  coordinate: "VERIFIED" | "UNVERIFIED";
  coordinate_label: string;
  target_precision: "EXACT" | "APPROXIMATE" | "UNKNOWN";
  target_label: string;
  registration_label: string;
  datum_label: string;
  role_label: string | null;
  elevation_label: string | null;
}

export interface PoiBadge {
  text: string;
  testId: "poi-pds-verified" | "poi-target-approx" | "poi-unverified";
}

const LEGACY: PoiDisplayStatus = {
  notice: null,
  coordinate: "UNVERIFIED",
  coordinate_label: "Coordinates UNVERIFIED (no evidence record)",
  target_precision: "UNKNOWN",
  target_label: "Target location: precision unknown",
  registration_label: "CTX DEM/image registration UNRESOLVED (S-4)",
  datum_label: "Vertical datum UNVERIFIED",
  role_label: null,
  elevation_label: null,
};

function isNum(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Empty list means the record is valid. Missing evidence is not an error. */
export function evidenceProblems(poi: Poi): string[] {
  const ev = poi.evidence;
  if (ev == null) return [];
  if (typeof ev !== "object") return ["evidence is not an object"];
  const problems: string[] = [];
  if (ev.schema !== SCHEMA) problems.push(`schema must be ${SCHEMA}`);
  const cs = ev.coordinate_source;
  if (!cs || typeof cs !== "object") problems.push("coordinate_source missing");
  else {
    if (!COORD_STATUS.has(cs.status)) problems.push("coordinate_source.status");
    if (!COORD_KIND.has(cs.kind)) problems.push("coordinate_source.kind");
    for (const field of ["product", "locator", "url"] as const) {
      if (typeof cs[field] !== "string" || cs[field] === "") problems.push(`coordinate_source.${field}`);
    }
    const printed = cs.printed;
    if (!printed || !isNum(printed.lat) || !isNum(printed.lon) || !(printed.elev_m == null || isNum(printed.elev_m))) {
      problems.push("coordinate_source.printed");
    }
    const convention = cs.convention;
    if (
      !convention
      || convention.latitude !== "planetocentric"
      || convention.longitude !== "east_positive"
      || (convention.elevation_reference !== "areoid" && convention.elevation_reference !== "unknown")
    ) {
      problems.push("coordinate_source.convention");
    }
    if (!Array.isArray(cs.cross_checks) || cs.cross_checks.some((item) => !item || typeof item.source !== "string" || !isNum(item.delta_m))) {
      problems.push("coordinate_source.cross_checks");
    }
  }
  const target = ev.target_location;
  if (!target || !PRECISION.has(target.precision) || typeof target.basis !== "string") problems.push("target_location");
  const registration = ev.ctx_registration;
  if (!registration || !REG_STATUS.has(registration.status) || typeof registration.ref !== "string") problems.push("ctx_registration");
  const datum = ev.vertical_datum;
  if (!datum || !DATUM_STATUS.has(datum.status)) problems.push("vertical_datum");
  const role = ev.role;
  if (!role || !ROLE_KIND.has(role.kind) || role.validated_habitat !== false || typeof role.text !== "string") {
    problems.push("role (validated_habitat must be false)");
  }
  return problems;
}

/** missing = no record (legacy POI); incompatible = another schema; invalid = this schema with problems; valid. */
export function evidenceKind(poi: Poi): "missing" | "incompatible" | "invalid" | "valid" {
  const ev = poi.evidence as unknown;
  if (ev == null) return "missing";
  if (typeof ev !== "object" || (ev as { schema?: unknown }).schema !== SCHEMA) return "incompatible";
  return evidenceProblems(poi).length ? "invalid" : "valid";
}

/** Labels for one POI. Never derived from confidence. */
export function displayStatus(poi: Poi): PoiDisplayStatus {
  const evidence = poi.evidence;
  const problems = evidenceProblems(poi);
  if (evidence == null) return { ...LEGACY }; // missing: a legacy POI, not an error
  const kind = evidenceKind(poi);
  if (kind === "incompatible") {
    return { ...LEGACY, notice: `POI evidence schema ${String((evidence as { schema?: unknown }).schema)} is not supported; showing legacy statuses` };
  }
  if (problems.length > 0) {
    return { ...LEGACY, notice: "POI evidence record invalid; showing legacy statuses" }; // CR-004 golden text; details via evidenceProblems()
  }
  const source = evidence.coordinate_source;
  const target = evidence.target_location;
  const matches = isNum(poi.geo?.lat) && isNum(poi.geo?.lon)
    && Math.abs(poi.geo.lat - source.printed.lat) <= GEO_TOL_DEG
    && Math.abs(poi.geo.lon - source.printed.lon) <= GEO_TOL_DEG;
  const out: PoiDisplayStatus = { ...LEGACY, notice: null, role_label: evidence.role.text };
  if (source.status === "VERIFIED" && matches) {
    const what = source.kind === "pds_rover_position"
      ? "PDS rover position"
      : source.kind === "pds_landing_site"
        ? "PDS landing-site position"
        : "Source position";
    out.coordinate = "VERIFIED";
    out.coordinate_label = `Coordinates: ${what} VERIFIED`;
  } else {
    out.coordinate = "UNVERIFIED";
    out.coordinate_label = "Coordinates UNVERIFIED";
    if (source.status === "VERIFIED") out.notice = "geo does not match the cited source coordinates; showing UNVERIFIED";
  }
  out.target_precision = target.precision;
  out.target_label = target.precision === "EXACT"
    ? "Target location: exact as defined"
    : target.precision === "APPROXIMATE"
      ? "Target location: APPROXIMATE (rover position during the activity, not the rock itself)"
      : "Target location: precision unknown";
  out.registration_label = evidence.ctx_registration.status === "UNRESOLVED"
    ? "CTX DEM/image registration UNRESOLVED (S-4)"
    : "CTX DEM/image registration verified";
  out.datum_label = evidence.vertical_datum.status === "UNVERIFIED" ? "Vertical datum UNVERIFIED" : "Vertical datum verified";
  const elev = source.printed.elev_m;
  if (elev == null) out.elevation_label = null;
  else {
    const who = source.kind === "pds_rover_position" ? "PDS rover" : source.kind === "pds_landing_site" ? "PDS landing-site" : "Source";
    const ref = source.convention.elevation_reference === "areoid" ? "areoid" : "reference unknown";
    out.elevation_label = `${who} elevation ${elev.toFixed(3)} m (${ref}, as printed in the source; not used for routing)`;
  }
  return out;
}

export function poiBadges(status: PoiDisplayStatus): PoiBadge[] {
  const badges: PoiBadge[] = [];
  if (status.coordinate === "VERIFIED") badges.push({ text: "PDS POSITION ✓", testId: "poi-pds-verified" });
  if (status.target_precision === "APPROXIMATE") badges.push({ text: "TARGET APPROX.", testId: "poi-target-approx" });
  if (status.coordinate === "UNVERIFIED") badges.push({ text: "UNVERIFIED", testId: "poi-unverified" });
  return badges;
}

/** Counts come from the loaded POIs. A missing evidence record stays unverified. */
export function poiCoordinateSummary(pois: readonly Poi[]): string {
  const statuses = pois.map(displayStatus);
  const verified = statuses.filter((status) => status.coordinate === "VERIFIED").length;
  if (verified === 0) return "POI coordinates UNVERIFIED";
  const approximate = statuses.filter((status) => status.target_precision === "APPROXIMATE").length;
  const targets = approximate > 0 ? "; targets APPROXIMATE" : "";
  return `POI coordinates: ${verified} PDS-verified rover/landing positions${targets}`;
}

export function evidenceIsShown(poi: Poi): poi is Poi & { evidence: PoiEvidence } {
  return poi.evidence != null && evidenceProblems(poi).length === 0;
}
