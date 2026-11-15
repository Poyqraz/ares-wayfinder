// Layer registry: one definition per layer and region, used by the 2D map, the 3D drape and the legend.
// Unavailable layers are never faked (docs/decisions/MAP-LAYERS-AND-UI-CONTRACT.md §3).
import type { TerrainMeta } from "@ares/contracts";
import type { RegionId } from "./regions.ts";
import type { LayerToggles } from "./store.ts";

export type LayerId = keyof LayerToggles;
export type LayerRole = "REAL OBSERVED" | "DERIVED FROM REAL DEM" | "MODELLED / CONDITIONAL";

export interface LayerDef {
  id: LayerId;
  role: LayerRole;
  title: string;
  units: string;
  legend: string;
  source: string;
  resolution: string;
  processing: string;
  limitation: string;
}

/** Steepness mask threshold in degrees: atan(0.45), the routing g_max, shown as an analytical mask only. */
export const STEEP_DEG = 24.2;

export const LAYER_ORDER: LayerId[] = ["ortho", "hillshade", "elevation", "slope", "steep", "validity"];

export function layerDefs(region: RegionId, meta: TerrainMeta): Record<LayerId, LayerDef> {
  const m0a = region === "m0a";
  const dem = m0a ? `USGS HiRISE DTM soc_006 → 2 m analysis grid (${meta.dataset_version})` : `JPL CTX DEM 20 m (${meta.dataset_version})`;
  const res = `${meta.dx_proj} m posting (${meta.dx_ground_m.toFixed(3)} m E-W × ${meta.dy_ground_m} m N-S on the ground)`;
  const datum = "Vertical datum UNVERIFIED.";
  return {
    ortho: {
      id: "ortho", role: "REAL OBSERVED",
      title: m0a ? "HiRISE ortho" : "CTX ortho",
      units: "image DN (stretched)", legend: "greyscale image",
      source: m0a ? "USGS HiRISE orthomosaic soc_007 (25 cm), MRO/HiRISE" : "JPL CTX orthomosaic 5 m, MRO/CTX",
      resolution: m0a ? "1 m display texture" : "5 m display texture",
      processing: m0a ? "warped from orthographic to the DTM grid with GDAL average; 2–98 % stretch" : "resampled to the DEM window; stretch for display",
      limitation: m0a ? "Display only. Image–DEM match ≤ 1.7 m (G4), not an independent registration." : "Display only. CTX DEM/image registration UNRESOLVED (S-4).",
    },
    hillshade: {
      id: "hillshade", role: "DERIVED FROM REAL DEM", title: "Hillshade", units: "unitless", legend: "light from 315°, 45° altitude",
      source: dem, resolution: res, processing: "Lambert shading of the DEM", limitation: "Display only; not illumination at any real time.",
    },
    elevation: {
      id: "elevation", role: "DERIVED FROM REAL DEM", title: "Elevation", units: "m",
      legend: `${meta.h_min.toFixed(1)} m (blue) → ${meta.h_max.toFixed(1)} m (orange)`,
      source: dem, resolution: res, processing: "linear colour ramp over this grid's min–max", limitation: datum,
    },
    slope: {
      id: "slope", role: "DERIVED FROM REAL DEM", title: "Slope", units: "degrees", legend: "0° (dim) → 30° and above (bright)",
      source: dem, resolution: res, processing: "Horn 3×3 on ground spacing (cos latitude applied once)", limitation: "Not a hazard map. Features below the DEM's effective resolution are not visible.",
    },
    steep: {
      id: "steep", role: "DERIVED FROM REAL DEM", title: `Steepness > ${STEEP_DEG}°`, units: "mask", legend: `red = Horn slope > ${STEEP_DEG}°`,
      source: dem, resolution: res, processing: `cells whose slope exceeds atan(0.45) = ${STEEP_DEG}°`,
      limitation: "Experimental analytical mask, NOT a certified hazard. Routing uses the edge-grade cutoff, which is separate.",
    },
    validity: {
      id: "validity", role: "DERIVED FROM REAL DEM", title: "Coverage / NoData", units: "classes", legend: "magenta = no source data, gold = slope undefined, clear = valid",
      source: dem, resolution: res, processing: "from the bundle's validity.u8.bin", limitation: "NoData is never filled; NoData cells are never routed.",
    },
  };
}
