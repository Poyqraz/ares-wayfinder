// One marker list for Planning, 3D Terrain and the EVA HUD: always built from the currently selected, valid route.
import { useMemo } from "react";
import { routeMarkers, type RouteMarker } from "./routeMarkers.ts";
import { useApp } from "./store.ts";
import { M0A_SLOPE_SIGMA_DEG } from "./traverse.ts";

export function useRouteMarkers(): RouteMarker[] {
  const grid = useApp((s) => s.grid);
  const meta = useApp((s) => s.meta);
  const pois = useApp((s) => s.pois);
  const region = useApp((s) => s.region);
  const route = useApp((s) => s.routes[s.selectedRouteId]);
  const compare = useApp((s) => (s.selectedRouteId === "conservative" ? s.routes.terrain : null));
  return useMemo(() => (grid && meta ? routeMarkers(route, grid, region === "m0a" ? "HiRISE 2 m cells; effective resolution several metres." : "CTX 20 m cells; effective resolution coarser.",
    { meta, pois, slopeSigmaDeg: region === "m0a" ? M0A_SLOPE_SIGMA_DEG : null, compare }) : []), [grid, meta, pois, region, route, compare]);
}
