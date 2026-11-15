// Regional orbital map (controlled CTX 6 m mosaic) with region selector, detail view and destination pipeline.
// All geometry comes from regional.json (verified eqc lat_ts 0 grid); Cursor's components only render.
import { useState, type CSSProperties, type MouseEvent } from "react";
import { destinationCard } from "./destinationView.ts";
import { regionalGeoToPixel, regionalPixelToGeo, type LoadedRegional } from "./regions.ts";
import { useApp } from "./store.ts";
import { FeaturePanel } from "./FeaturePanel.tsx";
import { SHUYAK } from "./missionB.ts";
import { DestinationCard } from "./ui/DestinationCard.tsx";
import { DestinationForm } from "./ui/DestinationForm.tsx";
import { OrbitalMagnifier } from "./ui/OrbitalMagnifier.tsx";
import "./ui/ui.css";
import type { GroundBounds } from "./ui/magnifier.ts";

const LABELS: Record<string, string> = {
  "waypoint:M0": "M0 · Three Forks depot",
  "waypoint:A": "A · Skinner / Wildcat Ridge",
  "waypoint:B": "C · Bright Angel",
};

function groundAspect(r: LoadedRegional, wPx: number, hPx: number): number {
  const a = r.meta.assets["science_6m.jpg"];
  const mid = regionalPixelToGeo(r, a.nx / 2, a.ny / 2);
  return (wPx * a.dx * Math.cos((mid.lat * Math.PI) / 180)) / (hPx * a.dy); // eqc lat_ts 0: x pixels are wider than ground by 1/cos(lat)
}

function ScaleBar({ r, vb }: { r: LoadedRegional; vb: { x: number; y: number; w: number; h: number } }) {
  const a = r.meta.assets["science_6m.jpg"];
  const groundPerPx = a.dx * Math.cos((regionalPixelToGeo(r, a.nx / 2, a.ny / 2).lat * Math.PI) / 180);
  const metres = [5000, 2000, 1000, 500, 200, 100, 50].find((m) => m / groundPerPx <= vb.w * 0.25) ?? 50;
  const len = metres / groundPerPx, s = vb.w / a.nx, x = vb.x + vb.w * 0.03, y = vb.y + vb.h * 0.94;
  return (
    <g data-testid="regional-scale" data-metres={metres}>
      <line x1={x} y1={y} x2={x + len} y2={y} stroke="#fff" strokeWidth={8 * s} />
      <text x={x} y={y - 14 * s} fontSize={28 * s} className="regional-label">{metres >= 1000 ? `${metres / 1000} km` : `${metres} m`} (ground)</text>
    </g>
  );
}

function Overlay({ r, scale }: { r: LoadedRegional; scale: number }) {
  const f = r.meta.features_px_in_science_6m;
  const destination = useApp((s) => s.destination);
  const features = useApp((s) => s.features);
  const box = (id: string, cls: string, label: string) => {
    const b = f[id];
    if (!b?.nw || !b.se) return null;
    return (
      <g key={id} data-testid={`regional-${id}`}>
        <rect className={cls} x={b.nw.x_px} y={b.nw.y_px} width={b.se.x_px - b.nw.x_px} height={b.se.y_px - b.nw.y_px} strokeWidth={3 * scale} />
        <text x={b.nw.x_px} y={b.nw.y_px - 8 * scale} fontSize={22 * scale} className="regional-label">{label}</text>
      </g>
    );
  };
  const dest = destination ? regionalGeoToPixel(r, destination.lat, destination.lon) : null;
  return (
    <g>
      {box("roi_a", "regional-roi", "ROI-A engineering demo (CTX 20 m)")}
      {box("m0a_analysis", "regional-m0a", "M0–A analysis grid (HiRISE 2 m, prototype)")}
      {Object.entries(LABELS).map(([id, label]) => {
        const p = f[id];
        if (p?.x_px === undefined || p.y_px === undefined) return null;
        return (
          <g key={id} data-testid={`regional-${id.replace(":", "-")}`}>
            <circle cx={p.x_px} cy={p.y_px} r={14 * scale} className="regional-wp" strokeWidth={4 * scale} />
            <text x={p.x_px + 20 * scale} y={p.y_px + 8 * scale} fontSize={24 * scale} className="regional-label">{label}</text>
          </g>
        );
      })}
      {(() => { // B has no basemap waypoint: its marker is the Shuyak sampling rover position (PDS)
        const p = regionalGeoToPixel(r, SHUYAK.lat, SHUYAK.lon);
        return (
          <g data-testid="regional-waypoint-amalik">
            <circle cx={p.x} cy={p.y} r={14 * scale} className="regional-wp" strokeWidth={4 * scale} />
            <text x={p.x - 20 * scale} y={p.y + 8 * scale} fontSize={24 * scale} textAnchor="end" className="regional-label">B · Amalik</text>
          </g>
        );
      })()}
      {(features?.features ?? []).map((ft) => {
        const p = regionalGeoToPixel(r, ft.anchor.lat, ft.anchor.lon);
        const s = 12 * scale;
        return (
          <g key={ft.feature_id} data-testid={`regional-feature-${ft.feature_id}`}>
            <polygon points={`${p.x},${p.y - s} ${p.x + s},${p.y} ${p.x},${p.y + s} ${p.x - s},${p.y}`} className="regional-feature" strokeWidth={3 * scale} />
            <text x={p.x + 16 * scale} y={p.y - 10 * scale} fontSize={20 * scale} className="regional-label">{`${ft.feature_id} anchor`}</text>
          </g>
        );
      })}
      {dest ? <circle data-testid="regional-destination" cx={dest.x} cy={dest.y} r={10 * scale} className="regional-dest" strokeWidth={4 * scale} /> : null}
    </g>
  );
}

export function RegionalMap() {
  const regional = useApp((s) => s.regional);
  const regionalState = useApp((s) => s.regionalState);
  const m0aState = useApp((s) => s.m0aState);
  const destination = useApp((s) => s.destination);
  const destinationError = useApp((s) => s.destinationError);
  const selectDestinationText = useApp((s) => s.selectDestinationText);
  const selectDestinationGeo = useApp((s) => s.selectDestinationGeo);
  const clearDestination = useApp((s) => s.clearDestination);
  const routeToDestination = useApp((s) => s.routeToDestination);
  const setRegion = useApp((s) => s.setRegion);
  const setScene = useApp((s) => s.setScene);
  const [selection, setSelection] = useState<GroundBounds | null>(null);
  const featureLayer = useApp((s) => s.features);

  if (!regional) {
    return (
      <section className="regional" data-testid="regional-map">
        <h2>Regional orbital map</h2>
        {regionalState.status === "error" ? <p data-testid="regional-unavailable">{regionalState.reason}</p> : <p>Checking the regional CTX basemap.</p>}
      </section>
    );
  }
  const a = regional.meta.assets["science_6m.jpg"];
  const nw = regionalPixelToGeo(regional, 0, 0), se = regionalPixelToGeo(regional, a.nx, a.ny);
  const full: GroundBounds = { west: nw.lon, east: se.lon, north: nw.lat, south: se.lat };
  const reg = regional.meta.registration_vs_hirise_ortho;
  const pick = (event: MouseEvent<SVGSVGElement>, vb: { x: number; y: number; w: number; h: number }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = vb.x + ((event.clientX - rect.left) / rect.width) * vb.w;
    const y = vb.y + ((event.clientY - rect.top) / rect.height) * vb.h;
    const g = regionalPixelToGeo(regional, x, y);
    selectDestinationGeo(g.lat, g.lon);
  };
  const map = (vb: { x: number; y: number; w: number; h: number }, testId: string, scale: number) => (
    <div className="regional-shot" style={{ aspectRatio: `${groundAspect(regional, vb.w, vb.h)}` }}>
      <svg data-testid={testId} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="none" onClick={(e) => pick(e, vb)} role="img"
        aria-label="Controlled CTX orthomosaic, north up. Click to inspect a point.">
        <image href={regional.imageUrl} x={0} y={0} width={a.nx} height={a.ny} preserveAspectRatio="none" />
        <Overlay r={regional} scale={scale} />
        <ScaleBar r={regional} vb={vb} />
      </svg>
    </div>
  );
  let detail = null;
  if (selection) {
    const p0 = regionalGeoToPixel(regional, selection.north, selection.west), p1 = regionalGeoToPixel(regional, selection.south, selection.east);
    const vb = { x: Math.max(0, p0.x), y: Math.max(0, p0.y), w: Math.min(a.nx, p1.x) - Math.max(0, p0.x), h: Math.min(a.ny, p1.y) - Math.max(0, p0.y) };
    const hits = (id: string) => {
      const b = regional.meta.features_px_in_science_6m[id];
      return !!b?.nw && !!b.se && b.nw.x_px < vb.x + vb.w && b.se.x_px > vb.x && b.nw.y_px < vb.y + vb.h && b.se.y_px > vb.y;
    };
    detail = vb.w > 2 && vb.h > 2 ? (
      <div className="regional-detail" data-testid="regional-detail">
        <h3>Detail view</h3>
        <p className="fine">
          {selection.south.toFixed(4)}° to {selection.north.toFixed(4)}° lat, {selection.west.toFixed(4)}° to {selection.east.toFixed(4)}° E ·
          about {Math.round(vb.w * a.dx * Math.cos((selection.north * Math.PI) / 180))} × {Math.round(vb.h * a.dy)} m · native 6 m CTX pixels
        </p>
        {map(vb, "regional-detail-map", Math.max(0.15, vb.w / a.nx))}
        <div className="row">
          {hits("m0a_analysis") ? (
            <button type="button" data-testid="open-m0a" disabled={m0aState.status !== "ready"} title={m0aState.reason ?? undefined}
              onClick={() => { setRegion("m0a"); setScene("PLANNING"); }}>Open M0–A planning (prototype)</button>
          ) : null}
          {hits("roi_a") ? <button type="button" data-testid="open-roi-a" onClick={() => { setRegion("roi_a"); setScene("PLANNING"); }}>Open ROI-A planning</button> : null}
          {!hits("m0a_analysis") && !hits("roi_a") ? <p className="fine">No analysis grid in this selection: inspect only, no routing.</p> : null}
        </div>
      </div>
    ) : null;
  }
  const card = destination ? destinationCard(destination, regional) : null;
  return (
    <section className="regional" data-testid="regional-map" style={{ "--ar": `${groundAspect(regional, a.nx, a.ny)}` } as CSSProperties}>
      <h2>Regional orbital map</h2>
      <p className="fine">
        {regional.meta.source.product} · {regional.meta.source.agency} · MRO CTX, 6 m · version {regional.meta.version} · north up ·
        imagery only (no terrain or hazard information).
        Image match to HiRISE ortho: {Object.entries(reg).map(([k, v]) => `${k} ${v.shift_east_m} m E / ${v.shift_north_m} m N`).join("; ")} (does not validate DEM registration).
      </p>
      {map({ x: 0, y: 0, w: a.nx, h: a.ny }, "regional-svg", 1)}
      <p className="regional-help" data-testid="magnifier-help">
        Click the large map to inspect any point. To zoom, drag a rectangle on the small map: the detail view shows native 6 m CTX pixels,
        and offers planning when the rectangle touches an analysis grid (ROI-A or M0–A). Diamonds mark F01–F03 rover anchors, not feature centres.
      </p>
      <div className="regional-tools">
        <OrbitalMagnifier imageUrl={regional.imageUrl} bounds={full} northUp resolution="native-ctx"
          scaleLabel={`${a.dx} m per pixel (CTX controlled mosaic); drag a rectangle to open the detail view`}
          validatedDataset={false}
          disabledReason={m0aState.status === "ready" ? "Select a rectangle: planning opens from the detail view." : (m0aState.reason ?? "M0–A analysis bundle not validated.")}
          pixelToGround={(p) => regionalPixelToGeo(regional, (p.x / p.width) * a.nx, (p.y / p.height) * a.ny)}
          onSelectRect={setSelection} />
        {detail}
      </div>
      {featureLayer ? <FeaturePanel data={featureLayer} /> : null}
      <div className="regional-destination">
        <h3>Destination</h3>
        <p className="fine">Type a coordinate or click the map. Both go through the same validated selection pipeline.</p>
        <DestinationForm onSubmit={selectDestinationText} error={destinationError} />
        {card ? <DestinationCard open status={card.status} fields={card.fields} onDismiss={clearDestination} /> : null}
        {destination ? (
          <button type="button" data-testid="route-to-destination" disabled={!destination.routable_in} onClick={routeToDestination}>
            {destination.routable_in ? "Plan route to this destination" : "Routing not available here"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
