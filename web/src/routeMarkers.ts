// Route-information markers: a few meaningful points on an actually computed route, described only with values
// measured on the DEM along that route (elevation, step grade, terrain slope, cross-slope, turns) and with recorded
// positions that lie beside it. They give navigation and science context. They are not hazard or safety warnings,
// and nothing here invents rocks, radiation or obstacles.
import type { Poi, RouteResult, TerrainMeta } from "@ares/contracts";
import { geoToProj, type TerrainGrid } from "@ares/core";
import { routeTerrain } from "./traverse.ts";
import { groundDistance } from "./walk.ts";

export interface RouteMarker {
  id: string;
  kind: "start" | "steepest" | "climb" | "high" | "low" | "goal" | "ground" | "cross" | "turn" | "science" | "detour";
  title: string;
  index: number; // index into route.cells / vertices_proj
  s_m: number;
  lines: string[];
}

export interface MarkerContext {
  meta?: TerrainMeta; // needed to place recorded positions (pois) on the grid
  pois?: Poi[];
  slopeSigmaDeg?: number | null; // disagreement between independent stereo models on steep ground, where known
  compare?: RouteResult | null; // the terrain-aware route, when this is the conservative one: where and why the two part ways
}

export const MAX_ROUTE_MARKERS = 8;
const deg = (g: number) => (Math.atan(Math.abs(g)) * 180) / Math.PI;

export function routeMarkers(route: RouteResult | null, grid: TerrainGrid, resolutionNote: string, ctx: MarkerContext = {}): RouteMarker[] {
  if (!route || route.status !== "OK" || route.profile.length < 3) return [];
  const p = route.profile, n = p.length, nx = grid.meta.nx, v = route.vertices_proj, total = route.length_horizontal_m;
  const steps = routeTerrain(grid, route); // steps[i - 1] is the step that ends at vertex i
  const cross = (i: number) => steps[Math.max(0, i - 1)]?.cross_slope_deg ?? NaN;
  const slopeAt = (i: number) => grid.slope[route.cells[i].row * nx + route.cells[i].col];
  let up = 0;
  const ascentTo = p.map((q, i) => (i === 0 ? 0 : (up += Math.max(0, q.h_m - p[i - 1].h_m))));
  const base = (i: number) => [
    `${p[i].s_m.toFixed(0)} m along the route; DEM elevation ${p[i].h_m.toFixed(1)} m (datum unverified)`,
    `${Number.isFinite(slopeAt(i)) ? `${slopeAt(i).toFixed(1)}° terrain slope (Horn 3×3)` : "terrain slope undefined"}${Number.isFinite(cross(i)) ? `, ${cross(i).toFixed(1)}° of it across the path` : ""}; ${ascentTo[i].toFixed(1)} m climbed so far`,
  ];
  let steep = 1, hi = 0, lo = 0;
  for (let i = 1; i < n; i++) {
    if (Math.abs(p[i].grade) > Math.abs(p[steep].grade)) steep = i;
    if (p[i].h_m > p[hi].h_m) hi = i;
    if (p[i].h_m < p[lo].h_m) lo = i;
  }
  // longest uninterrupted climb (consecutive steps with positive grade)
  let best = { a: 0, b: 0, gain: 0 }, a = 0;
  for (let i = 1; i <= n; i++) {
    if (i === n || p[i].grade <= 0) {
      const gain = p[i - 1].h_m - p[a].h_m;
      if (gain > best.gain) best = { a, b: i - 1, gain };
      a = i;
    }
  }
  // recorded positions (rover positions, scenario sites) on or beside the route
  const near = (ctx.meta && ctx.pois ? ctx.pois : []).map((poi) => {
    const q = geoToProj(ctx.meta!, poi.geo);
    let index = 0, d = Infinity;
    for (let i = 0; i < n; i++) { const di = groundDistance(grid, v[i], q); if (di < d) { d = di; index = i; } }
    return { poi, index, d };
  });
  const at = (i: number) => near.filter((x) => x.index === i && x.d <= 3).map((x) => `At a recorded position: ${x.poi.name}`);

  const out: RouteMarker[] = [
    { id: "start", kind: "start", title: "Start", index: 0, s_m: 0, lines: [...base(0), ...at(0), `Route length ${total.toFixed(1)} m; total climb ${route.ascent_m.toFixed(1)} m, descent ${route.descent_m.toFixed(1)} m`] },
    { id: "goal", kind: "goal", title: "Destination", index: n - 1, s_m: p[n - 1].s_m, lines: [...base(n - 1), ...at(n - 1), `Relative model cost ${route.cost_flat_equiv_m.toFixed(1)} flat-equivalent m (not energy or time)`] },
    { id: "steepest", kind: "steepest", title: "Steepest step", index: steep, s_m: p[steep].s_m,
      lines: [...base(steep), `Step grade ${(p[steep].grade * 100).toFixed(0)} % (${deg(p[steep].grade).toFixed(1)}°), the steepest on this route; the planner excludes steps above 24.2° (algorithm threshold, not a safety limit)`] },
  ];
  const gap = Math.max(6, total * 0.05); // metres: a further marker must be at least this far from every marker already placed
  const add = (m: RouteMarker) => { if (out.length < MAX_ROUTE_MARKERS && m.index > 0 && m.index < n - 1 && out.every((x) => Math.abs(x.s_m - m.s_m) >= gap)) out.push(m); };

  // conservative route: the point where it is farthest from the terrain-aware route, and what each of them is standing on there
  if (ctx.compare?.status === "OK") {
    const other = ctx.compare, onx = grid.meta.nx;
    let far = 0, farD = 0, farJ = 0;
    for (let i = 1; i < n - 1; i++) {
      let d = Infinity, j = 0;
      for (let q = 0; q < other.vertices_proj.length; q++) { const dq = groundDistance(grid, v[i], other.vertices_proj[q]); if (dq < d) { d = dq; j = q; } }
      if (d > farD) { farD = d; far = i; farJ = j; }
    }
    if (farD >= 6) {
      // the stretch around that point where the two routes are apart, and the steepest ground each has on it
      const key = (c: { row: number; col: number }) => c.row * onx + c.col, at = new Map(other.cells.map((c, j) => [key(c), j]));
      let i0 = far, i1 = far;
      while (i0 > 0 && !at.has(key(route.cells[i0]))) i0 -= 1;
      while (i1 < n - 1 && !at.has(key(route.cells[i1]))) i1 += 1;
      const steepest = (cells: { row: number; col: number }[], from: number, to: number) => { let m = 0; for (let q = from; q <= to; q++) { const d = grid.slope[key(cells[q])]; if (d > m) m = d; } return m; };
      const mine = steepest(route.cells, i0, i1), theirs = steepest(other.cells, at.get(key(route.cells[i0])) ?? 0, at.get(key(route.cells[i1])) ?? other.cells.length - 1);
      out.push({ id: "detour", kind: "detour", title: "Largest detour", index: far, s_m: p[far].s_m, lines: [...base(far),
        `Widest separation from the terrain-aware route: ${farD.toFixed(0)} m (the two are apart from ${p[i0].s_m.toFixed(0)} to ${p[i1].s_m.toFixed(0)} m)`,
        `Steepest ground on this stretch ${mine.toFixed(1)}°, against ${theirs.toFixed(1)}° on the terrain-aware route${mine > theirs ? ". Not gentler at its worst cell: the strategy lowers accumulated slope, not the single steepest cell" : ""}`] });
    }
    const startLines = out[0].lines;
    startLines.splice(startLines.length - 1, 0, farD < 0.5 ? "Conservative terrain: the same path as the terrain-aware route here, because the ground between these points is already gentle" : `Conservative terrain: ${total - other.length_horizontal_m < 0.5 ? "the same length as" : `${(total - other.length_horizontal_m).toFixed(0)} m longer than`} the terrain-aware route, chosen to stay on gentler ground. A preference, not a safety rating`);
  }
  // steepest ground and largest cross-slope under the path: measured, not limited by the reference planner
  let ground = 1, side = 1;
  for (let i = 1; i < n; i++) {
    if (slopeAt(i) > (Number.isFinite(slopeAt(ground)) ? slopeAt(ground) : -1)) ground = i;
    if (cross(i) > (Number.isFinite(cross(side)) ? cross(side) : -1)) side = i;
  }
  if (slopeAt(ground) >= 10) add({ id: "ground", kind: "ground", title: "Steepest ground", index: ground, s_m: p[ground].s_m, lines: [...base(ground),
    `The steepest ground under this route: ${slopeAt(ground).toFixed(1)}°. The grade along the path here is ${deg(p[ground].grade).toFixed(1)}°`,
    ctx.slopeSigmaDeg ? `Uncertain: independent stereo models of this ground differ by about ${ctx.slopeSigmaDeg}° where it is steep` : "Uncertain: no independent DEM is available to check this slope"] });
  if (cross(side) >= 8) add({ id: "cross", kind: "cross", title: "Largest cross-slope", index: side, s_m: p[side].s_m, lines: [...base(side),
    `Slope across the walking direction ${cross(side).toFixed(1)}°, the largest on this route; along the path it is ${deg(p[side].grade).toFixed(1)}°. The reference planner does not limit cross-slope`] });
  if (best.gain >= 2) {
    const mid = Math.round((best.a + best.b) / 2);
    add({ id: "climb", kind: "climb", title: "Longest climb", index: mid, s_m: p[mid].s_m,
      lines: [...base(mid), `Continuous climb of ${best.gain.toFixed(1)} m over ${(p[best.b].s_m - p[best.a].s_m).toFixed(0)} m (mean ${deg(best.gain / Math.max(1, p[best.b].s_m - p[best.a].s_m)).toFixed(1)}°)`] });
  }
  for (const x of near.filter((q) => q.d <= 15).sort((q, r) => q.d - r.d)) add({ id: `science-${x.poi.id}`, kind: "science", title: x.poi.name, index: x.index, s_m: p[x.index].s_m, lines: [...base(x.index),
    `${x.poi.name}: ${x.d.toFixed(0)} m from the route at this point`, `A recorded position, not a rock, core or tube point. Source: ${x.poi.source}`] });
  // sharpest change of direction, measured over about 10 m before and after
  const w = Math.max(3, Math.round(10 / Math.max(grid.meta.dx_ground_m, grid.meta.dy_ground_m)));
  const bearing = (i: number, j: number) => Math.atan2(((v[j].E - v[i].E) * grid.meta.dx_ground_m) / grid.meta.dx_proj, ((v[j].N - v[i].N) * grid.meta.dy_ground_m) / grid.meta.dy_proj);
  let turn = 0, turnDeg = 0;
  for (let i = w; i < n - w; i++) {
    const d = bearing(i, i + w) - bearing(i - w, i), t = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) * (180 / Math.PI);
    if (t > turnDeg) { turnDeg = t; turn = i; }
  }
  if (turnDeg >= 40) add({ id: "turn", kind: "turn", title: "Sharpest turn", index: turn, s_m: p[turn].s_m, lines: [...base(turn), `The route changes direction by about ${turnDeg.toFixed(0)}° here. Turns cost nothing in the planner's model`] });
  if (hi !== steep) add({ id: "high", kind: "high", title: "Highest point", index: hi, s_m: p[hi].s_m, lines: base(hi) });
  if (lo !== steep) add({ id: "low", kind: "low", title: "Lowest point", index: lo, s_m: p[lo].s_m, lines: base(lo) });

  const tail = `${resolutionNote} Context for navigation and science, not a hazard or safety rating. Not modelled: rocks below DEM resolution, radiation, dust, weather, illumination.`;
  return out.sort((x, y) => x.index - y.index || Number(x.kind === "goal") - Number(y.kind === "goal")).map((m) => ({ ...m, lines: [...m.lines, tail] }));
}
