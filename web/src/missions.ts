// ARES-1 mission scenario definitions (presentation text). Facts point at the frozen ARES-1 catalog 572fba1ce61f,
// the M0-A prototype bundle f8de9017164a, the terrain-feature layer and, for B, missionB.ts; nothing here is a new measurement.
// S14: B is now Amalik / Enchanted Lake. The former B (Bright Angel) is C; the frozen catalog and basemap still record it
// under their own ids "B" and "waypoint:B", which are kept as they are.
import { B_OUTSIDE_M0A_M, SHUYAK } from "./missionB.ts";
import type { LoadedRegional } from "./regions.ts";

export type MissionId = "M0" | "A" | "B" | "C";

export interface MissionDef {
  id: MissionId;
  title: string;
  shortTitle: string;
  waypoint: string; // regional feature id (approximate rover waypoint); empty where the mission has its own position
  at?: { lat: number; lon: number }; // the mission's own reference position, where the basemap has no waypoint for it
  summary: string;
  objective: string;
  records: string[];
  readiness: { label: string; state: "ready" | "prototype" | "exploration" | "pending" }[];
  planning: "m0a" | "explore";
  noRoute?: { route: string; terrain: string }; // why no route and no detailed 3D exist (explore missions)
  features: string[];
}

export const ARES1_INTRO = "ARES-1 is a hypothetical crewed surface expedition to Jezero crater, planned on real NASA/PDS records of Perseverance's exploration. Not a NASA plan.";

export const MISSIONS: Record<MissionId, MissionDef> = {
  M0: {
    id: "M0", title: "M0 Three Forks sample recovery", shortTitle: "M0 Three Forks", waypoint: "waypoint:M0",
    summary: "Recover the ten sample tubes Perseverance placed at the Three Forks depot in 2022–2023.",
    objective: "Locate and retrieve the depot tubes; their rover drop positions are known, their tube centres are not.",
    records: ["10 depot tube records (PDS Three Forks tables, Initial Reports)", "Rover drop positions, not tube centres", "Sampling and sealing chronology per tube", "One of the ten, Mageik, was drilled at Amalik (mission B)"],
    readiness: [
      { label: "Tube records: 10 of 10, source-backed", state: "ready" },
      { label: "Tube centres: not available in PDS", state: "pending" },
      { label: "Terrain: M0–A prototype corridor (HiRISE 2 m)", state: "prototype" },
    ],
    planning: "m0a", features: [],
  },
  A: {
    id: "A", title: "A Western Delta science objectives", shortTitle: "A Western Delta", waypoint: "waypoint:A",
    summary: "Investigate the western delta front at two outcrops sampled by Perseverance.",
    objective: "Skinner Ridge (Swift Run, Skyland) and Wildcat Ridge (Hazeltop, Bearwallow) as separate outcrops, reached from the depot.",
    records: ["Skinner Ridge: Swift Run (on rover), Skyland (in depot)", "Wildcat Ridge: Hazeltop (on rover), Bearwallow (in depot)", "Sampling positions 23.6 m apart (rover positions)"],
    readiness: [
      { label: "Outcrop and core records: source-backed", state: "ready" },
      { label: "Route: M0 → A candidate corridor between rover positions (prototype)", state: "prototype" },
      { label: "F01 delta fan front: automated check, geology review pending", state: "pending" },
    ],
    planning: "m0a", features: ["F01"],
  },
  B: {
    id: "B", title: "B Amalik / Enchanted Lake science objectives", shortTitle: "B Amalik", waypoint: "", at: { lat: SHUYAK.lat, lon: SHUYAK.lon },
    summary: "Investigate Amalik, the outcrop near the base of the western delta where Perseverance drilled the Shuyak and Mageik cores in 2022. Reached from the depot on a wider terrain grid.",
    objective: "Study the lower, fine-grained delta sediments: layering, mineralogy, alteration by water and their potential to preserve ancient biosignatures, and compare them with the two outcrops of A. Mageik now lies in the depot recovered by M0.",
    records: ["Amalik outcrop, Enchanted Lake member, Cape Nukshak (PDS Initial Reports vol. 2)", "Shuyak: cored and sealed on sol 575, on the rover", "Mageik: cored on sol 579, sealed on sol 619, placed at Three Forks on sol 655", "Novarupta abrasion patch (not a sample)", "No evidence of life has been established"],
    readiness: [
      { label: "Science records: source-backed", state: "ready" },
      { label: "Route: M0 → B candidate corridor between rover positions (prototype)", state: "prototype" },
      { label: `Terrain: wider M0–A–B grid (HiRISE 2 m, prototype); owner-approved for prototype analysis. Amalik is ${B_OUTSIDE_M0A_M} m outside the frozen M0–A grid`, state: "prototype" },
    ],
    planning: "m0a", features: [],
  },
  C: {
    id: "C", title: "C Bright Angel science objectives", shortTitle: "C Bright Angel", waypoint: "waypoint:B",
    summary: "Study Bright Angel at Neretva Vallis, where Perseverance cored Sapphire Canyon from the Cheyava Falls rock. The more distant investigation, about 6 km from the depot.",
    objective: "Inspect the region, the Cheyava Falls rock and the Sapphire Canyon core record; nine source-backed claims, possible biosignature unresolved.",
    records: ["Bright Angel region; Cheyava Falls rock (not a sample)", "Sapphire Canyon core (on the rover, not in the depot)", "Nine claims; no evidence of life has been established", "Recorded as mission B in the frozen catalog 572fba1ce61f; renamed C in the ARES-1 plan"],
    readiness: [
      { label: "Science records: source-backed", state: "ready" },
      { label: "Regional imagery: CTX 6 m exploration", state: "exploration" },
      { label: "Routing and detailed 3D: disabled, no validated terrain grid at C", state: "pending" },
    ],
    planning: "explore", features: ["F03"],
    noRoute: {
      route: "Route planning at C is disabled: no analysis terrain grid has passed validation there (the HiRISE CR_SOUTH stereo pair has uncompensated y-parallax; no grid was built at Bright Angel). Inspection only.",
      terrain: "Detailed 3D terrain for C is disabled until a suitable DEM passes scientific validation. Use the regional map to explore Bright Angel.",
    },
  },
};

export const MISSION_IDS = Object.keys(MISSIONS) as MissionId[];

/** C (and any mission without a terrain grid): science records and imagery only, no route and no detailed 3D. */
export const isExplore = (id: MissionId | null | undefined): id is "C" => id != null && MISSIONS[id].planning === "explore";

/** Where a mission's marker goes: its own reference position, or the basemap's approximate rover waypoint. */
export function missionPoint(id: MissionId, regional: LoadedRegional | null): { lat: number; lon: number } | null {
  const m = MISSIONS[id], f = regional?.meta.features_px_in_science_6m[m.waypoint];
  return m.at ?? (f?.lat !== undefined && f.lon !== undefined ? { lat: f.lat, lon: f.lon } : null);
}
