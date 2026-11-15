// Machine-readable mirror of contracts/CONTRACT.md. Change only via approved CR.
export const CONTRACT_VERSION = "1.0.0";

export const VALIDITY = {
  VALID: 0,
  NODATA_SOURCE: 1,
  OUTSIDE_ROI: 2,
  VALID_SLOPE_UNDEFINED: 3,
} as const;
export type Validity = (typeof VALIDITY)[keyof typeof VALIDITY];

export interface Cell { row: number; col: number }
export interface ProjPoint { E: number; N: number }
export interface GeoPoint { lat: number; lon: number }
export interface ScenePoint { x: number; y: number; z: number }

/** Projection parameters, read from the source header by the pipeline. */
export interface Projection {
  radius_m: number;
  lat_ts_deg: number;
  central_meridian_deg: number;
}

export interface TerrainMeta extends Projection {
  contract_version: string;
  dataset_version: string;
  roi_id: string;
  source_ids: string[];
  nx: number;
  ny: number;
  dx_proj: number;
  dy_proj: number;
  dx_ground_m: number;
  dy_ground_m: number;
  x0: number;
  y0: number;
  bounds_geo: { lat_min: number; lat_max: number; lon_min: number; lon_max: number };
  elevation_unit: "m";
  vertical_reference: string; // "UNVERIFIED" until sign-off S-5
  nodata_policy: string;
  h_min: number;
  h_max: number;
  slope_method: "horn3x3";
  semantic_resolution: { dem_posting_m: number; image_gsd_m: number; note: string };
}

export interface SourceRecord {
  id: string;
  url: string;
  agency: string;
  mission: string;
  instrument: string;
  product_version: string;
  citation: string;
  crs: string;
  native_pixel_m: number | null;
  vertical_reference: string;
  license: string;
  confidence: "high" | "medium" | "low";
  limitations: string[];
}

export interface Poi {
  id: string;
  name: string;
  geo: GeoPoint;
  claim: string;
  source: string; // URL or DOI
  /** Legacy summary only. Never use it to derive a verification status (CR-004). */
  confidence: "high" | "medium" | "low";
  /** CR-004 (optional, additive). Absent = legacy POI: render every status as unverified/unknown. */
  evidence?: PoiEvidence;
}

/** CR-004 POI evidence record, schema "ares-poi-evidence/1". Statuses come only from here. */
export interface PoiEvidence {
  schema: "ares-poi-evidence/1";
  coordinate_source: {
    status: "VERIFIED" | "UNVERIFIED";
    kind: "pds_rover_position" | "pds_landing_site" | "publication" | "other";
    product: string;
    locator: string;
    url: string;
    /** Exactly as printed in the source; elev_m is the source's own elevation, never a routing height. */
    printed: { lat: number; lon: number; elev_m: number | null };
    convention: {
      latitude: "planetocentric";
      longitude: "east_positive";
      lon_domain: "-180..180";
      elevation_reference: "areoid" | "unknown";
    };
    cross_checks: { source: string; url?: string; delta_m: number }[];
  };
  target_location: { precision: "EXACT" | "APPROXIMATE" | "UNKNOWN"; basis: string };
  ctx_registration: { status: "VERIFIED" | "UNRESOLVED"; ref: string; note?: string };
  vertical_datum: { status: "VERIFIED" | "UNVERIFIED" };
  role: {
    kind: "historical_landing_reference" | "sampling_site" | "other";
    validated_habitat: false;
    text: string;
  };
  science?: {
    geology?: string;
    samples?: { name: string; number: number; sol_cored?: number; sol_sealed?: number; note?: string }[];
    events?: string;
    references?: string[];
  };
}

export type Endpoint =
  | ({ frame: "ROI_GRID" } & Cell)
  | ({ frame: "PROJ" } & ProjPoint);

export type RouteMode = "distance" | "terrain";
export type CostCurve = "minetti" | "tobler";

export interface RouteParams {
  cost_curve: CostCurve;
  g_max: number;
  cell_slope_gate_deg: number | null;
  connectivity: 8;
}

export interface RouteRequest {
  start: Endpoint;
  goal: Endpoint;
  mode: RouteMode;
  params: RouteParams;
  dataset_version: string;
}

export type RouteStatus =
  | "OK"
  | "NO_ROUTE"
  | "INVALID_ENDPOINT_NODATA"
  | "ENDPOINT_OUTSIDE_ROI"
  | "ENDPOINT_BLOCKED_BY_POLICY"
  | "DATASET_VERSION_MISMATCH";

export interface ProfileSample { s_m: number; h_m: number; grade: number }

export interface RouteResult {
  status: RouteStatus;
  cells: Cell[];
  vertices_proj: ProjPoint[];
  length_horizontal_m: number;
  length_surface_m: number;
  ascent_m: number;
  descent_m: number;
  max_edge_grade: number;
  cost_flat_equiv_m: number;
  profile: ProfileSample[];
  constraint_notes: string[];
  uncertainty_notes: string[];
  baseline: { delta_length_m: number; delta_ascent_m: number } | null;
  algorithm_version: string;
  dataset_version: string;
  contract_version: string;
}

export type SceneId =
  | "ORBITAL"
  | "MISSION_CONTROL"
  | "PLANNING"
  | "FLYOVER"
  | "EVA_HUD"
  | "PROVENANCE";
