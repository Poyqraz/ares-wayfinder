import { routeTerrain, summarizeTerrain } from "./traverse.ts";
import { TraversePanel } from "./TraversePanel.tsx";
import { isExplore } from "./missions.ts";
import { EnvToggle, EnvironmentPanel } from "./EnvironmentPanel.tsx";
import { smoothRoute } from "./walk.ts";
import { RouteConditions } from "./RouteConditions.tsx";
import { useMemo, useState } from "react";
import type { Poi, ProfileSample, RouteResult, TerrainMeta } from "@ares/contracts";
import { cellCenter, geoToProj, projToCell, projToGeo } from "@ares/core";
import { formatGeo, formatMetres, lengthsEqual, relationSentence, whyThisRoute } from "./explain.ts";
import { displayStatus, evidenceIsShown, poiBadges } from "./poiStatus.ts";
import { MapView } from "./map.tsx";
import { useApp } from "./store.ts";
import { LAYER_ORDER, layerDefs } from "./layers.ts";

/** Host and file name of a source link; the full address stays in the link and its tooltip. */
function shortUrl(url: string): string {
  try {
    const u = new URL(url), file = u.pathname.split("/").filter(Boolean).pop();
    return file ? `${u.hostname} › ${file}` : u.hostname;
  } catch {
    return url;
  }
}

function sampleAt(profile: ProfileSample[], distance: number): number {
  const first = profile[0];
  if (!first) return 0;
  if (distance <= first.s_m) return first.h_m;
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1];
    const b = profile[i];
    if (!a || !b || distance > b.s_m) continue;
    const span = b.s_m - a.s_m;
    const t = span === 0 ? 0 : (distance - a.s_m) / span;
    return a.h_m + t * (b.h_m - a.h_m);
  }
  return profile[profile.length - 1]?.h_m ?? first.h_m;
}

export function Workbench({ planning }: { planning: boolean }) {
  // Map-first: on laptop-size windows the secondary panels start collapsed (one click to open).
  const [side, setSide] = useState(() => typeof window === "undefined" || window.innerWidth > 1280);
  const [profile, setProfile] = useState(() => typeof window === "undefined" || window.innerHeight > 800);
  const note = useMapNote();
  return (
    <div className={`work${side ? "" : " no-side"}${profile ? "" : " no-profile"}`}>
      <div className="map-col">
        <div className="map-toolbar">
          <RegionSelector />
          <LayerBar />
          <div className="row">
            <button type="button" data-testid="toggle-side" aria-pressed={!side} onClick={() => setSide((v) => !v)}>{side ? "Hide panel" : "Show panel"}</button>
            <button type="button" data-testid="toggle-profile" aria-pressed={!profile} onClick={() => setProfile((v) => !v)}>{profile ? "Hide profile" : "Show profile"}</button>
          </div>
        </div>
        <MapView />
        <div className="map-foot">
          <RegionLine />
          <details className="fine"><summary>How to use the map, DEM resolution and vertical reference</summary>
            {planning ? <p>Click the terrain to move the armed endpoint; both planners rerun on the DEM. Outside the dashed analysis grid the image is regional CTX context only (not analysed).</p> : null}
            {note}
          </details>
        </div>
      </div>
      {side ? <aside className="side"><SidePanel /></aside> : null}
      {profile ? <ElevationProfile /> : null}
    </div>
  );
}

/** Persistent layer selector beside the map, with a one-line legend per active layer. */
function LayerBar() {
  const region = useApp((s) => s.region);
  const meta = useApp((s) => s.meta);
  const layers = useApp((s) => s.layers);
  const toggleLayer = useApp((s) => s.toggleLayer);
  if (!meta) return null;
  const defs = layerDefs(region, meta);
  return (
    <div className="layer-bar" data-testid="layer-bar">
      <div className="row">
        {LAYER_ORDER.map((layer) => (
          <button key={layer} type="button" data-testid={`layer-${layer}`} aria-pressed={layers[layer]} onClick={() => toggleLayer(layer)}>{defs[layer].title}</button>
        ))}
        <EnvToggle />
      </div>
      <p className="fine" data-testid="layer-bar-legend">
        {LAYER_ORDER.filter((id) => layers[id]).map((id) => `${defs[id].title}: ${defs[id].legend} (${defs[id].units})`).join(" · ")}
      </p>
    </div>
  );
}

export function RegionSelector() {
  const region = useApp((s) => s.region);
  const setRegion = useApp((s) => s.setRegion);
  const m0aState = useApp((s) => s.m0aState);
  const m0abReason = useApp((s) => s.m0abReason);
  const mission = useApp((s) => s.mission);
  const selectMission = useApp((s) => s.selectMission);
  return (
    <div className="row region-select" role="group" aria-label="Analysis region" data-testid="region-select">
      <button type="button" aria-pressed={region === "roi_a" && !isExplore(mission)} data-testid="region-roi_a" onClick={() => { selectMission(null); setRegion("roi_a"); }}>
        ROI-A · CTX 20 m engineering demo
      </button>
      <button type="button" aria-pressed={region === "m0a" && !isExplore(mission) && mission !== "B"} data-testid="region-m0a" disabled={m0aState.status !== "ready"}
        title={m0aState.reason ?? undefined} onClick={() => { if (isExplore(mission) || mission === "B") selectMission("A", false); setRegion("m0a"); }}>
        M0–A · HiRISE 2 m prototype analysis
      </button>
      <button type="button" aria-pressed={mission === "B"} data-testid="region-b" disabled={!!m0abReason} title={m0abReason ?? "The M0–A grid widened to hold Amalik. Approved for prototype analysis, 15 Nov 2026."} onClick={() => selectMission("B")}>M0–A–B · HiRISE 2 m wide grid</button>
      <button type="button" aria-pressed={mission === "C"} data-testid="region-c" onClick={() => selectMission("C")}>C Bright Angel · no routing</button>
      {m0aState.status === "error" ? <p className="fine" data-testid="m0a-disabled">{m0aState.reason}</p> : null}
      {m0aState.status === "loading" ? <p className="fine">Checking the M0–A analysis bundle.</p> : null}
    </div>
  );
}

function RegionLine() {
  const region = useApp((s) => s.region);
  const meta = useApp((s) => s.meta);
  if (region === "m0a") {
    return (
      <p className="fine" data-testid="m0a-line">
        {meta?.roi_id === "m0ab" ? "M0–A–B prototype analysis on the wider HiRISE-derived 2 m grid (the M0–A grid widened to hold Amalik)." : "M0–A prototype analysis on a HiRISE-derived 2 m grid (not the ROI-A dataset)."} Candidate route corridor, not a surveyed path.
        G1/S-4 DEM registration, vertical datum and the S6 movement model remain open.
      </p>
    );
  }
  return <p className="fine" data-testid="s4-line">CTX DEM/image registration UNRESOLVED (S-4)</p>;
}

function LayerLegend() {
  const region = useApp((s) => s.region);
  const meta = useApp((s) => s.meta);
  const layers = useApp((s) => s.layers);
  if (!meta) return null;
  const defs = layerDefs(region, meta);
  const active = LAYER_ORDER.filter((id) => layers[id]);
  return (
    <div className="layer-legend" data-testid="layer-legend">
      {active.map((id) => {
        const d = defs[id];
        return (
          <div key={id} className="fine" data-testid={`legend-${id}`}>
            <strong>{d.title}</strong> · {d.units} · {d.legend}
            <details>
              <summary>{d.role}: source and limits</summary>
              Source: {d.source}. Resolution: {d.resolution}. Processing: {d.processing}. {d.limitation}
            </details>
          </div>
        );
      })}
      <p className="fine">Not available as map layers: illumination, shadows, temperature, dust, weather, minerals, radiation (no validated gridded data). MEDA is a single rover-local record.</p>
    </div>
  );
}

function useMapNote(): string {
  const meta = useApp((s) => s.meta);
  if (!meta) return "";
  const note = meta.semantic_resolution?.note ?? "Ortho is display only.";
  return `${note} Vertical reference: ${meta.vertical_reference}`;
}

function SidePanel() {
  const meta = useApp((s) => s.meta);
  const pois = useApp((s) => s.pois);
  const start = useApp((s) => s.start);
  const goal = useApp((s) => s.goal);
  const scenario = useApp((s) => s.scenarioLabel);
  const distance = useApp((s) => s.routes.distance);
  const terrain = useApp((s) => s.routes.terrain);
  const conservative = useApp((s) => s.routes.conservative);
  const comparison = useApp((s) => s.comparison);
  const fault = useApp((s) => s.fault);
  const outside = useApp((s) => s.outsideMessage);
  const clickMode = useApp((s) => s.clickMode);
  const setClickMode = useApp((s) => s.setClickMode);
  const selectedPoiId = useApp((s) => s.selectedPoiId);
  const selectPoi = useApp((s) => s.selectPoi);
  const usePoi = useApp((s) => s.usePoi);
  const layers = useApp((s) => s.layers);
  const toggleLayer = useApp((s) => s.toggleLayer);
  const region = useApp((s) => s.region);
  const planEpoch = useApp((s) => s.planEpoch);
  if (!meta || !start || !goal) return null;

  const selected = pois.find((poi) => poi.id === selectedPoiId) ?? null;
  const equal = distance?.status === "OK" && terrain?.status === "OK" && lengthsEqual(distance.length_horizontal_m, terrain.length_horizontal_m);
  const storedDelta = distance?.status === "OK" && terrain?.status === "OK"
    ? terrain.length_horizontal_m - distance.length_horizontal_m
    : null;

  return (
    <>
      <span className="sr" data-testid="plan-epoch">{planEpoch}</span>
      <section className="block">
        <h2>Objective</h2>
        <p data-testid="scenario">{scenario}</p>
        <p className="endpoints">
          Start <span className="mono" data-testid="start-cell">{start.row}, {start.col}</span>
          {" · "}
          Goal <span className="mono" data-testid="goal-cell">{goal.row}, {goal.col}</span>
        </p>
        <p className="fine">{formatGeo(projToGeo(meta, cellCenter(meta, start)).lat, projToGeo(meta, cellCenter(meta, start)).lon)} → {formatGeo(projToGeo(meta, cellCenter(meta, goal)).lat, projToGeo(meta, cellCenter(meta, goal)).lon)}</p>
        <p className="fine">Planetocentric latitude, east-positive longitude, from the grid via @ares/core. A map click moves the armed endpoint.</p>
        <div className="row">
          <button type="button" data-testid="arm-start" aria-pressed={clickMode === "start"} onClick={() => setClickMode("start")}>Arm start</button>
          <button type="button" data-testid="arm-goal" aria-pressed={clickMode === "goal"} onClick={() => setClickMode("goal")}>Arm goal</button>
        </div>
        <p role="status" data-testid="outside-msg">{outside ?? ""}</p>
      </section>

      <section className="block">
        <h2>Route comparison</h2>
        <p className="fine">Minetti curve. The terrain-aware route excludes any step steeper than 24.2° (grade 0.45, an algorithm threshold); the distance route has no grade limit. No per-cell slope gate is applied. The distance column&apos;s model cost is that path scored with the terrain model. It is not the path length.</p>
        <table className="nums">
          <thead>
            <tr>
              <th>Quantity</th>
              <th className="col-d">Distance</th>
              <th className="col-t">Terrain-aware</th>
              <th className="col-c">Conservative</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Horizontal length</th>
              <Metric id="len-distance" route={distance} text={(route) => `${formatMetres(route.length_horizontal_m, 3)} m`} />
              <Metric id="len-terrain" route={terrain} text={(route) => `${formatMetres(route.length_horizontal_m, 3)} m`} />
              <Metric id="len-conservative" route={conservative} text={(route) => `${formatMetres(route.length_horizontal_m, 3)} m`} />
            </tr>
            <tr>
              <th>Surface length</th>
              <Metric id="surface-distance" route={distance} text={(route) => `${formatMetres(route.length_surface_m, 3)} m`} />
              <Metric id="surface-terrain" route={terrain} text={(route) => `${formatMetres(route.length_surface_m, 3)} m`} />
              <Metric id="surface-conservative" route={conservative} text={(route) => `${formatMetres(route.length_surface_m, 3)} m`} />
            </tr>
            <tr>
              <th>Ascent</th>
              <Metric id="ascent-distance" route={distance} text={(route) => `${formatMetres(route.ascent_m, 2)} m`} />
              <Metric id="ascent-terrain" route={terrain} text={(route) => `${formatMetres(route.ascent_m, 2)} m`} />
              <Metric id="ascent-conservative" route={conservative} text={(route) => `${formatMetres(route.ascent_m, 2)} m`} />
            </tr>
            <tr>
              <th>Descent</th>
              <Metric id="descent-distance" route={distance} text={(route) => `${formatMetres(route.descent_m, 2)} m`} />
              <Metric id="descent-terrain" route={terrain} text={(route) => `${formatMetres(route.descent_m, 2)} m`} />
              <Metric id="descent-conservative" route={conservative} text={(route) => `${formatMetres(route.descent_m, 2)} m`} />
            </tr>
            <tr>
              <th>Model cost</th>
              <CostCell id="cost-distance" value={comparison?.baseline_cost ?? null} blocked={comparison?.relation === "BASELINE_NOT_ALLOWED"} />
              <CostCell id="cost-terrain" value={comparison && terrain?.status === "OK" ? comparison.terrain_cost : null} blocked={false} />
              <CostCell id="cost-conservative" value={conservative?.status === "OK" ? conservative.cost_flat_equiv_m : null} blocked={false} />
            </tr>
          </tbody>
        </table>
        <ConservativeNote />
        <p data-testid="length-relation">
          {equal ? "equal length" : storedDelta === null ? "length comparison unavailable" : `lengths differ by ${formatMetres(Math.abs(storedDelta), 3)} m`}
        </p>
        {storedDelta !== null && equal && <p className="fine">Stored length difference {storedDelta.toExponential(2)} m, inside the 1e-6 m equal-length threshold.</p>}
        <p className="mono" data-testid="relation">{comparison?.relation ?? "—"}</p>
        {comparison && <p>{relationSentence(comparison.relation)}</p>}
        {comparison?.delta !== null && comparison?.delta !== undefined && (
          <p className="fine">
            Model-cost difference (terrain − distance route): {formatMetres(comparison.delta, 3)} flat-equivalent m.
            {equal ? " Ascent on the distance path follows whichever equal-length path that planner returned." : ""}
          </p>
        )}
        {fault && <p role="alert">{fault}</p>}
        {distance?.status === "OK" && (
          <p className="fine">algorithm {distance.algorithm_version} · dataset {distance.dataset_version} · contract {distance.contract_version}</p>
        )}
      </section>

      <section className="block">
        <h2>Why this route?</h2>
        <p data-testid="why">{whyThisRoute(equal, comparison?.relation ?? null, storedDelta)}</p>
        <details>
        <summary>Constraints and limitations</summary>
        <h3>Constraints</h3>
        <ul>
          {(distance?.constraint_notes ?? []).map((note) => <li key={`d-${note}`}>Distance route: {note}</li>)}
          {(terrain?.constraint_notes ?? []).map((note) => <li key={`t-${note}`}>Terrain-aware route: {note}</li>)}
        </ul>
        <h3>Limitations</h3>
        <ul>
          {(terrain?.uncertainty_notes ?? distance?.uncertainty_notes ?? []).map((note) => <li key={note}>{note}</li>)}
        </ul>
        </details>
      </section>

      <EnvironmentBlock />
      <TraversePanel />
      <SmoothBlock />
      <PoiCard poi={selected} meta={meta} onUse={usePoi} />
      <section className="block">
        <h2>Catalogue</h2>
        <ul className="poi-list">
          {pois.map((poi) => (
            <li key={poi.id}>
              <button type="button" aria-pressed={poi.id === selectedPoiId} onClick={() => selectPoi(poi.id)}>
                {poi.name}
                {poiBadges(displayStatus(poi)).map((badge) => <span key={badge.testId} className="flag" data-testid={badge.testId}>{badge.text}</span>)}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <details className="block">
        <summary>Layers and legend</summary>
        <LayerLegend />
      </details>
      <RouteConditions region={region} />
      <Provenance compact />
    </>
  );
}

/** The any-angle line of the selected route: geometry changed, so every number is recomputed on the DEM surface. */
function SmoothBlock() {
  const grid = useApp((s) => s.grid);
  const id = useApp((s) => s.selectedRouteId);
  const route = useApp((s) => s.routes[s.selectedRouteId]);
  const planGrid = useApp((s) => s.planGrid) ?? grid, planParams = useApp((s) => s.planParams);
  const line = useMemo(() => (planGrid && route && id !== "conservative" ? smoothRoute(planGrid, route, id, planParams) : null), [planGrid, route, id, planParams]); // a straightened line would leave the gentle cells the conservative route was chosen for
  if (!line || !route) return null;
  const terrain = id === "terrain";
  return (
    <details className="block" data-testid="smooth-block">
      <summary>Smoothed walking line (re-checked)</summary>
      <p className="fine">White dotted line on the map. Straight segments replace runs of grid steps of the selected {terrain ? "terrain-aware" : "distance"} route only where every sample is on valid terrain{terrain ? ", no sampled step exceeds 24.2°, the experimental gate (if on) holds under every sample, and the model cost does not rise" : ""}. The grid route stays the planner&apos;s reference; this line was not searched by the planner and is not a new optimum.</p>
      <table className="nums">
        <thead><tr><th>Quantity</th><th>Grid route</th><th>Smoothed line</th></tr></thead>
        <tbody>
          <tr><th>Horizontal length</th><td>{formatMetres(route.length_horizontal_m, 1)} m</td><td data-testid="smooth-length">{formatMetres(line.length_horizontal_m, 1)} m</td></tr>
          <tr><th>Ascent / descent</th><td>{formatMetres(route.ascent_m, 1)} / {formatMetres(route.descent_m, 1)} m</td><td>{formatMetres(line.ascent_m, 1)} / {formatMetres(line.descent_m, 1)} m</td></tr>
          <tr><th>Steepest step</th><td>{((Math.atan(route.max_edge_grade) * 180) / Math.PI).toFixed(1)}°</td><td>{((Math.atan(line.max_grade) * 180) / Math.PI).toFixed(1)}°</td></tr>
          <tr><th>{terrain ? "Model cost" : "Length as cost"}</th><td>{formatMetres(line.grid_cost_flat_equiv_m, 1)}</td><td data-testid="smooth-cost">{formatMetres(line.cost_flat_equiv_m, 1)}</td></tr>
          <tr><th>Heading changes</th><td>{line.turns_grid}</td><td data-testid="smooth-turns">{line.turns}</td></tr>
        </tbody>
      </table>
      <p className="fine">Sampled every half cell on the same triangles the 3D view draws. Same limits as the grid route: DEM resolution, registration and vertical datum are unresolved.</p>
    </details>
  );
}

function EnvironmentBlock() {
  const on = useApp((s) => s.envLayer);
  return on ? <section className="block" data-testid="env-block"><h2>Environmental context</h2><EnvironmentPanel tabs={false} /></section> : null;
}

/** What the third strategy did, in one or two sentences, or why it found no corridor. */
function ConservativeNote() {
  const grid = useApp((s) => s.grid);
  const distance = useApp((s) => s.routes.distance);
  const terrain = useApp((s) => s.routes.terrain);
  const conservative = useApp((s) => s.routes.conservative);
  const selectRoute = useApp((s) => s.selectRoute);
  const selectedId = useApp((s) => s.selectedRouteId);
  if (!grid || !conservative) return null;
  const sum = (r: RouteResult | null) => summarizeTerrain(routeTerrain(grid, r));
  const ok = conservative.status === "OK";
  const same = ok && terrain?.status === "OK" && conservative.cells.length === terrain.cells.length && conservative.cells.every((c, i) => c.row === terrain.cells[i].row && c.col === terrain.cells[i].col);
  return (
    <div className="cons-note" data-testid="conservative-note">
      <p>
        <strong className="col-c">Conservative terrain.</strong>{" "}
        {same
          ? `Same path as the terrain-aware route between these points: the ground is already gentle at this grid's resolution (steepest ${sum(conservative).max_cell_slope_deg.toFixed(1)}°), so there is nothing to avoid.`
          : ok
          ? `${distance?.status !== "OK" ? "" : conservative.length_horizontal_m - distance.length_horizontal_m < 0.5 ? "The same length as the shortest route. " : `${(conservative.length_horizontal_m - distance.length_horizontal_m).toFixed(0)} m longer than the shortest route. `}Steepest ground under it ${sum(conservative).max_cell_slope_deg.toFixed(1)}°${terrain?.status === "OK" ? `, against ${sum(terrain).max_cell_slope_deg.toFixed(1)}° on the terrain-aware route` : ""}; ${sum(conservative).metres_over[15].toFixed(0)} m on ground over 15°${terrain?.status === "OK" ? ` (terrain-aware: ${sum(terrain).metres_over[15].toFixed(0)} m)` : ""}.`
          : conservative.constraint_notes[conservative.constraint_notes.length - 1]}
      </p>
      <div className="row">
        <button type="button" data-testid="use-conservative" disabled={!ok} aria-pressed={selectedId === "conservative"} onClick={() => selectRoute("conservative")}>Use the conservative route</button>
        <button type="button" data-testid="use-terrain" aria-pressed={selectedId === "terrain"} onClick={() => selectRoute("terrain")}>Terrain-aware</button>
        <button type="button" data-testid="use-distance" aria-pressed={selectedId === "distance"} onClick={() => selectRoute("distance")}>Shortest</button>
      </div>
      <details><summary>How the conservative route is chosen</summary><ul className="fine">{conservative.constraint_notes.slice(0, 4).map((t) => <li key={t}>{t}</li>)}</ul><p className="fine">It prefers more manageable terrain. It is not a statement that the route is safe.</p></details>
    </div>
  );
}

function CostCell({ id, value, blocked }: { id: string; value: number | null; blocked: boolean }) {
  if (value === null) return <td className="mono" data-testid={id}>{blocked ? "not allowed" : "—"}</td>;
  return (
    <td className="mono" data-testid={id}>
      <span className="cost-num">{formatMetres(value, 3)}</span>
      <span className="fine"> flat-equivalent m</span>
    </td>
  );
}

function Metric({ id, route, text }: { id: string; route: RouteResult | null; text: (route: RouteResult) => string }) {
  const shown = route?.status === "OK" ? text(route) : id.endsWith("-conservative") && route ? "no corridor" : (route?.status ?? "—"); // the reason is spelled out under the table
  return <td className="mono" data-testid={id}>{shown}</td>;
}

function PoiStatusLines({ poi }: { poi: Poi }) {
  const status = displayStatus(poi);
  const evidence = evidenceIsShown(poi) ? poi.evidence : null;
  const source = evidence?.coordinate_source;
  return (
    <>
      <p data-testid="poi-coord-status">{status.coordinate_label}</p>
      <p data-testid="poi-target-precision">{status.target_label}</p>
      <p data-testid="poi-registration">{status.registration_label}</p>
      <p data-testid="poi-datum">{status.datum_label}</p>
      {status.elevation_label && <p data-testid="poi-elevation">{status.elevation_label}</p>}
      {status.role_label && <p data-testid="poi-role">{status.role_label}</p>}
      {status.notice && <p data-testid="poi-notice">{status.notice}</p>}
      {source && (
        <>
          <p className="fine">{source.product}. {source.locator}</p>
          <p><a className="src-link" href={source.url} target="_blank" rel="noreferrer" title={source.url}>{shortUrl(source.url)}</a></p>
          <p className="mono">Printed {source.printed.lat}, {source.printed.lon}{source.printed.elev_m == null ? "" : `, ${source.printed.elev_m} m`}</p>
          <p className="fine">{source.convention.latitude}, {source.convention.longitude}, {source.convention.elevation_reference}</p>
          <ul>
            {source.cross_checks.map((check) => <li key={`${check.source}-${check.delta_m}`}>{check.source}: {check.delta_m} m</li>)}
          </ul>
        </>
      )}
      {evidence?.science?.geology && <p>{evidence.science.geology}</p>}
      {evidence?.science?.events && <p>{evidence.science.events}</p>}
      {evidence?.science?.samples?.map((sample) => <p key={sample.number}>{sample.name} #{sample.number}</p>)}
      {evidence?.science?.references?.map((ref) => <p key={ref}>{ref}</p>)}
    </>
  );
}

function PoiCard({ poi, meta, onUse }: { poi: Poi | null; meta: TerrainMeta; onUse: (mode: "start" | "goal", id: string) => void }) {
  const cell = poi ? projToCell(meta, geoToProj(meta, poi.geo)) : null;
  return (
    <section className="block" data-testid="poi-card">
      <h2>Selected point</h2>
      {!poi && <p>Select a catalogue point.</p>}
      {poi && (
        <>
          <p className="poi-title">{poi.name}</p>
          <p>{poi.claim}</p>
          <p className="mono">{formatGeo(poi.geo.lat, poi.geo.lon)}</p>
          <PoiStatusLines poi={poi} />
          {cell && <p className="fine">Grid cell {cell.row}, {cell.col}</p>}
          <p><a href={poi.source} target="_blank" rel="noreferrer">{poi.source}</a></p>
          <div className="row">
            <button type="button" onClick={() => onUse("start", poi.id)}>Use as start</button>
            <button type="button" onClick={() => onUse("goal", poi.id)}>Use as goal</button>
          </div>
        </>
      )}
    </section>
  );
}

export function ElevationProfile() {
  const distance = useApp((s) => s.routes.distance);
  const terrain = useApp((s) => s.routes.terrain);
  const selectedId = useApp((s) => s.selectedRouteId);
  const playhead = useApp((s) => s.playhead);
  const setPlayhead = useApp((s) => s.setPlayhead);
  const selectRoute = useApp((s) => s.selectRoute);
  const ve = useApp((s) => s.ve);
  const conservative = useApp((s) => s.routes.conservative);
  const kind = (route: RouteResult) => (route === distance ? "distance" : route === terrain ? "terrain" : "conservative");
  const drawn = [distance, terrain, conservative].filter((route): route is RouteResult => route?.status === "OK" && route.profile.length > 0);
  const bounds = useMemo(() => {
    let sMax = 1;
    let hMin = Infinity;
    let hMax = -Infinity;
    for (const route of drawn) {
      for (const sample of route.profile) {
        sMax = Math.max(sMax, sample.s_m);
        hMin = Math.min(hMin, sample.h_m);
        hMax = Math.max(hMax, sample.h_m);
      }
    }
    if (!Number.isFinite(hMin) || !Number.isFinite(hMax)) return null;
    const pad = Math.max(0.5, (hMax - hMin) * 0.15);
    return { sMax, y0: hMin - pad, y1: hMax + pad };
  }, [drawn]);

  const selected = selectedId === "terrain" ? terrain : selectedId === "conservative" ? conservative : distance;
  const marker = selected?.status === "OK" && bounds
    ? { s: playhead * selected.length_horizontal_m, h: sampleAt(selected.profile, playhead * selected.length_horizontal_m) }
    : null;

  return (
    <section className="profile block" data-testid="profile">
      <div className="profile-head">
        <h2>Elevation profile</h2>
        <div className="row">
          <button type="button" aria-pressed={selectedId === "distance"} onClick={() => selectRoute("distance")}>Marker on distance</button>
          <button type="button" aria-pressed={selectedId === "terrain"} onClick={() => selectRoute("terrain")}>Marker on terrain-aware</button>
          <button type="button" data-testid="select-conservative" aria-pressed={selectedId === "conservative"} disabled={conservative?.status !== "OK"} onClick={() => selectRoute("conservative")}>Marker on conservative</button>
        </div>
      </div>
      {!bounds && <p>No elevation profile for these endpoints.</p>}
      {bounds && (
        <svg viewBox="0 0 640 150" className="profile-svg" role="img" aria-label="Elevation along the routes, metres">
          <path d={axisPath(bounds)} className="axis" />
          {drawn.map((route) => (
            <polyline
              key={kind(route)}
              points={profilePoints(route, bounds)}
              className={`route-line route-${kind(route)}`}
            />
          ))}
          {marker && <circle cx={xOf(marker.s, bounds)} cy={yOf(marker.h, bounds)} r="3.5" className="playhead" />}
          <text x="32" y="14">{formatMetres(bounds.y1, 1)} m</text>
          <text x="32" y="142">{formatMetres(bounds.y0, 1)} m</text>
          <text x="600" y="142" textAnchor="end">{formatMetres(bounds.sMax, 0)} m</text>
        </svg>
      )}
      <label className="play">
        Along-track marker
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(playhead * 1000)}
          aria-label="Along-track marker as a fraction of horizontal length"
          onChange={(event) => setPlayhead(Number(event.target.value) / 1000)}
        />
      </label>
      <p className="fine">Distance axis is metres along the path. The elevation axis is fit to this path, labelled in metres, and is not a 1:1 section. <span data-testid="ve">Vertical exaggeration stored for a later view: ×{ve}</span></p>
    </section>
  );
}

function axisPath(bounds: { sMax: number; y0: number; y1: number }): string {
  const x0 = xOf(0, bounds);
  const x1 = xOf(bounds.sMax, bounds);
  const yTop = yOf(bounds.y1, bounds);
  const yBot = yOf(bounds.y0, bounds);
  return `M ${x0} ${yTop} L ${x0} ${yBot} L ${x1} ${yBot}`;
}

function xOf(distance: number, bounds: { sMax: number }): number {
  return 48 + (distance / bounds.sMax) * 560;
}

function yOf(height: number, bounds: { y0: number; y1: number }): number {
  return 18 + (1 - (height - bounds.y0) / (bounds.y1 - bounds.y0)) * 114;
}

function profilePoints(route: RouteResult, bounds: { sMax: number; y0: number; y1: number }): string {
  return route.profile.map((sample) => `${xOf(sample.s_m, bounds)},${yOf(sample.h_m, bounds)}`).join(" ");
}

export function Provenance({ compact = false }: { compact?: boolean }) {
  const sources = useApp((s) => s.sources);
  const citationCardId = useApp((s) => s.citationCardId);
  const setCitation = useApp((s) => s.setCitation);
  return (
    <section className={compact ? "block" : "sheet"}>
      <h2>Provenance</h2>
      <p className="fine">Historical products. The overview hash is stored in its own sidecar, separate from the ROI manifest.</p>
      {sources.map((source) => {
        const open = !compact || citationCardId === source.id;
        return (
          <article key={source.id} className={citationCardId === source.id ? "source source-on" : "source"} id={`source-${source.id}`}>
            <button type="button" aria-pressed={citationCardId === source.id} onClick={() => setCitation(source.id)}>
              {source.mission} · {source.instrument}
            </button>
            {open && (
              <>
                <p>{source.product_version}</p>
                <p>{source.citation}</p>
                <p><a className="src-link" href={source.url} target="_blank" rel="noreferrer" title={source.url}>{shortUrl(source.url)}</a></p>
                <ul>{source.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
              </>
            )}
          </article>
        );
      })}
    </section>
  );
}

export function Orbital() {
  const overview = useApp((s) => s.overview);
  const overviewUrl = useApp((s) => s.overviewUrl);
  const meta = useApp((s) => s.meta);
  const setScene = useApp((s) => s.setScene);
  const [decodeError, setDecodeError] = useState(false);
  if (!overview || !meta) return null;
  const ext = overview.extent_proj_m;
  const spanX = ext.x_max - ext.x_min;
  const spanY = ext.y_max - ext.y_min;
  const east = meta.x0 + meta.nx * meta.dx_proj;
  const south = meta.y0 - meta.ny * meta.dy_proj;
  const left = ((meta.x0 - ext.x_min) / spanX) * 100;
  const width = ((east - meta.x0) / spanX) * 100;
  const top = ((ext.y_max - meta.y0) / spanY) * 100;
  const height = ((meta.y0 - south) / spanY) * 100;
  return (
    <div className="orbital">
      <div className="orbital-frame">
        <div className="orbital-shot" style={{ aspectRatio: `${overview.preview_size_px[0]} / ${overview.preview_size_px[1]}` }}>
          {decodeError ? (
            <p>DATASET INTEGRITY: the hashed overview could not be decoded.</p>
          ) : (
            <img
              src={overviewUrl}
              alt={`${overview.title}. North up. Not a live view.`}
              onError={() => setDecodeError(true)}
            />
          )}
          <div className="roi-box" style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}>
            <span>ROI-A</span>
          </div>
        </div>
      </div>
      <div className="sheet">
        <h2>{overview.title}</h2>
        <p>{overview.mission} · {overview.instrument}</p>
        <p>{overview.product_id}</p>
        <p>Product version {overview.product_version}</p>
        <p>{overview.citation}</p>
        <p>{overview.orientation}</p>
        <p>{overview.scale_note}</p>
        <p>
          Extent {overview.extent_geo_deg.lat_min.toFixed(2)}° to {overview.extent_geo_deg.lat_max.toFixed(2)}° N,{" "}
          {overview.extent_geo_deg.lon_min.toFixed(2)}° to {overview.extent_geo_deg.lon_max.toFixed(2)}° E.
        </p>
        <p>This preview is not: {overview.is_not.join("; ")}.</p>
        <p className="fine">SHA-256 matches the sidecar. That hash is not part of the ROI manifest.</p>
        <button type="button" onClick={() => setScene("MISSION_CONTROL")}>Open mission control</button>
      </div>
    </div>
  );
}
