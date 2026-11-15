// Maps core DestinationInfo to the presentational card fields. Only source-backed values; nothing invented.
import type { DestinationInfo } from "@ares/core";
import type { DestinationFields, DestinationStatus } from "./ui/cardModel.ts";
import type { LoadedRegional } from "./regions.ts";

const R = 3396190;
const GRID_TEXT: Record<string, { name: string; dem: string; precision: string }> = {
  m0a: { name: "M0–A analysis grid (prototype)", dem: "HiRISE DTM → 2 m analysis grid", precision: "2 m cell; DTM effective resolution is several metres" },
  m0ab: { name: "wider M0–A–B analysis grid (prototype)", dem: "HiRISE DTM → 2 m analysis grid", precision: "2 m cell; DTM effective resolution is several metres" },
  roi_a: { name: "ROI-A engineering demo grid", dem: "JPL CTX DEM 20 m", precision: "20 m cell; CTX DEM effective resolution is coarser" },
};
/** Raster-mask convention (contracts VALIDITY): 0 and 3 are routable, 1 and 2 are not. */
export const VALIDITY_TEXT: Record<number, string> = {
  0: "valid DEM cell (routable)",
  1: "no source data / NoData (not routable)",
  2: "outside the analysis grid (not routable)",
  3: "valid elevation, slope undefined at a NoData edge (routable)",
};

const WAYPOINT_NAMES: Record<string, string> = {
  "waypoint:M0": "M0 Three Forks depot",
  "waypoint:A": "A Skinner Ridge / Wildcat Ridge",
  "waypoint:B": "C Bright Angel",
};

export function greatCircleM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function destinationCard(info: DestinationInfo, regional: LoadedRegional | null): { status: DestinationStatus; fields: DestinationFields } {
  const sample = info.samples.find((s) => s.grid_id === "m0a") ?? info.samples[0];
  if (info.samples.length > 0 && info.samples.every((s) => s.elevation_m === null)) return { status: "nodata", fields: {} };
  let context: string | null = sample ? `Inside the ${GRID_TEXT[sample.grid_id]?.name ?? sample.grid_id}` : null;
  if (regional) {
    const near = Object.entries(regional.meta.features_px_in_science_6m)
      .filter(([id, f]) => id in WAYPOINT_NAMES && f.lat !== undefined && f.lon !== undefined)
      .map(([id, f]) => ({ id, d: greatCircleM(info, { lat: f.lat!, lon: f.lon! }) }))
      .sort((x, y) => x.d - y.d)[0];
    if (near && near.d <= 2000) {
      const text = `${Math.round(near.d)} m from the ${WAYPOINT_NAMES[near.id]} catalog waypoint (approximate rover waypoint, not a sample or tube point)`;
      context = context ? `${context}; ${text}` : text;
    }
  }
  const grid = sample ? GRID_TEXT[sample.grid_id] : null;
  return {
    status: "ready",
    fields: {
      coordinate: `${info.lat.toFixed(6)}° lat, ${info.lon.toFixed(6)}° E lon (planetocentric, east-positive; ${info.source === "typed" ? "typed" : "map click"})`,
      areaName: context,
      elevationM: sample?.elevation_m != null ? Math.round(sample.elevation_m * 100) / 100 : null,
      elevationSource: sample && grid ? `${grid.dem}, dataset ${sample.dataset_version}; vertical datum UNVERIFIED` : null,
      coverage: info.samples.length
        ? info.samples.map((s) => `${GRID_TEXT[s.grid_id]?.name ?? s.grid_id}: cell (${s.cell.row}, ${s.cell.col}), ${VALIDITY_TEXT[s.validity] ?? `unknown mask code ${s.validity}`}`).join("; ")
        : `Outside every analysis grid; regional CTX 6 m imagery only${regional ? ` (${regional.meta.version})` : ""}`,
      precision: grid ? `${grid.precision}. The point is used as given; no snapping is shown.` : "6 m basemap pixel; no terrain data here.",
      slope: sample?.slope_deg != null ? `${sample.slope_deg.toFixed(1)}° (Horn 3×3 on the ${grid?.dem ?? "DEM"})` : null,
      routingAvailable: info.routable_in !== null,
      routingReason: info.routable_in
        ? `Routing available in ${GRID_TEXT[info.routable_in]?.name ?? info.routable_in}${info.routable_in === "m0a" || info.routable_in === "m0ab" ? " as a candidate route corridor" : ""}.`
        : info.not_routable_reason,
    },
  };
}
