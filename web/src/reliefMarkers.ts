// Mission markers for the Regional Relief 3D scene. Every position is taken from data the 2D Mission Control map
// already uses (scenario sites, NASA rover waypoints, catalog rover positions, feature anchors, grid footprints), so
// the two views cannot disagree. Nothing here is a route, and nothing is a tube, rock or core coordinate.
import { SITE_LABEL, type LoadedBase, type SiteKey } from "./base.ts";
import type { LoadedFeatures } from "./features.ts";
import { missionPoint, MISSION_IDS, MISSIONS, type MissionId } from "./missions.ts";
import { regionalPixelToGeo, type LoadedRegional } from "./regions.ts";
import type { ScienceTarget } from "./science.ts";

export type ReliefOpen = { kind: "site"; key: SiteKey } | { kind: "mission"; id: MissionId } | { kind: "target"; id: string } | { kind: "feature"; id: string };

export interface ReliefMarker {
  id: string;
  group: "site" | MissionId | "feature";
  shape: "base" | "flag" | "pin" | "dot" | "diamond";
  label: string;
  farLabel?: string; // shown instead of `label` when the camera is far and neighbours would overlap
  lat: number;
  lon: number;
  showWithin_m: number; // the 3D object is drawn when the camera is closer than this
  labelWithin_m: number; // its own label is drawn when the camera is closer than this
  ring_m?: number; // true-size ground ring (the landing zone's radius)
  drawAs?: string; // shares the 3D object of another marker: same recorded position, never a second invented one
  title: string;
  kind: string;
  why: string;
  evidence: string;
  limits: string;
  focus_m: number; // camera distance used when this marker is focused
  open: ReliefOpen;
}

export interface ReliefBox { id: string; label: string; note: string; corners: { lat: number; lon: number }[] }

export const RELIEF_COLOURS: Record<ReliefMarker["group"], string> = { site: "#4fe0c0", M0: "#f2c14e", A: "#ff8a3d", B: "#7fb6ff", C: "#c79bff", feature: "#ff6fcf" };
export const RELIEF_FAR_M = 6000; // metres: beyond this the base, M0, A, B and Camp Delta (all within 600 m) share one label

export function reliefMarkers(input: { regional: LoadedRegional; base: LoadedBase | null; science: ScienceTarget[]; features: LoadedFeatures | null; wide?: { lat_min: number; lat_max: number; lon_min: number; lon_max: number } | null }): { markers: ReliefMarker[]; boxes: ReliefBox[] } {
  const { regional, base, science, features } = input, markers: ReliefMarker[] = [], px = regional.meta.features_px_in_science_6m;

  if (base) for (const key of Object.keys(SITE_LABEL) as SiteKey[]) {
    const s = base.scenario.sites[key];
    markers.push({
      id: `site:${key}`, group: "site", shape: key === "base" ? "base" : "flag", label: SITE_LABEL[key], farLabel: key === "base" ? "ARES Base · M0 · A · B" : undefined,
      lat: s.lat, lon: s.lon, showWithin_m: Infinity, labelWithin_m: key === "camp_a" ? RELIEF_FAR_M : Infinity, ring_m: key === "landing_zone" ? s.radius_m : undefined,
      title: SITE_LABEL[key], kind: "Hypothetical ARES-1 site (human mission infrastructure)", why: s.role,
      evidence: `${s.lat.toFixed(5)}° N, ${s.lon.toFixed(5)}° E. Chosen by a stated flatness rule on real terrain data (evaluated on: ${s.evaluation}).`,
      limits: `Hypothetical. Not evaluated or approved by NASA.${key === "camp_b" ? " Provisional: placed on the 40 m regional relief only; no route can be planned to it." : ""}${key === "landing_zone" ? " The ring is the 400 m disc that was scored, drawn at true size." : ""}`,
      focus_m: key === "landing_zone" ? 3500 : 1800, open: { kind: "site", key },
    });
  }

  for (const id of MISSION_IDS) {
    const f = missionPoint(id, regional), m = MISSIONS[id];
    if (!f) continue;
    markers.push({
      id: `mission:${id}`, group: id, shape: "pin", label: m.shortTitle, lat: f.lat, lon: f.lon, showWithin_m: Infinity, labelWithin_m: id === "C" ? Infinity : RELIEF_FAR_M,
      title: m.title, kind: "Science investigation area", why: `${m.summary} ${m.objective}`,
      evidence: m.at ? "Marker = rover position during the Shuyak sampling activity (PDS Initial Report): a reference for the area, not a sample, tube or rock point." : "Marker = approximate rover waypoint (NASA rover localization): a regional reference, not a sample, tube or rock point.",
      limits: `${m.readiness[m.readiness.length - 1].label}.${m.noRoute ? ` ${m.noRoute.route}` : ""}`,
      focus_m: id === "C" ? 2500 : id === "B" ? 900 : 1500, open: { kind: "mission", id },
    });
  }

  for (const t of science) markers.push({
    id: t.id, group: t.mission, shape: "dot", label: t.name, lat: t.lat, lon: t.lon, drawAs: t.marker,
    showWithin_m: t.kind === "sample" ? 2500 : 5000, labelWithin_m: t.kind === "sample" ? 600 : 3000,
    title: t.name, kind: t.what, why: t.why, evidence: `${t.lat.toFixed(5)}° N, ${t.lon.toFixed(5)}° E. ${t.position}`, limits: t.limits,
    focus_m: t.kind === "sample" ? 320 : 900, open: { kind: "target", id: t.id },
  });

  for (const ft of features?.features ?? []) {
    const measured = Object.values(ft.measurements).some((x) => x != null);
    markers.push({
      id: `feature:${ft.feature_id}`, group: "feature", shape: "diamond", label: ft.feature_id, lat: ft.anchor.lat, lon: ft.anchor.lon, showWithin_m: Infinity, labelWithin_m: 14000,
      title: `${ft.feature_id} ${ft.name}`, kind: `Terrain feature: ${measured ? "measured, geology review pending" : "literature only, not measured"}`, why: ft.observation,
      evidence: `Marker = rover waypoint sol ${ft.anchor.sol} (RMC ${ft.anchor.rmc}), not the feature centre. Evidence level: ${ft.evidence_level}; ${ft.qa_status}.`,
      limits: "An evidence record: not a mission, not a hazard rating and not a routing input.",
      focus_m: 1500, open: { kind: "feature", id: ft.feature_id },
    });
  }

  const boxes: ReliefBox[] = [];
  for (const [id, label, note] of [["roi_a", "ROI-A route grid", "CTX 20 m engineering grid: routes can be computed inside this box only."], ["m0a_analysis", "M0–A route grid", "HiRISE 2 m prototype grid: routes can be computed inside this box only."]] as const) {
    const b = px[id];
    if (!b?.nw || !b.se) continue;
    const g = (x: number, y: number) => regionalPixelToGeo(regional, x, y);
    boxes.push({ id, label, note, corners: [g(b.nw.x_px, b.nw.y_px), g(b.se.x_px, b.nw.y_px), g(b.se.x_px, b.se.y_px), g(b.nw.x_px, b.se.y_px)] });
  }
  const w = input.wide; // the wider HiRISE grid that reaches Amalik (bounds from its own terrain.json)
  if (w) boxes.push({ id: "m0ab_analysis", label: "M0–A–B route grid", note: "HiRISE 2 m wider prototype grid (approved for prototype analysis, 15 Nov 2026): routes can be computed inside this box only.",
    corners: [{ lat: w.lat_max, lon: w.lon_min }, { lat: w.lat_max, lon: w.lon_max }, { lat: w.lat_min, lon: w.lon_max }, { lat: w.lat_min, lon: w.lon_min }] });
  return { markers, boxes };
}
