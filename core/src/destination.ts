// Destination selection pipeline (docs/decisions/MAP-LAYERS-AND-UI-CONTRACT.md §4). Pure: no I/O.
// Typed coordinates and map clicks both end in inspectDestination(); React never converts coordinates.
import { VALIDITY } from "@ares/contracts";
import { geoToProj, projToCell } from "./coords.ts";
import type { TerrainGrid } from "./route.ts";

export interface GeoInputOk { ok: true; lat: number; lon: number }
export interface GeoInputError { ok: false; error: string }

/** Parse "lat, lon" in decimal degrees: planetocentric latitude, east-positive longitude.
 *  Accepts optional N/S/E/W suffixes; W/S negate. Rejects anything ambiguous instead of guessing. */
export function parseMarsCoordinate(text: string): GeoInputOk | GeoInputError {
  const parts = text.trim().replace(/\s+([NSEW])\b/gi, "$1").split(/[,;\s]+/).filter(Boolean); // "4.5 S" -> "4.5S"
  if (parts.length !== 2) return { ok: false, error: "Enter two decimal numbers: latitude, longitude (e.g. 18.4589, 77.4062)." };
  const read = (s: string, axis: "lat" | "lon") => {
    const m = /^([+-]?\d+(?:\.\d+)?)°?([NSEW])?$/i.exec(s);
    if (!m) return null;
    const hemi = m[2]?.toUpperCase();
    if (hemi && (axis === "lat" ? !"NS".includes(hemi) : !"EW".includes(hemi))) return null;
    if (hemi && /^[+-]/.test(m[1])) return null; // "-18N" is ambiguous
    const v = Number(m[1]);
    return hemi === "S" || hemi === "W" ? -v : v;
  };
  const lat = read(parts[0], "lat"), lon = read(parts[1], "lon");
  if (lat === null || lon === null) return { ok: false, error: "Use decimal degrees, latitude first, e.g. 18.4589 N, 77.4062 E." };
  if (lat < -90 || lat > 90) return { ok: false, error: "Latitude must be between -90 and 90 degrees." };
  if (lon < -180 || lon > 360) return { ok: false, error: "Longitude must be between -180 and 360 degrees (east-positive)." };
  return { ok: true, lat, lon: lon > 180 ? lon - 360 : lon };
}

export interface AnalysisGridRef {
  id: string; // e.g. "roi_a", "m0a"
  role: "engineering_demo" | "prototype_analysis";
  routable: boolean; // the release decides; a prototype grid stays false until accepted
  grid: TerrainGrid & { meta: TerrainGrid["meta"] & { radius_m: number; lat_ts_deg: number; central_meridian_deg: number; source_ids: string[] } };
}

export interface GridSample {
  grid_id: string;
  role: AnalysisGridRef["role"];
  cell: { row: number; col: number };
  validity: number;
  elevation_m: number | null;
  slope_deg: number | null;
  source_ids: string[];
  dataset_version: string;
}

export interface DestinationInfo {
  source: "typed" | "click";
  lat: number;
  lon: number;
  frame: "planetocentric latitude, east-positive longitude (Mars, sphere R 3396190 m)";
  samples: GridSample[]; // every analysis grid that contains the point
  routable_in: string | null; // grid id the point can be routed in, or null
  not_routable_reason: string | null;
}

/** Sample every analysis grid at a geographic point and decide whether it can be routed. */
export function inspectDestination(source: DestinationInfo["source"], lat: number, lon: number, grids: AnalysisGridRef[]): DestinationInfo {
  const samples: GridSample[] = [];
  for (const g of grids) {
    const m = g.grid.meta;
    const cell = projToCell(m, geoToProj(m, { lat, lon }));
    if (!cell) continue;
    const k = cell.row * m.nx + cell.col;
    const v = g.grid.validity[k];
    const h = g.grid.dem[k], s = g.grid.slope[k];
    samples.push({
      grid_id: g.id, role: g.role, cell, validity: v,
      elevation_m: v === VALIDITY.NODATA_SOURCE || !Number.isFinite(h) ? null : h,
      slope_deg: Number.isFinite(s) ? s : null,
      source_ids: m.source_ids, dataset_version: m.dataset_version,
    });
  }
  const routable = samples.find((s) => grids.find((g) => g.id === s.grid_id)!.routable && (s.validity === VALIDITY.VALID || s.validity === VALIDITY.VALID_SLOPE_UNDEFINED));
  let reason: string | null = null;
  if (!routable) {
    reason = samples.length === 0 ? "Outside every analysis grid: the point can be inspected on the basemap but not routed."
      : samples.every((s) => s.validity === VALIDITY.NODATA_SOURCE) ? "No terrain data at this point (NoData is never filled)."
      : "Inside a grid that is not accepted for routing in this release.";
  }
  return { source, lat, lon, frame: "planetocentric latitude, east-positive longitude (Mars, sphere R 3396190 m)",
    samples, routable_in: routable?.grid_id ?? null, not_routable_reason: reason };
}
