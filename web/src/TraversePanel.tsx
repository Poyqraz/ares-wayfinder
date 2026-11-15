// Planning: the terrain measured under the selected route, and the experimental terrain-slope gate.
// Measured values come from the DEM. The gate is an experimental planning restriction, not a safety limit, and the
// panel never says a route is fit for walking.
import { useMemo } from "react";
import { useApp } from "./store.ts";
import { M0A_SLOPE_SIGMA_DEG, routeTerrain, SLOPE_GATES_DEG, summarizeTerrain } from "./traverse.ts";

const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "n/a");

export function TraversePanel() {
  const grid = useApp((s) => s.grid);
  const region = useApp((s) => s.region);
  const id = useApp((s) => s.selectedRouteId);
  const route = useApp((s) => s.routes[s.selectedRouteId]);
  const reference = useApp((s) => (s.selectedRouteId === "conservative" ? null : s.referenceRoutes?.[s.selectedRouteId] ?? null)); // the conservative route is not gated, so it has no ungated twin
  const gate = useApp((s) => s.slopeGate);
  const clearance = useApp((s) => s.clearance);
  const setGate = useApp((s) => s.setSlopeGate);
  const setClearance = useApp((s) => s.setClearance);
  const start = useApp((s) => s.start);
  const goal = useApp((s) => s.goal);
  const steps = useMemo(() => (grid ? routeTerrain(grid, route) : []), [grid, route]);
  const refSteps = useMemo(() => (grid ? routeTerrain(grid, reference) : []), [grid, reference]);
  if (!grid || !start || !goal) return null;
  const sum = summarizeTerrain(steps), refSum = summarizeTerrain(refSteps), ok = route?.status === "OK";
  const sigma = region === "m0a" ? M0A_SLOPE_SIGMA_DEG : null;
  const near = gate !== null && sigma !== null ? steps.filter((q) => q.cell_slope_deg > gate - sigma).reduce((a, q) => a + q.length_m, 0) : null;
  const total = ok ? route.length_horizontal_m : 1, top = Math.max(30, sum.max_cell_slope_deg + 3);
  const line = (key: "grade_deg" | "cell_slope_deg" | "cross_slope_deg") => steps.filter((q) => Number.isFinite(q[key])).map((q) => `${q.s_m},${top - Math.abs(q[key])}`).join(" ");
  const endSlope = (c: { row: number; col: number }) => grid.slope[c.row * grid.meta.nx + c.col];
  return (
    <section className="block" data-testid="traverse-panel">
      <h2>Terrain under the route</h2>
      <p className="fine">Measured on the {region === "m0a" ? "HiRISE 2 m" : "CTX 20 m"} DEM for the selected {id === "terrain" ? "terrain-aware" : id === "distance" ? "distance" : "conservative terrain"} route.{id === "conservative" ? " The conservative route has its own fixed rules; the experimental gate below acts on the other two only." : ""} The reference planner limits only the grade along each step. It does not limit how steep the ground is, or the slope across the path.</p>
      <div className="row" role="group" aria-label="Experimental terrain-slope gate">
        {SLOPE_GATES_DEG.map((g) => (
          <button key={String(g)} type="button" data-testid={`gate-${g ?? "off"}`} aria-pressed={gate === g} onClick={() => setGate(g)}>{g === null ? "Reference (no gate)" : `Gate ${g}°`}</button>
        ))}
      </div>
      <label className="fine"><input type="checkbox" data-testid="gate-clearance" checked={clearance} disabled={gate === null} onChange={(e) => setClearance(e.target.checked)} /> Also keep one cell clear of steeper ground</label>
      <p className="fine" data-testid="gate-note">{gate === null
        ? "Reference mode: these are the frozen reference routes."
        : `EXPERIMENTAL: cells whose terrain slope (Horn 3×3) exceeds ${gate}° are not entered${clearance ? ", nor cells next to one" : ""}. This bounds both the grade along the path and the slope across it. 20° is a lunar planning figure for suited walking and 15° about the steepest Apollo walking; neither is a Mars EVA safety limit.`}</p>
      {!ok && route ? (
        <p role="alert" data-testid="trav-no-corridor">No supported corridor{gate !== null ? ` under the ${gate}° gate` : ""}: {route.status === "ENDPOINT_BLOCKED_BY_POLICY"
          ? `the start (${f1(endSlope(start))}°) or the destination (${f1(endSlope(goal))}°) itself lies on${clearance ? " or beside" : ""} steeper ground.`
          : route.status === "NO_ROUTE" ? "the permitted ground does not connect the two points." : route.status} Nothing was relaxed.{reference?.status === "OK" ? " The grey line on the map is the ungated reference route, for comparison only." : ""}</p>
      ) : null}
      {ok ? (
        <>
          <svg className="trav-chart" viewBox={`0 0 ${total} ${top}`} preserveAspectRatio="none" data-testid="trav-chart" role="img" aria-label="Slope along the route: grade along the path, terrain slope and cross-slope">
            {[10, 20, 30].filter((d) => d < top).map((d) => <line key={d} x1={0} x2={total} y1={top - d} y2={top - d} className="trav-grid" />)}
            {gate !== null ? <line x1={0} x2={total} y1={top - gate} y2={top - gate} className="trav-gate" /> : null}
            <polyline points={line("cell_slope_deg")} className="trav-slope" />
            <polyline points={line("cross_slope_deg")} className="trav-cross" />
            <polyline points={line("grade_deg")} className="trav-grade" />
          </svg>
          <p className="fine trav-legend"><span className="k-slope">terrain slope</span> <span className="k-cross">across the path</span> <span className="k-grade">along the path</span>{gate !== null ? <span className="k-gate">gate</span> : null} · grid lines 10°, 20°, 30° · distance along the route →</p>
          <table className="nums">
            <thead><tr><th>Measured</th><th>{reference ? "Gated route" : "This route"}</th>{reference ? <th>Reference</th> : null}</tr></thead>
            <tbody>
              <tr><th>Steepest step along the path</th><td data-testid="trav-max-grade">{f1(sum.max_grade_deg)}°</td>{reference ? <td>{f1(refSum.max_grade_deg)}°</td> : null}</tr>
              <tr><th>Steepest ground under the path</th><td data-testid="trav-max-slope">{f1(sum.max_cell_slope_deg)}°</td>{reference ? <td data-testid="trav-ref-slope">{f1(refSum.max_cell_slope_deg)}°</td> : null}</tr>
              <tr><th>Largest slope across the path</th><td data-testid="trav-max-cross">{f1(sum.max_cross_slope_deg)}°</td>{reference ? <td>{f1(refSum.max_cross_slope_deg)}°</td> : null}</tr>
              <tr><th>Route on ground over 15° / 20° / 25°</th><td data-testid="trav-over">{sum.metres_over[15].toFixed(0)} / {sum.metres_over[20].toFixed(0)} / {sum.metres_over[25].toFixed(0)} m</td>{reference ? <td>{refSum.metres_over[15].toFixed(0)} / {refSum.metres_over[20].toFixed(0)} / {refSum.metres_over[25].toFixed(0)} m</td> : null}</tr>
              <tr><th>Cross-slope larger than grade</th><td>{sum.cross_over_grade_m.toFixed(0)} m</td>{reference ? <td>{refSum.cross_over_grade_m.toFixed(0)} m</td> : null}</tr>
              {reference?.status === "OK" ? <tr><th>Length / model cost</th><td data-testid="trav-length">{route.length_horizontal_m.toFixed(1)} m / {route.cost_flat_equiv_m.toFixed(1)}</td><td>{reference.length_horizontal_m.toFixed(1)} m / {reference.cost_flat_equiv_m.toFixed(1)}</td></tr> : null}
            </tbody>
          </table>
          <p className="fine" data-testid="trav-uncertainty">{sigma !== null
            ? `Uncertain: independent HiRISE stereo models of this ground disagree on slope by about ${sigma}° (1σ) where it is steep.${near !== null ? ` ${near.toFixed(0)} m of this route lie within that margin of the gate, so another model could put them above it.` : ""}`
            : "Uncertain: no independent DEM is available to quantify slope error here. A 20 m DEM cannot show slopes shorter than several tens of metres."}</p>
        </>
      ) : null}
      <p className="fine">On the map and in 3D the route outline is yellow on ground of 15–20° and red above 20°. Not evaluated: rocks and steps below DEM resolution, regolith strength and traction, illumination, DEM registration error (the line can sit metres from where it is drawn). A lower model cost is not a lower risk.</p>
    </section>
  );
}

/** Shown wherever a walk or flight would start: a gate that leaves no corridor is said plainly, and nothing is traversed. */
export function GateNotice() {
  const gate = useApp((s) => s.slopeGate);
  const route = useApp((s) => s.routes[s.selectedRouteId]);
  if (gate === null || !route || route.status === "OK") return null;
  return <p role="alert" data-testid="gate-notice">No supported corridor under the experimental {gate}° terrain gate ({route.status === "NO_ROUTE" ? "the permitted ground does not connect the two points" : "an endpoint lies on steeper ground"}). Nothing was relaxed, so there is no route to walk or fly. Change the gate in Planning.</p>;
}
