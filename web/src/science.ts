// Science objectives for the Mission Control map, built only from the frozen ARES-1 catalog (NASA/PDS records).
// Every position is a ROVER position from those records. No tube, rock or core coordinate is derived or invented.
import type { AtlasCatalog } from "./ares1.ts";
import { AMALIK, B_OUTSIDE_M0A_M, MAGEIK_EXTRA, SHUYAK } from "./missionB.ts";
import type { MissionId } from "./missions.ts";

export interface ScienceTarget {
  id: string;
  mission: MissionId;
  kind: "sample" | "outcrop" | "rock" | "core";
  name: string;
  what: string; // identity in one line
  why: string; // why an astronaut would go there
  facts: string[];
  lat: number;
  lon: number;
  position: string; // what the coordinate is, and its source
  limits: string;
  /** Shares the map marker of another target (same recorded rover position); it is listed and inspected, not drawn twice. */
  marker?: string;
}

type Pos = { lat_deg: number; lon_deg_east: number; semantics?: string; source?: string; locator?: string };
const loose = <T,>(x: unknown) => x as T;
const tidy = (s: string) => s.replace(/_/g, " ");

/** Why a sample class matters to a crew. General sample-science rationale by class, stated as ARES-1 scenario notes. */
function classWhy(teamClass: string): string {
  if (teamClass.includes("witness")) return "A witness tube records contamination carried by the rover itself. It is the control that makes the other samples' organic results interpretable.";
  if (teamClass.includes("atmos")) return "A sealed sample of Martian atmosphere, the only gas sample in the depot.";
  if (teamClass.includes("regolith")) return "Loose surface material: grain sizes and dust chemistry, relevant to both geology and surface operations.";
  if (teamClass.includes("igneous")) return "Igneous rock can be dated in laboratories on Earth, which would anchor the age of Jezero's crater floor.";
  if (teamClass.includes("sediment")) return "Water-laid sediment records the lake and delta environment and is the kind of rock that can preserve organic matter.";
  return "Recorded depot sample.";
}

export function scienceTargets(cat: AtlasCatalog): ScienceTarget[] {
  const out: ScienceTarget[] = [];
  const sample = (id: string) => cat.samples.find((s) => s.id === id);
  const where = (loc: string) => (loc.toLowerCase().includes("depot") ? "in the Three Forks depot" : "on the rover");

  for (const drop of cat.depot_drop_events) {
    const s = sample(drop.sample), d = loose<{ rover_position: Pos; tube_azimuth_deg?: number; drop_zone_id?: string }>(drop);
    if (!s) continue;
    const origin = loose<{ origin?: { nasa_feature_name?: string } }>(s).origin?.nasa_feature_name;
    out.push({
      id: drop.id, mission: "M0", kind: "sample", name: s.sample_name,
      what: `Depot sample ${s.sample_designation}${s.nasa_public_sample_number ? ` (NASA sample ${s.nasa_public_sample_number})` : ""}: ${tidy(s.classification.team_class.split(" (")[0])}`,
      why: classWhy(s.classification.team_class),
      facts: [
        `Type: ${s.classification.nasa_sample_type ?? "not stated"}${s.classification.nasa_rock_type && s.classification.nasa_rock_type !== "n/a" ? `, ${s.classification.nasa_rock_type}` : ""}`,
        origin ? `Collected at: ${origin}${origin === "Amalik" ? " (the outcrop of mission B)" : ""}` : "Collection feature: not stated in the record",
        s.sealing_event ? `Sealed on sol ${s.sealing_event.sol}; dropped at the depot on sol ${drop.drop_sol}` : `Dropped at the depot on sol ${drop.drop_sol}`,
        d.drop_zone_id ? `Depot drop zone ${d.drop_zone_id}` : "Drop zone: not stated",
      ],
      lat: d.rover_position.lat_deg, lon: d.rover_position.lon_deg_east,
      position: `Marker = rover position during the tube drop (PDS Three Forks table, ${d.rover_position.locator ?? "depot row"}). The tube lies on the ground beside the rover.`,
      limits: "Tube-centre coordinates are not published in the PDS depot tables, so the tube itself is not plotted. The table's azimuth is the tube's own orientation, not a direction from the rover.",
    });
  }

  for (const o of cat.outcrops) {
    const x = loose<{ science_reason_team?: string; rock_type_team?: string; geologic_unit_team?: string; abrasion_patch?: string; spatial?: { positions?: Pos[] } }>(o);
    const p = x.spatial?.positions?.[0];
    if (!p) continue;
    out.push({
      id: o.id, mission: "A", kind: "outcrop", name: o.name,
      what: `Outcrop on the western delta front${x.rock_type_team ? `: ${tidy(x.rock_type_team)}` : ""}`,
      why: x.science_reason_team ?? "Sampled outcrop on the delta front.",
      facts: [
        x.geologic_unit_team ? `Unit (science team): ${x.geologic_unit_team}` : "Unit: not stated",
        ...o.cores.map((id) => { const c = sample(id); return c ? `Core ${c.sample_name} (${c.sample_designation}): ${where(c.current_location)}` : `Core ${id}`; }),
      ],
      lat: p.lat_deg, lon: p.lon_deg_east,
      position: `Marker = rover position during sampling (PDS Initial Report${p.locator ? `, ${p.locator}` : ""}). The outcrop's extent is not mapped.`,
      limits: "Rock type and interpretation are the science team's; the rover position is not the rock or core point. The two outcrops' sampling positions are 23.6 m apart.",
    });
  }

  for (const r of cat.rocks) {
    const p = loose<{ spatial?: { positions?: Pos[] } }>(r).spatial?.positions?.[0];
    if (!p) continue;
    const claims = cat.claims.filter((c) => /^claim:B-0[3-8]$/.test(c.id));
    out.push({
      id: r.id, mission: "C", kind: "rock", name: r.name,
      what: `Rock at Bright Angel, Neretva Vallis. It is not ${r.is_not}.`,
      why: "Fine-grained mudstone whose chemistry is consistent with organic carbon and with iron-phosphate and iron-sulfide reaction features. Whether biology played any part is an open, low-confidence hypothesis.",
      facts: [...claims.map((c) => `${c.confidence} confidence: ${c.claim}`), "No evidence of life has been established."],
      lat: p.lat_deg, lon: p.lon_deg_east,
      position: `Marker = rover position during sampling (PDS Initial Report${p.locator ? `, ${p.locator}` : ""}), not the rock's centre.`,
      limits: "No validated terrain grid exists at Bright Angel: inspection only, no routing and no detailed 3D.",
    });
    for (const id of r.cores) {
      const c = sample(id);
      if (!c) continue;
      out.push({
        id: c.id, mission: "C", kind: "core", name: c.sample_name, marker: r.id,
        what: `Rock core ${c.sample_designation}${c.nasa_public_sample_number ? ` (NASA sample ${c.nasa_public_sample_number})` : ""}, drilled from ${r.name}`,
        why: "The physical sample of the Bright Angel mudstone. Laboratories on Earth could test the organic and mineral signals that the rover's instruments cannot resolve.",
        facts: [`Where it is now: ${where(c.current_location)} (not in the Three Forks depot)`, c.sealing_event ? `Sealed on sol ${c.sealing_event.sol}` : "Sealing: not stated", `${r.name} is the rock; ${c.sample_name} is the core. They are different things.`],
        lat: p.lat_deg, lon: p.lon_deg_east,
        position: `Shares the ${r.name} marker: the rover position during sampling. The drill point is not published as a map coordinate.`,
        limits: "This core travels with the rover; it cannot be visited at Bright Angel. No routing at C.",
      });
    }
  }

  // B: the Amalik outcrop and its two cores. Mageik comes from the catalog; Shuyak from missionB.ts (same PDS volume).
  const noRoute = `Amalik is ${B_OUTSIDE_M0A_M} m west of the frozen M0–A grid; routes to it are candidate corridors on the wider M0–A–B grid (prototype). Not a surveyed astronaut waypoint.`;
  const mageik = cat.samples.find((s) => s.sample_designation === MAGEIK_EXTRA.designation);
  const mg = loose<{ sampling_event?: { designation_sol?: number; rover_position?: Pos } } | undefined>(mageik), drop = cat.depot_drop_events.find((d) => d.sample === mageik?.id);
  out.push({
    id: AMALIK.id, mission: "B", kind: "outcrop", name: AMALIK.name,
    what: `Outcrop on the western delta front, Cape Nukshak: ${AMALIK.rock}`,
    why: `Sediment from low in the delta, ${AMALIK.interpretation}. No sign of life has been found here.`,
    facts: [
      `Setting: ${AMALIK.setting}`,
      `Minerals reported: ${AMALIK.minerals}`,
      AMALIK.abrasion,
      `${AMALIK.fluorescence}.`,
      "Cores: Shuyak (on the rover) and Mageik (in the Three Forks depot, mission M0)",
      "Against A: lower in the delta sequence than Skinner Ridge and Wildcat Ridge, and an olivine-rich mudstone with little sulfate (science-team reports)",
    ],
    lat: SHUYAK.lat, lon: SHUYAK.lon,
    position: `Marker = rover position during the Shuyak sampling activity (${SHUYAK.source}). The Mageik sheet gives a position 0.3 m away. Neither is the drill hole or the rock.`,
    limits: noRoute,
  });
  out.push({
    id: SHUYAK.id, mission: "B", kind: "core", name: SHUYAK.name, marker: AMALIK.id,
    what: `Rock core ${SHUYAK.designation} (NASA sample ${SHUYAK.nasa_sample_no}), drilled from ${AMALIK.name}`,
    why: "One of the pair of cores from the fine-grained lower delta sediment. It stayed on the rover when its twin went to the depot.",
    facts: [`Cored on sol ${SHUYAK.coring_sol} (${SHUYAK.coring_date}); sealed at ${SHUYAK.sealing}`, `Core length ${SHUYAK.core_length_mm} mm`, `Where it is now: ${SHUYAK.now} (not in the Three Forks depot)`, "Not in the frozen ARES-1 catalog: this record was read from the PDS report for mission B"],
    lat: SHUYAK.lat, lon: SHUYAK.lon,
    position: `Shares the Amalik marker: the rover position during sampling (${SHUYAK.source}). The drill point is not published as a map coordinate.`,
    limits: `This core travels with the rover; it cannot be visited at Amalik. ${noRoute}`,
  });
  if (mageik) out.push({
    id: mageik.id, mission: "B", kind: "core", name: mageik.sample_name, marker: AMALIK.id,
    what: `Rock core ${mageik.sample_designation}${mageik.nasa_public_sample_number ? ` (NASA sample ${mageik.nasa_public_sample_number})` : ""}, drilled from ${AMALIK.name}`,
    why: "The twin of Shuyak, and the link between B and M0: this is the Amalik core that Perseverance left at Three Forks, so recovering the depot recovers it.",
    facts: [
      `Cored on sol ${mg?.sampling_event?.designation_sol ?? "not stated"}; ${mageik.sealing_event ? `sealed on sol ${mageik.sealing_event.sol}` : "sealing not stated"} (${MAGEIK_EXTRA.sealing_delay})`,
      drop ? `Placed at the Three Forks depot on sol ${drop.drop_sol}` : "Depot drop: not found in the catalog",
      `Core length ${MAGEIK_EXTRA.core_length_mm} mm`,
      "Where it is now: in the Three Forks depot (see M0). Coring, sealing and drop are three different sols.",
    ],
    lat: SHUYAK.lat, lon: SHUYAK.lon,
    position: `Shares the Amalik marker. Its own sheet gives ${mg?.sampling_event?.rover_position ? `${mg.sampling_event.rover_position.lat_deg.toFixed(5)}° N, ${mg.sampling_event.rover_position.lon_deg_east.toFixed(5)}° E` : "a position 0.3 m away"} (rover position, PDS Initial Report).`,
    limits: `The core is not at Amalik any more. ${noRoute}`,
  });
  return out;
}
