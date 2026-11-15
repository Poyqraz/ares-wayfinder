// Environmental context: dust, weather and radiation as reference cards, each tagged measured, modelled, scenario or
// not available. Used in Planning, Mission Control and 3D Terrain. No area is drawn on any map from it.
import { ENV_CATEGORY, ENV_LAYER, ENVIRONMENT, SCENARIO_STORM, type EnvCategory, type EnvLayer } from "./environment.ts";
import { useApp } from "./store.ts";

export function CategoryTag({ category }: { category: EnvCategory }) {
  return <span className={`env-tag env-${category}`}>{ENV_CATEGORY[category].label}</span>;
}

/** What the four colours mean. Shown with every use of the layers. */
export function EnvironmentLegend() {
  return (
    <ul className="env-legend-list" data-testid="env-legend">
      {(Object.keys(ENV_CATEGORY) as EnvCategory[]).map((c) => <li key={c}><CategoryTag category={c} /> {ENV_CATEGORY[c].note}</li>)}
    </ul>
  );
}

/** Shows or hides the environmental key on the map or in the 3D panel. */
export function EnvToggle() {
  const on = useApp((s) => s.envLayer), set = useApp((s) => s.setEnvLayer);
  return <button type="button" data-testid="layer-environment" aria-pressed={on !== null} title="Dust, weather and radiation: reference information, not map areas" onClick={() => set(on ? null : "dust")}>Environment</button>;
}

/** The three layers, one at a time, as on a weather map. */
function EnvLayerButtons() {
  const on = useApp((s) => s.envLayer) ?? "dust", set = useApp((s) => s.setEnvLayer);
  return (
    <div className="row env-switch" role="group" aria-label="Environmental context layer">
      {(Object.keys(ENV_LAYER) as EnvLayer[]).map((l) => <button key={l} type="button" aria-pressed={on === l} data-testid={`env-layer-${l}`} onClick={() => set(l)}>{ENV_LAYER[l]}</button>)}
    </div>
  );
}

/** Compact key for the map and the 3D view: what the active layer holds, by kind of statement. */
export function EnvironmentKey() {
  const layer = useApp((s) => s.envLayer);
  if (!layer) return null;
  return (
    <details className="env-key" data-testid="env-key" open>
      <summary>Environment: reference only</summary>
      <EnvLayerButtons />
      <p className="fine" data-testid="env-key-note">No gridded data covers this terrain, so no area is drawn and no route changes.</p>
      <ul>
        {layer === "dust" ? <li data-testid="env-key-scenario-storm"><CategoryTag category="scenario" /> {SCENARIO_STORM.message} Not a forecast.</li> : null}
        {ENVIRONMENT.filter((e) => e.layer === layer).map((e) => <li key={e.id} data-testid={`env-key-${e.id}`}><CategoryTag category={e.category} /> {e.title}{e.category === "measured" ? `: ${e.value}` : ""}</li>)}
      </ul>
    </details>
  );
}

export function EnvironmentPanel({ tabs = true }: { tabs?: boolean }) {
  const layer = useApp((s) => s.envLayer) ?? "dust";
  return (
    <div className="env-panel" data-testid="env-panel" data-layer={layer}>
      <p className="fine" data-testid="env-lead">Dust, weather and radiation are shown as reference cards. None of them has a gridded dataset over this terrain, so none is drawn as an area on the map and none changes a route.</p>
      {tabs ? <EnvLayerButtons /> : null}
      <EnvironmentLegend />
      {layer === "dust" ? (
        <article className="env-card env-scenario" data-testid="env-card-scenario-storm">
          <h4><CategoryTag category="scenario" /> {SCENARIO_STORM.message}</h4>
          <p className="fine">{SCENARIO_STORM.disclaimer}</p>
          <p className="fine">{SCENARIO_STORM.effect}</p>
        </article>
      ) : null}
      {ENVIRONMENT.filter((e) => e.layer === layer).map((e) => (
        <article key={e.id} className={`env-card env-${e.category}`} data-testid={`env-card-${e.id}`}>
          <h4><CategoryTag category={e.category} /> {e.title}</h4>
          <p className="env-value">{e.value}</p>
          <p className="fine">{e.where} · {e.when}</p>
          {e.source ? <p className="fine">Source: {e.url ? <a href={e.url} target="_blank" rel="noreferrer" title={e.url}>{e.source}</a> : e.source}</p> : null}
          <p className="fine warn">{e.limits}</p>
        </article>
      ))}
    </div>
  );
}
