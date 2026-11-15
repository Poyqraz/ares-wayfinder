// The route-information card, shared by 2D Planning and the 3D Terrain scene so a marker reads the same in both.
import type { RouteMarker } from "./routeMarkers.ts";
import { useApp } from "./store.ts";

export function RouteMarkerCard({ rms, inline = false }: { rms: RouteMarker[]; inline?: boolean }) {
  const id = useApp((s) => s.routeMarkerId);
  const select = useApp((s) => s.selectRouteMarker);
  const i = rms.findIndex((m) => m.id === id);
  if (i < 0) return null;
  const m = rms[i];
  return (
    <div className={`rm-card${inline ? " inline" : ""}`} data-testid="route-marker-card">
      <div className="inspector-head">
        <h3><span className={`rm-badge rm-${m.kind}`}>{i + 1}</span> {m.title}</h3>
        <button type="button" data-testid="route-marker-close" onClick={() => select(null)}>Close</button>
      </div>
      <p className="rm-lead">{m.lines[0]}</p>
      <ul>{m.lines.slice(1, -1).map((t) => <li key={t}>{t}</li>)}</ul>
      <p className="fine">{m.lines[m.lines.length - 1]}</p>
      <div className="row">
        <button type="button" data-testid="route-marker-prev" disabled={i === 0} onClick={() => select(rms[i - 1].id)}>Previous</button>
        <button type="button" data-testid="route-marker-next" disabled={i === rms.length - 1} onClick={() => select(rms[i + 1].id)}>Next</button>
        <span className="fine">{i + 1} of {rms.length}</span>
      </div>
    </div>
  );
}
