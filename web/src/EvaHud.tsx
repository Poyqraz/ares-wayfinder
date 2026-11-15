// EVA HUD: a helmet-visor style SIMULATED preview. The view is first-person on the DEM mesh (EvaView3D); the route,
// guidance marks, profile and every number come from the computed route and the terrain model. If WebGL is not
// available, or the user asks for it, the earlier flat heading-up map is shown instead and labelled as such.
// There is no suit, biomedical or environment telemetry in this build, and the HUD says so.
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { mapGeometry } from "./mapGeometry.ts";
import { SCENARIO_STORM } from "./environment.ts";
import { isExplore, MISSIONS } from "./missions.ts";
import { GateNotice } from "./TraversePanel.tsx";
import { useRouteMarkers } from "./useRouteMarkers.ts";
import { bGridMissing, useApp } from "./store.ts";
import { ViewStyleToggle } from "./atmosphere.tsx";
import { GUIDANCE_GAP_M, walkPose } from "./walk.ts";
const EvaView3D = lazy(() => import("./EvaView3D.tsx"));

const SIM_NOTE = "Simulated preview: computed from the route and terrain model. No live suit, sensor or environment data.";
/** Fixed illustrative figures for a fictional ARES-1 suit. Not telemetry: nothing measures them and they never change. */
const SUIT_DEMO = { heart_bpm: 88, o2_percent: 84, pressure_kpa: 29.6 } as const;
const SUIT_NOTE = "Heart rate, O₂ reserve and suit pressure are fixed illustrative values for a fictional ARES-1 suit. They are not connected to any sensor, they do not change, and no astronaut is being monitored.";
const CAUTION_DEG = 15; // display cue only: steps steeper than this are called out (the planner's cutoff is 24.2°)
const deg = (grade: number) => (Math.atan(grade) * 180) / Math.PI;
const bearingOf = (dx: number, dy: number) => (Math.atan2(dx, -dy) * 180) / Math.PI; // 0 = north, 90 = east (y grows south)
const turn = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180; // signed difference of two bearings

export function EvaHud() {
  const mission = useApp((s) => s.mission);
  const noGrid = useApp(bGridMissing), reason = useApp((s) => s.m0abReason);
  const region = useApp((s) => s.region);
  const meta = useApp((s) => s.meta);
  const grid = useApp((s) => s.grid);
  const orthoUrl = useApp((s) => s.orthoUrl);
  const routes = useApp((s) => s.routes);
  const selectedRouteId = useApp((s) => s.selectedRouteId);
  const selectRoute = useApp((s) => s.selectRoute);
  const playhead = useApp((s) => s.playhead);
  const setPlayhead = useApp((s) => s.setPlayhead);
  const scenario = useApp((s) => s.scenarioLabel);
  const [playing, setPlaying] = useState(false);
  const [ve, setVe] = useState<1 | 3>(3);
  const [flat, setFlat] = useState(false);
  const [stormOpen, setStormOpen] = useState(false);
  const cinematic = useApp((s) => s.cinematic === true);
  const setScene = useApp((s) => s.setScene);
  const route = routes[selectedRouteId];
  const marks = useRouteMarkers();
  const markerId = useApp((s) => s.routeMarkerId);
  const selectMarker = useApp((s) => s.selectRouteMarker);
  // preview speed: about 12 m of route per second, the whole route in 20 to 45 s. A viewing speed, not a walking pace.
  const walkSeconds = Math.min(45, Math.max(20, (route?.length_horizontal_m ?? 0) / 12));
  useEffect(() => {
    if (!playing) return;
    let raf = 0, t0 = performance.now();
    const tick = (t: number) => {
      const next = Math.min(1, useApp.getState().playhead + Math.min(0.5, (t - t0) / 1000) / walkSeconds); // one shared playhead drives view, mini-map and readouts
      t0 = t;
      setPlayhead(next);
      if (next >= 1) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, setPlayhead, walkSeconds]);
  useEffect(() => {
    if (!useApp.getState().evaAutoplay) return; // arrived from "Start EVA walk" in 3D Terrain
    useApp.setState({ evaAutoplay: false });
    setPlaying(true);
  }, []);

  if (isExplore(mission) || noGrid) {
    return <section className="sheet" data-testid="eva-unavailable"><h2>EVA preview not available for {MISSIONS[mission!].shortTitle}</h2><p>{MISSIONS[mission!].noRoute?.route ?? reason}</p></section>;
  }
  if (!route || route.status !== "OK" || route.profile.length < 2 || !grid || !meta) {
    return <section className="sheet" data-testid="eva-unavailable"><h2>EVA preview</h2><GateNotice /><p>Plan a route in Planning first. The preview follows a computed, valid route.</p></section>;
  }
  const g = mapGeometry(meta), yTop = meta.y0;
  const ox = g.view.x; // draw in local metres: at projected x of ~4.6e6 m the browser's float precision drops small shapes
  const pts = route.vertices_proj.map((v) => ({ x: g.toX(v.E) - ox, y: yTop - v.N }));
  const p = route.profile, total = route.length_horizontal_m, s = playhead * total;
  // point, bearing, slope and elevation of the route at a distance along it
  const at = (sm: number) => {
    let k = 0;
    while (k < p.length - 2 && p[k + 1].s_m <= sm) k += 1;
    const t = Math.min(1, Math.max(0, (sm - p[k].s_m) / Math.max(1e-6, p[k + 1].s_m - p[k].s_m)));
    const dx = pts[k + 1].x - pts[k].x, dy = pts[k + 1].y - pts[k].y;
    return { k, x: pts[k].x + dx * t, y: pts[k].y + dy * t, bearing: bearingOf(dx, dy), slope: deg(p[k + 1].grade), h: p[k].h_m + (p[k + 1].h_m - p[k].h_m) * t };
  };
  const pos = at(s), i = pos.k, arrived = playhead >= 1;
  // heading is the walker's gaze from walkPose, the same one the first-person camera uses, so compass and view agree
  const gaze = walkPose(grid, route, s);
  const heading = bearingOf(((gaze.look.E - gaze.eye.E) * meta.dx_ground_m) / meta.dx_proj, gaze.eye.N - gaze.look.N);
  let climbed = Math.max(0, pos.h - p[i].h_m);
  for (let k = 1; k <= i; k++) climbed += Math.max(0, p[k].h_m - p[k - 1].h_m);
  const next = marks.find((m) => m.s_m > s + 0.5);
  let ahead: { deg: number; d: number } | null = null; // steepest step in the next 40 m
  for (let k = i + 1; k < p.length && p[k].s_m - s <= 40; k++) {
    const d = Math.abs(deg(p[k].grade));
    if (d >= CAUTION_DEG && (!ahead || d > ahead.deg)) ahead = { deg: d, d: Math.max(0, p[k - 1].s_m - s) };
  }
  // marker details open on request only (the visor stays clear); coming close to a waypoint highlights its tile
  const shown = marks.find((m) => m.id === markerId) ?? null, near = !!next && !arrived && next.s_m - s <= Math.max(25, total * 0.08);
  const b1 = at(Math.min(total, s + 20)), b2 = at(Math.min(total, s + 45));
  const bend = b2.k > b1.k ? turn(bearingOf(b2.x - b1.x, b2.y - b1.y) - heading) : 0; // change of direction 20 to 45 m ahead
  const span = Math.max(meta.nx * meta.dx_ground_m, meta.ny * meta.dy_ground_m) * 0.42; // ground metres across the visor; wider keeps the source pixels smaller on screen
  // guidance chevrons: fixed points on the computed route every `gap` metres, so they stay put on the ground while walking
  const gap = span * 0.035, reach = span * 0.7, chevrons: { d: number; x: number; y: number; bearing: number; slope: number }[] = [];
  for (let d = (Math.floor(s / gap) + 1) * gap; d < Math.min(total, s + reach); d += gap) chevrons.push({ d, ...at(d) });
  const c = span * 0.011;
  const compass = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round((((heading % 360) + 360) % 360) / 45) % 8];
  const line = pts.map((q) => `${q.x},${q.y}`).join(" ");
  const done = pts.slice(0, i + 1).map((q) => `${q.x},${q.y}`).join(" ") + ` ${pos.x},${pos.y}`;
  // elevation profile: one unit is one metre on both axes, so ×1 is true scale and ×3 is exactly three times taller
  let hMin = Infinity, hMax = -Infinity;
  for (const q of p) { hMin = Math.min(hMin, q.h_m); hMax = Math.max(hMax, q.h_m); }
  const pad = total * 0.012, profH = (hMax - hMin) * ve + 2 * pad, py = (h: number) => profH - pad - (h - hMin) * ve;
  return (
    <section className="hud" data-testid="eva-hud" data-heading={heading.toFixed(2)} data-pos={`${pos.x.toFixed(2)},${pos.y.toFixed(2)}`} data-mode={flat ? "flat" : "first-person"} data-guidance={Math.max(0, Math.ceil(total / GUIDANCE_GAP_M) - 1)}>
      <div className="hud-visor">
        {flat ? (
        <div className="hud-ground">
          <svg viewBox={`${pos.x - span / 2} ${pos.y - span * 0.46} ${span} ${span}`} preserveAspectRatio="xMidYMid slice" aria-label="Heading-up terrain view with the planned route ahead">
            <g transform={`rotate(${-heading} ${pos.x} ${pos.y})`}>
              <image href={orthoUrl} x={0} y={0} width={g.view.w} height={g.view.h} preserveAspectRatio="none" />
              <polyline points={line} className="hud-route" />
              <polyline points={done} className="hud-route done" />
              <g data-testid="eva-guidance" data-count={chevrons.length}>
                {chevrons.map((v) => (
                  <path key={Math.round(v.d / gap)} d={`M ${-c} ${c * 0.7} L 0 ${-c * 0.7} L ${c} ${c * 0.7}`} transform={`translate(${v.x} ${v.y}) rotate(${v.bearing})`}
                    className={`hud-step${Math.abs(v.slope) >= CAUTION_DEG ? " caution" : ""}`} opacity={0.2 + 0.7 * (1 - (v.d - s) / reach)} />
                ))}
              </g>
              {marks.map((m, k) => (
                <g key={m.id} className={`hud-mark${m.kind === "steepest" ? " caution" : ""}${m === next ? " next" : ""}`}>
                  <circle cx={pts[m.index].x} cy={pts[m.index].y} r={span * 0.016} />
                  <text x={pts[m.index].x} y={pts[m.index].y + span * 0.007} fontSize={span * 0.021} textAnchor="middle" transform={`rotate(${heading} ${pts[m.index].x} ${pts[m.index].y})`}>{k + 1}</text>
                </g>
              ))}
            </g>
            <path d={`M ${pos.x} ${pos.y - span * 0.03} l ${span * 0.017} ${span * 0.043} l ${-span * 0.017} ${-span * 0.012} l ${-span * 0.017} ${span * 0.012} z`} className="hud-self" />
          </svg>
        </div>
        ) : (
          <Suspense fallback={null}>
            <EvaView3D meta={meta} grid={grid} orthoUrl={orthoUrl} route={route} marks={marks} nextId={next?.id ?? null} activeId={markerId} ve={ve} onFail={() => setFlat(true)} />
          </Suspense>
        )}
        <div className="hud-glass" aria-hidden="true" />
        <div className="hud-top">
          <span className="hud-sim" data-testid="eva-sim-label" title={SIM_NOTE}>Simulated preview</span>
          <div className="hud-compass"><strong>{compass}</strong> {(((heading % 360) + 360) % 360).toFixed(0)}°</div>
        </div>
        {arrived ? <div className="hud-alert ok" data-testid="eva-arrived">Destination reached · {total.toFixed(0)} m walked</div>
          : ahead ? <div className="hud-alert" data-testid="eva-caution">Steep step ahead: {ahead.deg.toFixed(0)}° in {ahead.d.toFixed(0)} m</div>
          : Math.abs(bend) >= 25 ? <div className="hud-alert hint" data-testid="eva-turn">Route bears {bend < 0 ? "left" : "right"} about {Math.abs(bend).toFixed(0)}° in 20 m</div> : null}
        <div className="hud-left">
          <div className="hud-main"><span>To destination</span><strong data-testid="eva-remaining">{(total - s).toFixed(0)} m</strong></div>
          <dl className="hud-readouts">
            <div><dt>Walked</dt><dd data-testid="eva-done">{s.toFixed(0)} m</dd></div>
            <div><dt>Elevation</dt><dd>{pos.h.toFixed(1)} m</dd></div>
            <div className={Math.abs(pos.slope) >= CAUTION_DEG ? "caution" : undefined}><dt>Slope ahead</dt><dd>{pos.slope.toFixed(1)}°</dd></div>
            <div><dt>Climbed</dt><dd>{climbed.toFixed(1)} m</dd></div>
          </dl>
        </div>
        <div className="hud-right">
          <div className="hud-storm" data-testid="eva-storm">
            <button type="button" data-testid="eva-storm-toggle" aria-expanded={stormOpen} aria-controls="eva-storm-info" onClick={() => setStormOpen((v) => !v)}>
              <i aria-hidden="true" />
              <strong data-testid="eva-storm-message">{SCENARIO_STORM.message}</strong>
              <span data-testid="eva-storm-label">{SCENARIO_STORM.label} · {stormOpen ? "hide details" : "details"}</span>
            </button>
            {stormOpen ? (
              <div id="eva-storm-info" className="hud-pop" role="note" data-testid="eva-storm-info">
                <p>{SCENARIO_STORM.disclaimer}</p>
                <p>{SCENARIO_STORM.clock}</p>
                <p>{SCENARIO_STORM.context}</p>
                <p>{SCENARIO_STORM.effect}</p>
              </div>
            ) : null}
          </div>
          <button type="button" className={`hud-next${near ? " near" : ""}`} data-testid="eva-next" data-near={near ? "true" : "false"} disabled={!next} aria-expanded={next ? markerId === next.id : undefined}
            onClick={() => next && selectMarker(markerId === next.id ? null : next.id)}>
            <span>Next waypoint{next ? " · details" : ""}</span>
            <strong>{next ? `${marks.indexOf(next) + 1} · ${next.title}` : "Destination reached"}</strong>
            <em>{next ? `${(next.s_m - s).toFixed(0)} m ahead` : ""}</em>
          </button>
          {shown ? (
            <div className="hud-pop hud-marker" role="note" data-testid="eva-marker-card" data-marker={shown.id}>
              <div className="hud-pop-head"><strong>{marks.indexOf(shown) + 1} · {shown.title}</strong><button type="button" data-testid="eva-marker-close" aria-label="Close marker details" onClick={() => selectMarker(null)}>Close</button></div>
              <span>{shown.s_m >= s ? `${(shown.s_m - s).toFixed(0)} m ahead` : `${(s - shown.s_m).toFixed(0)} m behind`}</span>
              {shown.lines.slice(1, -1).map((t) => <p key={t}>{t}</p>)}
            </div>
          ) : null}
          <div className="hud-suit" data-testid="eva-suit" role="group" aria-label="Suit status: simulated demo values, not sensor readings" title={SUIT_NOTE}>
            <div><strong><svg className="hud-heart" viewBox="0 0 16 14" aria-hidden="true"><path d="M8 13.2 1.6 6.9A3.6 3.6 0 0 1 6.7 1.8L8 3.1l1.3-1.3a3.6 3.6 0 0 1 5.1 5.1z" /></svg>{SUIT_DEMO.heart_bpm}<small>bpm</small></strong><span>Heart rate</span></div>
            <div><strong>{SUIT_DEMO.o2_percent}<small>%</small></strong><span>O₂ reserve</span></div>
            <div><strong>{SUIT_DEMO.pressure_kpa}<small>kPa</small></strong><span>Suit pressure</span></div>
            <p data-testid="eva-suit-tag">Simulated demo values · not sensor readings</p>
          </div>
          <svg className="hud-mini" data-testid="eva-minimap" viewBox={`0 0 ${g.view.w} ${g.view.h}`} aria-label="North-up mini-map of the route">
            <image href={orthoUrl} x={0} y={0} width={g.view.w} height={g.view.h} preserveAspectRatio="none" opacity="0.8" />
            <polyline points={line} className="hud-route" />
            {marks.map((m) => <circle key={m.id} cx={pts[m.index].x} cy={pts[m.index].y} r={g.view.w * 0.014} className={`hud-mini-mark${m === next ? " next" : ""}`} />)}
            <circle cx={pos.x} cy={pos.y} r={g.view.w * 0.03} className="hud-self" data-testid="eva-mini-self" />
          </svg>
        </div>
        <div className="hud-profile" data-testid="eva-profile-box">
          <svg viewBox={`0 0 ${total} ${profH}`} data-testid="eva-profile" data-ve={ve} aria-label={`Elevation along the route, vertical exaggeration ×${ve}`}>
            <polyline points={p.map((q) => `${q.s_m},${py(q.h_m)}`).join(" ")} className="hud-prof-line" />
            {marks.map((m) => <line key={m.id} x1={m.s_m} x2={m.s_m} y1={py(p[m.index].h_m) - pad * 0.8} y2={py(p[m.index].h_m) + pad * 0.8} className={`hud-prof-mark${m === next ? " next" : ""}`} />)}
            <line x1={s} x2={s} y1={0} y2={profH} className="hud-prof-now" />
          </svg>
          <div className="hud-prof-row">
            <span data-testid="eva-ve-readout">Elevation {hMin.toFixed(0)} to {hMax.toFixed(0)} m · vertical exaggeration ×{ve}{ve === 1 ? " (true scale)" : " (visual only)"}</span>
            <button type="button" data-testid="eva-ve-1" aria-pressed={ve === 1} onClick={() => setVe(1)}>×1 true</button>
            <button type="button" data-testid="eva-ve-3" aria-pressed={ve === 3} onClick={() => setVe(3)}>×3</button>
          </div>
        </div>
        <div className="hud-bottom">
          <button type="button" data-testid="eva-play" onClick={() => { if (arrived) setPlayhead(0); setPlaying((v) => !v); }}>{playing ? "Pause" : arrived ? "Walk again" : playhead > 0 ? "Resume" : "Walk the route"}</button>
          <input type="range" min="0" max="1000" value={Math.round(playhead * 1000)} data-testid="eva-scrub" aria-label="Position along the route" onChange={(e) => setPlayhead(Number(e.target.value) / 1000)} />
          <span className="hud-pct">{Math.round(playhead * 100)}%</span>
          {(["terrain", "distance", "conservative"] as const).map((id) => routes[id]?.status === "OK" ? (
            <button key={id} type="button" data-testid={`eva-route-${id}`} aria-pressed={selectedRouteId === id} onClick={() => { setPlaying(false); selectRoute(id); }}>{id === "terrain" ? "Lowest cost" : id === "distance" ? "Shortest" : "Conservative"}</button>
          ) : null)}
        </div>
      </div>
      <div className="hud-markers" data-testid="eva-markers">
        {marks.map((m, k) => <button key={m.id} type="button" data-testid={`eva-marker-${m.id}`} aria-pressed={markerId === m.id} className={m === next ? "next" : undefined} onClick={() => selectMarker(markerId === m.id ? null : m.id)}>{k + 1} {m.title}</button>)}
      </div>
      <div className="hud-nav">
        <button type="button" data-testid="eva-to-3d" onClick={() => setScene("FLYOVER")}>Back to 3D overview</button>
        <button type="button" data-testid="eva-to-planning" onClick={() => setScene("PLANNING")}>Back to Planning</button>
        <button type="button" data-testid="eva-view-toggle" aria-pressed={flat} onClick={() => setFlat((v) => !v)}>Flat map view</button>
        {flat ? null : <ViewStyleToggle />}
        <span className="fine">Preview speed {(total / walkSeconds).toFixed(0)} m of route per second (a viewing speed, not a walking pace).</span>
      </div>
      <p className="fine hud-caption">{scenario}. {region === "m0a" ? "HiRISE 2 m terrain, 1 m imagery" : "CTX 20 m terrain, 5 m imagery"}, {selectedRouteId === "terrain" ? "lowest terrain cost" : selectedRouteId === "distance" ? "shortest distance" : "conservative terrain"} route. Candidate corridor, not a surveyed path.</p>
      <details className="hud-details" data-testid="eva-details">
        <summary>About this preview: what is real, what is modelled, what is simulated</summary>
        <ul className="fine">
          <li data-testid="eva-sim-note">{SIM_NOTE}</li>
          <li data-testid="eva-ve-label">{flat ? "Flat tilted map at source resolution, no relief." : ve === 3 ? "Terrain drawn ×3 vertically: visual exaggeration only. Every readout uses the true DEM." : "Terrain drawn at true vertical scale (×1)."}</li>
          {flat ? null : <li>First-person view on the DEM surface at 1.7 m eye height; imagery is stretched close to the walker. {cinematic ? "Sky colour, haze, warm tint and the fine grain on the near ground are a visual treatment, not measurements" : "Plain rendering of the stored image"}; rocks, lighting and weather are not modelled.</li>}
          <li data-testid="eva-suit-note">{SUIT_NOTE}</li>
          <li data-testid="eva-env-note">Environment: nothing is measured during the walk. Historical record only: MEDA sol 516 (2022), 770–804 Pa at the rover. The dust-storm notice is a fictional ARES-1 scenario event.</li>
          <li>Chevrons mark the computed route. Callouts at {CAUTION_DEG}° are a display cue, not a safety limit.</li>
        </ul>
      </details>
    </section>
  );
}
