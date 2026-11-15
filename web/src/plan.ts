import type { Cell, Poi, RouteParams, RouteRequest, RouteResult, TerrainMeta } from "@ares/contracts";
import { compareToBaseline, geoToProj, planRoute, projToCell, type CostComparison, type TerrainGrid } from "@ares/core";
import { fail, type Checked } from "./integrity.ts";

export const ROUTE_PARAMS: RouteParams = {
  cost_curve: "minetti",
  g_max: 0.45,
  cell_slope_gate_deg: null,
  connectivity: 8,
};

export type RouteId = "distance" | "terrain" | "conservative";
export const ROUTE_IDS: RouteId[] = ["distance", "terrain", "conservative"];
/** subtle cyan, muted warm orange, soft green: readable on grey Mars terrain and apart from each other */
export const ROUTE_HEX: Record<RouteId, string> = { distance: "#6cc3d8", terrain: "#e0894a", conservative: "#9fd67a" };

export const DEMO_SCENARIO = "Rochette/Montdenier → Landing — provisional engineering demo route";

export interface Planned {
  routes: { distance: RouteResult; terrain: RouteResult };
  comparison: CostComparison | null;
  fault: string | null;
}

export function demoEndpoints(meta: TerrainMeta, pois: Poi[]): Checked<{ start: Cell; goal: Cell }> {
  const cellFor = (id: string): Cell | null => {
    const poi = pois.find((item) => item.id === id);
    if (!poi) return null;
    return projToCell(meta, geoToProj(meta, poi.geo));
  };
  const start = cellFor("rochette");
  const goal = cellFor("landing");
  if (!start || !goal) {
    return fail("DATASET INTEGRITY", "Rochette/Montdenier or Landing falls outside the ROI grid");
  }
  return { ok: true, value: { start, goal } };
}

export function scenarioText(meta: TerrainMeta, pois: Poi[], start: Cell, goal: Cell): string {
  const ends = demoEndpoints(meta, pois);
  if (!ends.ok) return "Custom endpoints — provisional engineering route, not a waypoint approval";
  const same = (a: Cell, b: Cell) => a.row === b.row && a.col === b.col;
  if (same(start, ends.value.start) && same(goal, ends.value.goal)) return DEMO_SCENARIO;
  return "Custom endpoints — provisional engineering route, not a waypoint approval";
}

export function planPair(grid: TerrainGrid, start: Cell, goal: Cell, params: RouteParams = ROUTE_PARAMS): Planned {
  const request = (mode: RouteRequest["mode"]): RouteRequest => ({
    start: { frame: "ROI_GRID", row: start.row, col: start.col },
    goal: { frame: "ROI_GRID", row: goal.row, col: goal.col },
    mode,
    params,
    dataset_version: grid.meta.dataset_version,
  });
  const distance = planRoute(grid, request("distance"));
  const terrain = planRoute(grid, request("terrain"));
  if (distance.status !== "OK" || terrain.status !== "OK") {
    return { routes: { distance, terrain }, comparison: null, fault: null };
  }
  try {
    return {
      routes: { distance, terrain },
      comparison: compareToBaseline(grid, terrain, distance, params),
      fault: null,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Route comparison failed";
    return { routes: { distance, terrain }, comparison: null, fault: detail };
  }
}
