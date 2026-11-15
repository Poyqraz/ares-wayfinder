// Route conditions: what the planner takes into account, and what it does not (with the reason). Nothing is invented.
import type { RegionId } from "./regions.ts";

type Row = { factor: string; status: "used" | "partly" | "not"; how: string };

export function routeConditions(region: RegionId): Row[] {
  const dem = region === "m0a" ? "HiRISE DTM, 2 m cells" : "JPL CTX DEM, 20 m cells";
  return [
    { factor: "Grade along each step", status: "used", how: `The height change between neighbouring cell centres on the ${dem} sets each step's relative cost (Minetti curve; S6 validation pending). Steps steeper than 24.2° are excluded from the terrain-aware route (experimental algorithm threshold, not a safety limit).` },
    { factor: "Terrain slope and slope across the path", status: "partly", how: "Measured for every route and shown under 'Terrain under the route'. The reference planner does not limit them: a path may run along a steep hillside if its own steps are gentle. The experimental terrain-slope gate excludes cells steeper than the chosen value." },
    { factor: "Clearance from steep ground, DEM error", status: "partly", how: "Only with the experimental gate's one-cell clearance. DEM registration and stereo error are reported, not planned for: the line can lie metres from where it is drawn. The Conservative Terrain strategy counts the steepest slope in the 3×3 cells around each step and, on the HiRISE grid, adds the 4° disagreement between stereo models before judging it." },
    { factor: "Data voids (NoData)", status: "used", how: "Cells without source data are never routed and never filled; diagonal steps cannot cut their corners." },
    { factor: "Craters and depressions", status: "partly", how: `Present in the ${dem}: their walls enter through the grade of the steps that cross them; a route can still run along a wall unless the experimental gate is on. Crater floors and rims are not classified separately as hazards.` },
    { factor: "Elevation change", status: "used", how: "Climb and descent enter through the grade of each step; totals are shown with the route." },
    { factor: "Rocks and small obstacles", status: "not", how: "Not resolved: features smaller than the DEM's effective resolution (several metres) are invisible to the planner." },
    { factor: "Radiation", status: "not", how: "Not modelled: no validated spatial radiation dataset exists at this scale; rover radiation measurements are point time series. No values are invented." },
    { factor: "Dust, temperature, weather", status: "not", how: "Not modelled: MEDA is a historical rover-local record, not a spatial or forecast field. The dust-storm notice in the EVA HUD is an ARES-1 scenario event and changes no route." },
    { factor: "Illumination and shadow", status: "not", how: "Not modelled yet: needs a chosen time and validated solar geometry (Mars24)." },
  ];
}

const MARK = { used: "✔ used", partly: "◐ partly", not: "✖ not modelled" };

export function RouteConditions({ region }: { region: RegionId }) {
  return (
    <section className="block" data-testid="route-conditions">
      <h2>Route conditions</h2>
      <table className="conditions">
        <tbody>
          {routeConditions(region).map((r) => (
            <tr key={r.factor} data-testid={`condition-${r.status}`}>
              <th>{r.factor}</th>
              <td className={`cond-${r.status}`}>{MARK[r.status]}</td>
              <td className="fine">{r.how}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
