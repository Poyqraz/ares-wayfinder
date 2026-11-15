import { M0A_SLOPE_SIGMA_DEG, planGated, type SlopeGate } from "./traverse.ts";
import { loadAres1Catalog } from "./ares1.ts";
import { scienceTargets, type ScienceTarget } from "./science.ts";
import type { Cell, Poi, ProjPoint, RouteParams, RouteResult, SceneId, SourceRecord, TerrainMeta } from "@ares/contracts";
import { geoToProj, inspectDestination, parseMarsCoordinate, projToCell, type AnalysisGridRef, type CostComparison, type DestinationInfo, type TerrainGrid } from "@ares/core";
import { create } from "zustand";
import type { DatasetFailure, OverviewSidecar } from "./integrity.ts";
import { fetchBytes, loadRoiA } from "./load.ts";
import { demoEndpoints, planPair, ROUTE_PARAMS, scenarioText, type Planned, type RouteId } from "./plan.ts";
import { planConservative } from "./conservative.ts";
import type { EnvLayer } from "./environment.ts";
import { loadBase, SITE_LABEL, type LoadedBase, type SiteKey } from "./base.ts";
import { loadFeatures, type LoadedFeatures } from "./features.ts";
import { isExplore, missionPoint, MISSIONS, type MissionId } from "./missions.ts";
import { loadM0A, loadRegional, M0AB_NOTES, M0AB_SCENARIO, M0A_NOTES, M0A_SCENARIO, type LoadedM0A, type LoadedRegional, type RegionId } from "./regions.ts";

export const SCENES: SceneId[] = [
  "ORBITAL",
  "MISSION_CONTROL",
  "PLANNING",
  "FLYOVER",
  "EVA_HUD",
  "PROVENANCE",
];

export interface LayerToggles {
  ortho: boolean;
  hillshade: boolean;
  elevation: boolean;
  slope: boolean;
  steep: boolean;
  validity: boolean;
}

interface RoiSnapshot { meta: TerrainMeta; grid: TerrainGrid; pois: Poi[]; sources: SourceRecord[]; orthoUrl: string; hillshadeUrl: string }

export type ClickMode = "start" | "goal";

interface AppState {
  scene: SceneId;
  selectedPoiId: string | null;
  start: Cell | null;
  goal: Cell | null;
  routes: Record<RouteId, RouteResult | null>;
  comparison: CostComparison | null;
  fault: string | null;
  selectedRouteId: RouteId;
  playhead: number;
  layers: LayerToggles;
  ve: number;
  citationCardId: string | null;
  scenarioLabel: string;
  status: "idle" | "loading" | "ready" | "error";
  error: DatasetFailure | null;
  outsideMessage: string | null;
  clickMode: ClickMode;
  planEpoch: number;
  viewResetToken: number;
  meta: TerrainMeta | null;
  grid: TerrainGrid | null;
  pois: Poi[];
  sources: SourceRecord[];
  orthoUrl: string;
  hillshadeUrl: string;
  overviewUrl: string;
  overview: OverviewSidecar | null;
  load: (force?: boolean) => Promise<void>;
  step: (dir: 1 | -1) => void;
  setScene: (scene: SceneId) => void;
  setVe: (ve: number) => void;
  toggleLayer: (layer: keyof LayerToggles) => void;
  selectPoi: (id: string) => void;
  setClickMode: (mode: ClickMode) => void;
  setPlayhead: (value: number) => void;
  selectRoute: (id: RouteId) => void;
  setCitation: (id: string) => void;
  pickProjected: (point: ProjPoint) => void;
  usePoi: (mode: ClickMode, id: string) => void;
  resetDemo: () => void;
  region: RegionId;
  roiA: RoiSnapshot | null;
  m0a: LoadedM0A | null;
  /** The wider HiRISE grid that also holds Amalik. Mission B plans on it; M0 and A keep the frozen grid. */
  m0ab: LoadedM0A | null;
  m0abReason: string | null;
  m0aState: { status: "idle" | "loading" | "ready" | "error"; reason: string | null };
  regional: LoadedRegional | null;
  regionalState: { status: "idle" | "loading" | "ready" | "error"; reason: string | null };
  destination: DestinationInfo | null;
  destinationError: string | null;
  features: LoadedFeatures | null;
  featuresReason: string | null;
  /** Shared ARES-1 mission selection: Mission Control, Planning and 3D read the same value. null = legacy ROI-A demo. */
  mission: MissionId | null;
  atlasOpen: boolean;
  /** Display-only regional relief 3D (CR-006); reset when leaving the 3D scene. */
  relief3d: boolean;
  setRelief3d: (on: boolean) => void;
  /** Mars Cinematic View (visual treatment) or Scientific View (plain) in the EVA and 3D Terrain scenes. Never affects data. */
  cinematic: boolean | null; // null until the first 3D scene has seen its WebGL context: then cinematic with a GPU, plain without
  setCinematic: (on: boolean) => void;
  setAtlasOpen: (open: boolean) => void;
  inspect: { kind: "mission"; id: MissionId } | { kind: "feature"; id: string } | { kind: "destination" } | { kind: "site"; key: SiteKey } | { kind: "target"; id: string } | null;
  /** Science objectives from the ARES-1 catalog (recorded rover positions); empty until the catalog has passed its hash checks. */
  science: ScienceTarget[];
  inspectTarget: (id: string) => void;
  /** Hypothetical landing zone, base and camps (scenario reference, hash-checked). */
  base: LoadedBase | null;
  routeMarkerId: string | null;
  /** Environmental context layer on show (reference cards and a key; never an area on the map). */
  envLayer: EnvLayer | null;
  setEnvLayer: (layer: EnvLayer | null) => void;
  /** Experimental terrain-slope gate (null = reference planner) and its one-cell clearance. */
  slopeGate: SlopeGate;
  clearance: boolean;
  setSlopeGate: (gate: SlopeGate) => void;
  setClearance: (on: boolean) => void;
  /** The ungated routes, kept for comparison while a gate is on; null in reference mode. */
  referenceRoutes: { distance: RouteResult | null; terrain: RouteResult | null } | null;
  /** Grid and parameters the current routes were planned with (the gated slope raster when a gate is on). */
  planGrid: TerrainGrid | null;
  planParams: RouteParams;
  evaAutoplay: boolean; // set by "Start EVA walk" in 3D Terrain; the HUD starts walking once and clears it
  inspectSite: (key: SiteKey) => void;
  planFromBase: (target: "M0" | "A") => void;
  planAtLandingZone: () => void;
  selectRouteMarker: (id: string | null) => void;
  mapFocus: { lat: number; lon: number; radius_m: number; token: number } | null;
  selectMission: (id: MissionId | null, focus?: boolean) => void;
  inspectFeature: (id: string) => void;
  closeInspector: () => void;
  routeFromDestination: () => void;
  loadExtras: () => Promise<void>;
  setRegion: (region: RegionId) => void;
  selectDestinationText: (text: string) => void;
  selectDestinationGeo: (lat: number, lon: number) => void;
  clearDestination: () => void;
  routeToDestination: () => void;
}

const DEFAULT_LAYERS: LayerToggles = { ortho: true, hillshade: false, elevation: false, slope: false, steep: false, validity: false };

let inflight: Promise<void> | null = null;

function revoke(url: string) {
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}

/** M0-A routes carry the M0-A limitations instead of the engine's generic CTX 20 m notes. */
function regionNotes(planned: Planned, region: RegionId, wide = false): Planned {
  if (region !== "m0a") return planned;
  const fix = (r: RouteResult) => ({ ...r, uncertainty_notes: wide ? M0AB_NOTES : M0A_NOTES });
  return { ...planned, routes: { distance: fix(planned.routes.distance), terrain: fix(planned.routes.terrain) } };
}

/** The Conservative Terrain route: always planned on the original grid with its own rules, whatever the experimental gate is set to. */
function conservativeFor(grid: TerrainGrid, start: Cell, goal: Cell, like: RouteResult, region: RegionId): RouteResult {
  const r = planConservative(grid, start, goal, ROUTE_PARAMS, region === "m0a" ? M0A_SLOPE_SIGMA_DEG : 0, like);
  return region === "m0a" ? { ...r, uncertainty_notes: like.uncertainty_notes } : r; // `like` already carries the notes of the grid in use
}

/** Mission B without its grid (the bundle failed its checks): B falls back to inspection, with the reason. */
export const bGridMissing = (s: Pick<AppState, "mission" | "m0ab" | "m0aState">): boolean => s.mission === "B" && !s.m0ab && (s.m0aState.status === "ready" || s.m0aState.status === "error");

/** The HiRISE 2 m dataset in effect: the wider grid for mission B, the frozen M0-A grid otherwise. */
const hirise = (s: Pick<AppState, "mission" | "m0a" | "m0ab">): LoadedM0A | null => (s.mission === "B" ? s.m0ab : s.m0a);

function regionScenario(s: AppState, start: Cell, goal: Cell): string {
  if (s.region !== "m0a") return scenarioText(s.meta!, s.pois, start, goal);
  const same = (a: Cell, b: Cell | undefined) => !!b && a.row === b.row && a.col === b.col;
  const h = hirise(s);
  if (same(start, h?.start) && same(goal, h?.goal)) return h?.area === "m0ab" ? M0AB_SCENARIO : M0A_SCENARIO;
  if (h?.area === "m0ab") return "Custom endpoints in the wider M0–A–B grid — candidate route corridor, not a surveyed path";
  const site = s.base && s.meta ? projToCell(s.meta, geoToProj(s.meta, { lat: s.base.scenario.sites.base.lat, lon: s.base.scenario.sites.base.lon })) : null;
  if (site && same(start, site)) return `ARES Base (hypothetical) → ${same(goal, s.m0a?.start) ? "M0 depot rover position" : same(goal, s.m0a?.goal) ? "Skinner Ridge rover position" : "selected point"} — candidate route corridor (prototype)`;
  return "Custom endpoints in M0–A — candidate route corridor, not a surveyed path";
}

function analysisGrids(s: AppState): AnalysisGridRef[] {
  const out: AnalysisGridRef[] = [];
  if (s.roiA) out.push({ id: "roi_a", role: "engineering_demo", routable: true, grid: s.roiA.grid as AnalysisGridRef["grid"] });
  if (s.m0a) out.push({ id: "m0a", role: "prototype_analysis", routable: s.m0aState.status === "ready", grid: s.m0a.grid as AnalysisGridRef["grid"] });
  if (s.m0ab) out.push({ id: "m0ab", role: "prototype_analysis", routable: true, grid: s.m0ab.grid as AnalysisGridRef["grid"] } as AnalysisGridRef); // after m0a: a point in both reports the frozen grid first
  return out;
}

function applyPlan(set: (partial: Partial<AppState>) => void, get: () => AppState, start: Cell, goal: Cell) {
  const { grid, meta } = get();
  if (!grid || !meta) return;
  const { slopeGate, clearance } = get();
  const wide = get().region === "m0a" && hirise(get())?.area === "m0ab";
  const reference = regionNotes(planPair(grid, start, goal), get().region, wide);
  const gated = slopeGate === null ? null : planGated(grid, start, goal, slopeGate, clearance);
  const planned = gated ? regionNotes(gated, get().region, wide) : reference;
  const conservative = conservativeFor(grid, start, goal, reference.routes.terrain, get().region);
  set({
    start,
    goal,
    referenceRoutes: gated ? reference.routes : null,
    planGrid: gated ? gated.grid : grid,
    planParams: gated ? gated.params : ROUTE_PARAMS,
    routes: { ...planned.routes, conservative },
    ...(get().selectedRouteId === "conservative" && conservative.status !== "OK" ? { selectedRouteId: "terrain" as const } : {}), // a route that does not exist cannot stay selected; Planning says why
    comparison: planned.comparison,
    fault: planned.fault,
    scenarioLabel: regionScenario(get(), start, goal),
    playhead: 0,
    outsideMessage: planned.fault,
    planEpoch: get().planEpoch + 1,
    routeMarkerId: null,
  });
  return planned;
}

export const useApp = create<AppState>((set, get) => ({
  scene: "MISSION_CONTROL",
  selectedPoiId: null,
  start: null,
  goal: null,
  routes: { distance: null, terrain: null, conservative: null },
  comparison: null,
  fault: null,
  selectedRouteId: "terrain",
  playhead: 0,
  layers: DEFAULT_LAYERS,
  ve: 1,
  citationCardId: null,
  scenarioLabel: "",
  status: "idle",
  error: null,
  outsideMessage: null,
  clickMode: "start",
  planEpoch: 0,
  viewResetToken: 0,
  meta: null,
  grid: null,
  pois: [],
  sources: [],
  orthoUrl: "",
  hillshadeUrl: "",
  overviewUrl: "",
  overview: null,
  region: "roi_a",
  roiA: null,
  m0a: null,
  m0ab: null,
  m0abReason: null,
  m0aState: { status: "idle", reason: null },
  regional: null,
  regionalState: { status: "idle", reason: null },
  destination: null,
  destinationError: null,
  features: null,
  featuresReason: null,
  mission: null,
  base: null,
  routeMarkerId: null,
  evaAutoplay: false,
  science: [],
  inspectTarget: (id) => {
    const t = get().science.find((x) => x.id === id);
    if (!t) return;
    set({ inspect: { kind: "target", id }, mission: t.mission, mapFocus: { lat: t.lat, lon: t.lon, radius_m: t.mission === "C" ? 450 : t.mission === "M0" ? 170 : 200, token: (get().mapFocus?.token ?? 0) + 1 } });
  },
  slopeGate: null,
  clearance: false,
  referenceRoutes: null,
  planGrid: null,
  planParams: ROUTE_PARAMS,
  setSlopeGate: (gate) => { set({ slopeGate: gate, clearance: gate === null ? false : get().clearance }); const { start, goal } = get(); if (start && goal) applyPlan(set, get, start, goal); },
  setClearance: (on) => { set({ clearance: on }); const { start, goal } = get(); if (start && goal) applyPlan(set, get, start, goal); },
  atlasOpen: false,
  relief3d: false,
  setRelief3d: (on) => set({ relief3d: on }),
  cinematic: null,
  setCinematic: (on) => set({ cinematic: on }),
  setAtlasOpen: (open) => set({ atlasOpen: open }),
  inspect: null,
  mapFocus: null,

  load: (force = false) => {
    if (force) inflight = null;
    if (inflight) return inflight;
    set({ status: "loading", error: null });
    inflight = (async () => {
      let result;
      try {
        result = await loadRoiA();
      } catch (err) {
        inflight = null;
        set({
          status: "error",
          error: { kind: "DATASET INTEGRITY", detail: err instanceof Error ? err.message : "The bundle could not be read" },
          routes: { distance: null, terrain: null, conservative: null },
          comparison: null,
          grid: null,
        });
        return;
      }
      if (!result.ok) {
        inflight = null;
        set({
          status: "error",
          error: result.failure,
          routes: { distance: null, terrain: null, conservative: null },
          comparison: null,
          grid: null,
        });
        return;
      }
      const ends = demoEndpoints(result.value.meta, result.value.pois);
      if (!ends.ok) {
        inflight = null;
        set({ status: "error", error: ends.failure, grid: null });
        return;
      }
      const prev = get();
      if (prev.region === "roi_a") revoke(prev.orthoUrl);
      if (prev.region === "roi_a") revoke(prev.hillshadeUrl);
      revoke(prev.overviewUrl);
      const planned = planPair(result.value.grid, ends.value.start, ends.value.goal);
      set({
        status: "ready",
        error: null,
        region: "roi_a",
        roiA: { meta: result.value.meta, grid: result.value.grid, pois: result.value.pois, sources: result.value.sources,
          orthoUrl: result.value.orthoUrl, hillshadeUrl: result.value.hillshadeUrl },
        meta: result.value.meta,
        grid: result.value.grid,
        pois: result.value.pois,
        sources: result.value.sources,
        orthoUrl: result.value.orthoUrl,
        hillshadeUrl: result.value.hillshadeUrl,
        overviewUrl: result.value.overviewUrl,
        overview: result.value.overview,
        start: ends.value.start,
        goal: ends.value.goal,
        routes: { ...planned.routes, conservative: conservativeFor(result.value.grid, ends.value.start, ends.value.goal, planned.routes.terrain, "roi_a") },
        comparison: planned.comparison,
        fault: planned.fault,
        scenarioLabel: scenarioText(result.value.meta, result.value.pois, ends.value.start, ends.value.goal),
        selectedPoiId: "rochette",
        playhead: 0,
        outsideMessage: planned.fault,
        planEpoch: 1,
      });
    })();
    return inflight;
  },

  step: (dir) => {
    const index = SCENES.indexOf(get().scene);
    const next = (index + dir + SCENES.length) % SCENES.length;
    const scene = SCENES[next] ?? "MISSION_CONTROL";
    set({ scene, atlasOpen: scene === "MISSION_CONTROL" ? get().atlasOpen : false, relief3d: scene === "FLYOVER" ? get().relief3d : false });
  },

  setScene: (scene) => set({ scene, atlasOpen: scene === "MISSION_CONTROL" ? get().atlasOpen : false, relief3d: scene === "FLYOVER" ? get().relief3d : false }), // leaving Mission Control closes the Atlas view

  setVe: (ve) => set({ ve }),

  toggleLayer: (layer) => set({ layers: { ...get().layers, [layer]: !get().layers[layer] } }),

  selectPoi: (id) => set({ selectedPoiId: id }),

  setClickMode: (mode) => set({ clickMode: mode }),

  setPlayhead: (value) => set({ playhead: Math.min(1, Math.max(0, value)) }),

  selectRoute: (id) => set({ selectedRouteId: id, playhead: 0 }),

  setCitation: (id) => set({ citationCardId: id }),

  pickProjected: (point) => {
    const { meta, clickMode } = get();
    if (!meta) return;
    const cell = projToCell(meta, point);
    if (!cell) {
      set({ outsideMessage: "Outside the ROI grid. That point was not used as an endpoint." });
      return;
    }
    applyPlan(set, get, clickMode === "start" ? cell : get().start ?? cell, clickMode === "goal" ? cell : get().goal ?? cell);
  },

  usePoi: (mode, id) => {
    const { meta, pois } = get();
    const poi = pois.find((item) => item.id === id);
    if (!meta || !poi) return;
    const cell = projToCell(meta, geoToProj(meta, poi.geo));
    if (!cell) {
      set({ outsideMessage: `${poi.name} is outside the ROI grid and was not used as an endpoint.` });
      return;
    }
    set({ selectedPoiId: id });
    applyPlan(set, get, mode === "start" ? cell : get().start ?? cell, mode === "goal" ? cell : get().goal ?? cell);
  },

  resetDemo: () => {
    const { meta, pois, grid, region } = get(), m0a = hirise(get());
    if (!meta || !grid) return;
    set({ slopeGate: null, clearance: false }); // the demo route is the ungated reference
    if (region === "m0a" && m0a) {
      applyPlan(set, get, m0a.start, m0a.goal);
      set({ selectedPoiId: "m0_bearwallow", clickMode: "start", selectedRouteId: "terrain", viewResetToken: get().viewResetToken + 1 });
      return;
    }
    const ends = demoEndpoints(meta, pois);
    if (!ends.ok) {
      set({ status: "error", error: ends.failure });
      return;
    }
    applyPlan(set, get, ends.value.start, ends.value.goal);
    set({
      selectedPoiId: "rochette",
      clickMode: "start",
      selectedRouteId: "terrain",
      viewResetToken: get().viewResetToken + 1,
    });
  },

  loadExtras: async () => {
    if (get().m0aState.status === "loading" || get().regionalState.status === "loading") return;
    set({ m0aState: { status: "loading", reason: null }, regionalState: { status: "loading", reason: null } });
    const failed = (err: unknown) => ({ ok: false as const, failure: { kind: "DATASET INTEGRITY" as const, detail: err instanceof Error ? err.message : String(err) } });
    // the science catalog loads on its own: the terrain grids must not wait for it
    void loadAres1Catalog(async (url) => { const r = await fetchBytes(url); return r.ok ? r.value : null; }).then((atlas) => { if (atlas.ok) set({ science: scienceTargets(atlas.catalog) }); }).catch(() => undefined);
    const [m0a, regional, features, base, m0ab] = await Promise.all([loadM0A(fetchBytes).catch(failed), loadRegional(fetchBytes).catch(failed), loadFeatures(fetchBytes).catch(failed), loadBase(fetchBytes).catch(failed), loadM0A(fetchBytes, "m0ab").catch(failed)]);
    for (const loaded of [m0a, m0ab]) if (loaded.ok && base.ok) {
      // Scenario sites inside the M0-A grid appear on its map as selectable endpoints (hypothetical, not sourced positions).
      for (const key of ["base", "camp_a"] as const) {
        const site = base.value.scenario.sites[key];
        loaded.value.pois.push({ id: key, name: `${SITE_LABEL[key]} (hypothetical scenario site)`, geo: { lat: site.lat, lon: site.lon },
          claim: `${site.role}. Computed by a stated flatness rule on the HiRISE 2 m grid; not NASA-evaluated.`, source: `ARES-1 base scenario ${base.value.version}`, confidence: "low" });
      }
    }
    set({
      m0a: m0a.ok ? m0a.value : null,
      m0ab: m0ab.ok ? m0ab.value : null,
      m0abReason: m0ab.ok ? null : `Wider M0–A–B grid disabled: ${m0ab.failure.kind}: ${m0ab.failure.detail}`,
      m0aState: m0a.ok ? { status: "ready", reason: null } : { status: "error", reason: `M0–A disabled: ${m0a.failure.kind}: ${m0a.failure.detail}` },
      regional: regional.ok ? regional.value : null,
      regionalState: regional.ok ? { status: "ready", reason: null } : { status: "error", reason: `Regional map unavailable: ${regional.failure.kind}: ${regional.failure.detail}` },
      base: base.ok ? base.value : null,
      features: features.ok ? features.value : null,
      featuresReason: features.ok ? null : `Terrain-feature layer unavailable: ${features.failure.kind}: ${features.failure.detail}`,
    });
  },

  setRegion: (region) => {
    const s = get();
    if (isExplore(s.mission)) set({ mission: null });
    const data = region === "m0a" ? hirise(get()) : s.roiA;
    if (region === s.region && (!data || data.meta === s.meta)) return; // same region and the same dataset: nothing to do
    if (!data) {
      set({ outsideMessage: region !== "m0a" ? "ROI-A is not loaded." : get().mission === "B" ? (s.m0abReason ?? "The wider M0–A–B grid is not loaded.") : (s.m0aState.reason ?? "M0–A analysis region is not loaded.") });
      return;
    }
    set({ region, meta: data.meta, grid: data.grid, pois: data.pois, sources: data.sources, orthoUrl: data.orthoUrl, hillshadeUrl: data.hillshadeUrl,
      clickMode: "start", selectedRouteId: "terrain", viewResetToken: s.viewResetToken + 1,
      selectedPoiId: region === "m0a" ? "m0_bearwallow" : "rochette" });
    if (region === "m0a") {
      const h = data as LoadedM0A;
      applyPlan(set, get, h.start, h.goal);
      return;
    }
    const ends = demoEndpoints(data.meta, data.pois);
    if (ends.ok) applyPlan(set, get, ends.value.start, ends.value.goal);
  },

  selectDestinationText: (text) => {
    const parsed = parseMarsCoordinate(text);
    if (!parsed.ok) {
      set({ destinationError: parsed.error });
      return;
    }
    set({ destinationError: null, destination: inspectDestination("typed", parsed.lat, parsed.lon, analysisGrids(get())), inspect: { kind: "destination" } });
  },

  selectDestinationGeo: (lat, lon) => set({ destinationError: null, destination: inspectDestination("click", lat, lon, analysisGrids(get())), inspect: { kind: "destination" } }),

  clearDestination: () => set({ destination: null, destinationError: null, inspect: get().inspect?.kind === "destination" ? null : get().inspect }),

  routeToDestination: () => {
    const d = get().destination;
    if (!d?.routable_in) return;
    // a point only the wider grid holds belongs to mission B; a point both hold is planned on the grid already in use
    if (d.routable_in === "m0ab") set({ mission: "B" });
    const gridId = d.routable_in === "roi_a" ? "roi_a" : get().mission === "B" ? "m0ab" : "m0a";
    const sample = d.samples.find((item) => item.grid_id === gridId);
    if (!sample) return;
    get().setRegion(gridId === "roi_a" ? "roi_a" : "m0a");
    const start = get().start;
    if (!start) return;
    applyPlan(set, get, start, sample.cell);
    set({ scene: "PLANNING", clickMode: "goal" });
  },

  selectMission: (id, focus = true) => {
    const s = get();
    if (id === null) {
      set({ mission: null, inspect: s.inspect?.kind === "mission" ? null : s.inspect });
      return;
    }
    const wp = missionPoint(id, s.regional);
    set({
      mission: id,
      inspect: { kind: "mission", id },
      mapFocus: focus && wp ? { lat: wp.lat, lon: wp.lon, radius_m: id === "C" ? 1500 : id === "B" ? 800 : 900, token: (s.mapFocus?.token ?? 0) + 1 } : s.mapFocus,
    });
    if (MISSIONS[id].planning === "m0a" && s.m0aState.status === "ready") get().setRegion("m0a"); // also swaps the dataset when moving between B and M0 or A
    if (!isExplore(id) && get().mission !== id) set({ mission: id });
  },

  inspectFeature: (id) => {
    const ft = get().features?.features.find((f) => f.feature_id === id);
    set({ inspect: { kind: "feature", id }, mapFocus: ft ? { lat: ft.anchor.lat, lon: ft.anchor.lon, radius_m: 600, token: (get().mapFocus?.token ?? 0) + 1 } : get().mapFocus });
  },

  closeInspector: () => set({ inspect: null }),

  routeFromDestination: () => {
    const d = get().destination;
    if (!d?.routable_in) return;
    // a point only the wider grid holds belongs to mission B; a point both hold is planned on the grid already in use
    if (d.routable_in === "m0ab") set({ mission: "B" });
    const gridId = d.routable_in === "roi_a" ? "roi_a" : get().mission === "B" ? "m0ab" : "m0a";
    const sample = d.samples.find((item) => item.grid_id === gridId);
    if (!sample) return;
    get().setRegion(gridId === "roi_a" ? "roi_a" : "m0a");
    const goal = get().goal;
    if (!goal) return;
    applyPlan(set, get, sample.cell, goal);
    set({ scene: "PLANNING", clickMode: "start" });
  },

  inspectSite: (key) => {
    const site = get().base?.scenario.sites[key];
    set({ inspect: { kind: "site", key }, mapFocus: site ? { lat: site.lat, lon: site.lon, radius_m: key === "camp_b" ? 1500 : key === "landing_zone" ? 1600 : 700, token: (get().mapFocus?.token ?? 0) + 1 } : get().mapFocus });
  },

  planFromBase: (target) => {
    const s = get();
    if (!s.base || !s.m0a) return;
    set({ mission: target }); // before the region: M0 and A plan on the frozen grid
    get().setRegion("m0a");
    const meta = s.m0a.meta, site = s.base.scenario.sites.base;
    const start = projToCell(meta, geoToProj(meta, { lat: site.lat, lon: site.lon }));
    if (!start) return;
    applyPlan(set, get, start, target === "M0" ? s.m0a.start : s.m0a.goal);
    set({ scene: "PLANNING", selectedPoiId: "base" });
  },

  planAtLandingZone: () => {
    const s = get();
    if (!s.base || !s.roiA) return;
    set({ mission: null });
    get().setRegion("roi_a");
    const meta = s.roiA.meta, lz = s.base.scenario.sites.landing_zone;
    const start = projToCell(meta, geoToProj(meta, { lat: lz.lat, lon: lz.lon }));
    const goal = get().start;
    if (!start || !goal) return;
    applyPlan(set, get, start, goal);
    set({ scene: "PLANNING" });
  },

  selectRouteMarker: (id) => set({ routeMarkerId: id }),
  envLayer: null,
  setEnvLayer: (layer) => set({ envLayer: layer }),
}));

useApp.subscribe((s, prev) => {
  if (s.mission === prev.mission || s.region !== "m0a") return;
  const want = hirise(s);
  if (want && want.meta !== s.meta) s.setRegion("m0a");
});
