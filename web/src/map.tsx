import { mapGeometry } from "./mapGeometry.ts";
import { RouteMarkerCard } from "./RouteMarkerCard.tsx";
import { EnvironmentKey } from "./EnvironmentPanel.tsx";
import { useRouteMarkers } from "./useRouteMarkers.ts";
import { smoothRoute } from "./walk.ts";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Cell, Poi, RouteResult, TerrainMeta } from "@ares/contracts";
import { geoToProj, projToCell, type TerrainGrid } from "@ares/core";
import { displayStatus, poiBadges } from "./poiStatus.ts";
import { gateOverlayUrl, overlayUrl } from "./overlays.ts";
import { routeTerrain } from "./traverse.ts";
import { useApp, type LayerToggles } from "./store.ts";

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ScreenMarker {
  poi: Poi;
  cell: Cell;
  x: number;
  y: number;
  place: "left" | "right" | "above";
}

function mapLabel(name: string): string {
  const head = name.split("(")[0]?.split("/")[0]?.trim() || name;
  if (head.length <= 18) return head;
  return head.split(" ").slice(-2).join(" ");
}

function gridView(meta: TerrainMeta): View {
  return mapGeometry(meta).view; // ground-true aspect (CR-005)
}

function zoomAt(view: View, u: number, v: number, factor: number): View {
  const w = view.w * factor;
  const h = view.h * factor;
  const anchorX = view.x + u * view.w;
  const anchorY = view.y + v * view.h;
  return { x: anchorX - u * w, y: anchorY - v * h, w, h };
}

function clampAxis(value: number, min: number, max: number): number {
  if (max < min) return (min + max) / 2;
  return Math.min(Math.max(value, min), max);
}

/** Fit the analysis grid into a viewport of the given width/height aspect (map-first: the view takes the container's shape). */
function fitView(full: View, aspect: number): View {
  if (full.w / full.h > aspect) {
    const h = full.w / aspect;
    return { x: full.x, y: full.y - (h - full.h) / 2, w: full.w, h };
  }
  const w = full.h * aspect;
  return { x: full.x - (w - full.w) / 2, y: full.y, w, h: full.h };
}

function clampView(view: View, full: View, aspect: number): View {
  const span = Math.max(full.w, full.h * aspect);
  const w = Math.min(Math.max(view.w, full.w * 0.06), span * 3);
  const h = w / aspect;
  const cx = clampAxis(view.x + w / 2, full.x - full.w * 0.5, full.x + full.w * 1.5);
  const cy = clampAxis(view.y + h / 2, full.y - full.h * 0.5, full.y + full.h * 1.5);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function routePoints(route: RouteResult, yTop: number, toX: (E: number) => number): string {
  return route.vertices_proj.map((point) => `${toX(point.E)},${yTop - point.N}`).join(" ");
}

/** Screen pixel → SVG user space. Keeps pan, zoom and clicks aligned when the viewBox is letterboxed. */
function userPoint(svg: SVGSVGElement, clientX: number, clientY: number, inverse?: DOMMatrix): DOMPoint | null {
  const matrix = inverse ?? svg.getScreenCTM()?.inverse();
  if (!matrix) return null;
  return new DOMPoint(clientX, clientY).matrixTransform(matrix);
}

export function MapView() {
  const meta = useApp((s) => s.meta);
  const grid = useApp((s) => s.grid);
  if (!meta || !grid) return null;
  return <MapReady meta={meta} grid={grid} />;
}

function MapReady({ meta, grid }: { meta: TerrainMeta; grid: TerrainGrid }) {
  const full = useMemo(() => gridView(meta), [meta]);
  const [aspect, setAspect] = useState(full.w / full.h);
  const [view, setView] = useState<View>(full);
  const frameRef = useRef<HTMLDivElement>(null);
  const regional = useApp((s) => s.regional);
  const routeMarkerId = useApp((s) => s.routeMarkerId);
  const envLayer = useApp((s) => s.envLayer);
  const wildcat = useApp((s) => s.science.find((t) => t.id === "outcrop:wildcat_ridge"));
  const selectRouteMarker = useApp((s) => s.selectRouteMarker);
  const region = useApp((s) => s.region);
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setAspect(Math.max(0.2, el.clientWidth / Math.max(1, el.clientHeight)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Regional CTX context outside the grid: same eqc family (lon_0 0, same R), so E_grid = E_regional * cos(lat_ts_grid).
  const context = useMemo(() => {
    if (!regional || meta.central_meridian_deg !== 0 || meta.radius_m !== regional.radius_m) return null;
    const a = regional.meta.assets["science_6m.jpg"];
    const c = Math.cos((meta.lat_ts_deg * Math.PI) / 180);
    const g = mapGeometry(meta);
    const x = g.toX(a.x0 * c);
    return { url: regional.imageUrl, x, y: meta.y0 - a.y0, w: g.toX((a.x0 + a.nx * a.dx) * c) - x, h: a.ny * a.dy };
  }, [regional, meta]);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: number; sx: number; sy: number; view: View; moved: boolean; inverse: DOMMatrix; origin: DOMPoint } | null>(null);
  const [scale, setScale] = useState({ barPx: 0, metres: 500 });
  const [markers, setMarkers] = useState<ScreenMarker[]>([]);

  const orthoUrl = useApp((s) => s.orthoUrl);
  const hillshadeUrl = useApp((s) => s.hillshadeUrl);
  const layers = useApp((s) => s.layers);
  const routes = useApp((s) => s.routes);
  const pois = useApp((s) => s.pois);
  const start = useApp((s) => s.start);
  const goal = useApp((s) => s.goal);
  const selectedPoiId = useApp((s) => s.selectedPoiId);
  const selectedRouteId = useApp((s) => s.selectedRouteId);
  const viewResetToken = useApp((s) => s.viewResetToken);
  const pickProjected = useApp((s) => s.pickProjected);
  const selectPoi = useApp((s) => s.selectPoi);

  useEffect(() => {
    setView(fitView(full, aspect));
  }, [full, viewResetToken, aspect]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const at = userPoint(svg, event.clientX, event.clientY);
      if (!at) return;
      const factor = event.deltaY > 0 ? 1.12 : 1 / 1.12;
      setView((prev) => clampView(zoomAt(prev, (at.x - prev.x) / prev.w, (at.y - prev.y) / prev.h, factor), full, aspect));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [full, aspect]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const ctm = svg.getScreenCTM();
      const groundPerProj = mapGeometry(meta).groundPerUnitX;
      if (!ctm || view.w === 0 || !(groundPerProj > 0)) return;
      const left = new DOMPoint(view.x, view.y).matrixTransform(ctm);
      const right = new DOMPoint(view.x + view.w, view.y).matrixTransform(ctm);
      const pxPerProj = Math.hypot(right.x - left.x, right.y - left.y) / view.w;
      const pxPerMetre = pxPerProj / groundPerProj;
      let metres = 500;
      let barPx = metres * pxPerMetre;
      const limit = Math.max(80, svg.clientWidth * 0.42);
      if (barPx > limit) {
        metres = [200, 100, 50, 20, 10].find((choice) => choice * pxPerMetre <= limit) ?? 10;
        barPx = metres * pxPerMetre;
      }
      setScale({ barPx, metres });
      const rect = svg.getBoundingClientRect();
      const located = pois.flatMap((poi) => {
        const proj = geoToProj(meta, poi.geo);
        const hit = projToCell(meta, proj);
        if (!hit) return [];
        const screen = new DOMPoint(mapGeometry(meta).toX(proj.E), meta.y0 - proj.N).matrixTransform(ctm);
        return [{ poi, cell: hit, x: screen.x - rect.left, y: screen.y - rect.top }];
      });
      const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) < 72;
      setMarkers(located.flatMap((item, index) => {
        if (item.x < -24 || item.y < -24 || item.x > rect.width + 24 || item.y > rect.height + 24) return [];
        const earlier = located.some((other, otherIndex) => otherIndex < index && near(item, other));
        const later = located.some((other, otherIndex) => otherIndex > index && near(item, other));
        const place = earlier ? "right" : later ? "above" : item.x > rect.width * 0.58 ? "left" : "right";
        return [{ ...item, place }];
      }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [meta, pois, view]);

  const slopeUrl = useMemo(() => (layers.slope ? overlayUrl(grid, "slope") : ""), [grid, layers.slope]);
  const validityUrl = useMemo(() => (layers.validity ? overlayUrl(grid, "validity") : ""), [grid, layers.validity]);
  const elevationUrl = useMemo(() => (layers.elevation ? overlayUrl(grid, "elevation") : ""), [grid, layers.elevation]);
  const steepUrl = useMemo(() => (layers.steep ? overlayUrl(grid, "steep") : ""), [grid, layers.steep]);
  const yTop = meta.y0;

  const rms = useRouteMarkers();
  const activeMarker = rms.find((m) => m.id === routeMarkerId) ?? null;
  const planGrid = useApp((s) => s.planGrid) ?? grid, planParams = useApp((s) => s.planParams), gate = useApp((s) => s.slopeGate), referenceRoutes = useApp((s) => s.referenceRoutes);
  const smooth = useMemo(() => { const r = routes[selectedRouteId]; return r && planGrid && selectedRouteId !== "conservative" ? smoothRoute(planGrid, r, selectedRouteId, planParams) : null; }, [routes, selectedRouteId, planGrid, planParams]);
  const gateUrl = useMemo(() => (gate !== null && planGrid ? gateOverlayUrl(planGrid, gate) : ""), [planGrid, gate]);
  // stretches of the selected route on steep ground (measured terrain slope, not the gate): yellow 15-20 deg, red above 20
  const steep = useMemo(() => (grid ? routeTerrain(grid, routes[selectedRouteId]).flatMap((q, k) => (q.cell_slope_deg > 15 ? [{ k, hot: q.cell_slope_deg > 20 }] : [])) : []), [grid, routes, selectedRouteId]);

  // weather layer: the single place a measurement in this build belongs to, the rover's recorded position at Wildcat Ridge
  const medaProj = envLayer === "weather" && meta && wildcat ? geoToProj(meta, { lat: wildcat.lat, lon: wildcat.lon }) : null;
  const medaSite = medaProj && meta && projToCell(meta, medaProj) ? { x: mapGeometry(meta).toX(medaProj.E), y: meta.y0 - medaProj.N } : null;

  function zoomBy(factor: number) {
    setView((prev) => clampView(zoomAt(prev, 0.5, 0.5, factor), full, aspect));
  }

  return (
    <div className="map-stage">
    <div className="map-frame" ref={frameRef}>
      <svg
        ref={svgRef}
        className="map-svg"
        data-testid="map"
        data-ytop={yTop}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Analysis terrain at ground proportions, north up, with regional CTX context outside the grid. Drag to pan, wheel to zoom."
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const inverse = event.currentTarget.getScreenCTM()?.inverse();
          const origin = inverse ? userPoint(event.currentTarget, event.clientX, event.clientY, inverse) : null;
          if (!inverse || !origin) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { id: event.pointerId, sx: event.clientX, sy: event.clientY, view, moved: false, inverse, origin };
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || current.id !== event.pointerId) return;
          if (Math.hypot(event.clientX - current.sx, event.clientY - current.sy) <= 4) return;
          current.moved = true;
          const now = userPoint(event.currentTarget, event.clientX, event.clientY, current.inverse);
          if (!now) return;
          setView(clampView({
            ...current.view,
            x: current.view.x - (now.x - current.origin.x),
            y: current.view.y - (now.y - current.origin.y),
          }, full, aspect));
        }}
        onPointerUp={(event) => {
          const current = drag.current;
          drag.current = null;
          if (!current || current.moved || current.id !== event.pointerId) return;
          const rm = (event.target as Element).closest("[data-rm]");
          if (rm) { selectRouteMarker(rm.getAttribute("data-rm")); return; }
          const at = userPoint(event.currentTarget, event.clientX, event.clientY, current.inverse);
          if (!at) return;
          pickProjected({ E: mapGeometry(meta).toE(at.x), N: yTop - at.y });
        }}
      >
        {context ? <image data-testid="context-image" href={context.url} x={context.x} y={context.y} width={context.w} height={context.h} preserveAspectRatio="none" className="context-image" /> : null}
        <rect className="map-ground" x={full.x} y={0} width={full.w} height={full.h} />
        {layers.ortho && (
          <image
            data-testid="ortho-image"
            href={orthoUrl}
            x={full.x}
            y={0}
            width={full.w}
            height={full.h}
            preserveAspectRatio="none"
          />
        )}
        {layers.hillshade && (
          <image
            data-testid="hillshade-image"
            href={hillshadeUrl}
            x={full.x}
            y={0}
            width={full.w}
            height={full.h}
            preserveAspectRatio="none"
            opacity={layers.ortho ? 0.8 : 1}
            style={{ mixBlendMode: layers.ortho ? "soft-light" : "normal" }}
          />
        )}
        {layers.elevation && elevationUrl && (
          <image data-testid="elevation-image" href={elevationUrl} x={full.x} y={0} width={full.w} height={full.h} preserveAspectRatio="none" className="cell-overlay" />
        )}
        {layers.slope && slopeUrl && (
          <image data-testid="slope-image" href={slopeUrl} x={full.x} y={0} width={full.w} height={full.h} preserveAspectRatio="none" className="cell-overlay" />
        )}
        {layers.steep && steepUrl && (
          <image data-testid="steep-image" href={steepUrl} x={full.x} y={0} width={full.w} height={full.h} preserveAspectRatio="none" className="cell-overlay" />
        )}
        {layers.validity && validityUrl && (
          <image data-testid="validity-image" href={validityUrl} x={full.x} y={0} width={full.w} height={full.h} preserveAspectRatio="none" className="cell-overlay" />
        )}
        <rect className="grid-outline" data-testid="grid-outline" x={full.x} y={0} width={full.w} height={full.h} />
        {gateUrl ? <image data-testid="gate-image" href={gateUrl} x={full.x} y={0} width={full.w} height={full.h} preserveAspectRatio="none" className="cell-overlay" /> : null}
        {referenceRoutes?.terrain?.status === "OK" ? <polyline data-testid="route-reference" className="route-reference" points={routePoints(referenceRoutes.terrain, yTop, mapGeometry(meta).toX)} /> : null}
        <g data-testid="route-steep" data-count={steep.length}>
          {steep.map(({ k, hot }) => { const v = routes[selectedRouteId]!.vertices_proj, toX = mapGeometry(meta).toX; return <line key={k} x1={toX(v[k].E)} y1={yTop - v[k].N} x2={toX(v[k + 1].E)} y2={yTop - v[k + 1].N} className={`route-steep${hot ? " hot" : ""}`} />; })}
        </g>
        <RouteLine route={routes.distance} yTop={yTop} toX={mapGeometry(meta).toX} kind="distance" selected={selectedRouteId === "distance"} />
        <RouteLine route={routes.terrain} yTop={yTop} toX={mapGeometry(meta).toX} kind="terrain" selected={selectedRouteId === "terrain"} />
        <RouteLine route={routes.conservative} yTop={yTop} toX={mapGeometry(meta).toX} kind="conservative" selected={selectedRouteId === "conservative"} />
        {smooth ? <polyline data-testid="route-smooth" className="route-smooth" points={smooth.vertices_proj.map((q) => `${mapGeometry(meta).toX(q.E)},${yTop - q.N}`).join(" ")} /> : null}
        {rms.map((m, i) => {
          const v = routes[selectedRouteId]!.vertices_proj[m.index];
          const x = mapGeometry(meta).toX(v.E), y = yTop - v.N, z = view.w * 0.011;
          return (
            <g key={m.id} data-rm={m.id} data-testid={`route-marker-${m.id}`} className={`route-marker rm-${m.kind}${routeMarkerId === m.id ? " on" : ""}`}>
              <circle cx={x} cy={y} r={z} vectorEffect="non-scaling-stroke" />
              <text x={x} y={y + z * 0.38} fontSize={z * 1.15} textAnchor="middle">{i + 1}</text>
            </g>
          );
        })}
        {medaSite ? (
          <g className="env-site" data-testid="env-meda-site">
            <circle cx={medaSite.x} cy={medaSite.y} r={view.w * 0.012} vectorEffect="non-scaling-stroke" />
            <title>MEDA pressure record, sol 516 (rover position, attributed). One sol at one place: not a weather map.</title>
            <text x={medaSite.x - view.w * 0.02} y={medaSite.y + view.w * 0.005} fontSize={view.w * 0.016} textAnchor="end">MEDA sol 516 record</text>
          </g>
        ) : null}
      </svg>
      <EnvironmentKey />
      <RouteMarkerCard rms={rms} />
      <div className="poi-layer">
        {markers.map((marker) => {
          const role = start && marker.cell.row === start.row && marker.cell.col === start.col
            ? "start"
            : goal && marker.cell.row === goal.row && marker.cell.col === goal.col
              ? "goal"
              : "poi";
          const badges = poiBadges(displayStatus(marker.poi));
          return (
            <div key={marker.poi.id} className="poi" style={{ left: marker.x, top: marker.y }}>
              <button
                type="button"
                className={`poi-hit poi-${role}${selectedPoiId === marker.poi.id ? " poi-on" : ""}`}
                aria-label={`${marker.poi.name}. ${badges.map((badge) => badge.text).join(", ")}`}
                aria-pressed={selectedPoiId === marker.poi.id}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => selectPoi(marker.poi.id)}
              />
              <span className={`poi-tag poi-tag-${marker.place}`}>
                <span className="poi-name" title={marker.poi.name}>{mapLabel(marker.poi.name)}</span>
                {badges.map((badge) => <span key={badge.testId} className="flag" data-testid={badge.testId}>{badge.text}</span>)}
                {role === "start" && <span className="poi-role">START</span>}
                {role === "goal" && <span className="poi-role">GOAL</span>}
              </span>
            </div>
          );
        })}
      </div>
      <div className="hud-tl">
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1 / 1.25)}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1.25)}>−</button>
        <button type="button" aria-label="Full extent" onClick={() => setView(full)}>Fit</button>
      </div>
      <div className="hud-tr" aria-hidden="true">
        <svg className="north" viewBox="0 0 40 58" width="36" height="52">
          <polygon points="20,3 31,30 20,24 9,30" />
          <text x="20" y="50" textAnchor="middle">N</text>
        </svg>
      </div>
      <div className="hud-bl">
        <span className="scale-rule" style={{ width: `${scale.barPx}px` }} />
        <span data-testid="scale-bar">{scale.metres} m</span>
        <span className="fine">ground E–W</span>
      </div>
      <div className="hud-br legend">
        <span><i className="swatch swatch-d" /> Distance</span>
        <span><i className="swatch swatch-t" /> Terrain-aware</span>
        <span><i className="swatch swatch-c" /> Conservative</span>
      </div>
    </div>
    </div>
  );
}

function RouteLine({ route, yTop, toX, kind, selected }: { route: RouteResult | null; yTop: number; toX: (E: number) => number; kind: "distance" | "terrain" | "conservative"; selected: boolean }) {
  if (!route || route.status !== "OK" || route.vertices_proj.length < 2) return null;
  const points = routePoints(route, yTop, toX);
  return (
    <g data-testid={`route-${kind}`}>
      <polyline points={points} className={`route-halo route-${kind}${selected ? " route-selected" : ""}`} />
      <polyline points={points} className={`route-line route-${kind}${selected ? " route-selected" : ""}`} />
    </g>
  );
}

export function layerLabel(layer: keyof LayerToggles): string {
  switch (layer) {
    case "ortho":
      return "CTX ortho";
    case "hillshade":
      return "Hillshade";
    case "elevation":
      return "Elevation";
    case "slope":
      return "Slope";
    case "steep":
      return "Steepness";
    case "validity":
      return "Validity";
    default: {
      const unreachable: never = layer;
      return unreachable;
    }
  }
}
