// Zoomable regional CTX map (eqc lat_ts 0). Content is drawn in image pixels inside a group scaled by cos(lat) in x,
// so the display has ground-true proportions (CR-005). Clicks on markers are told apart from clicks on the ground.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { SITE_LABEL, type SiteKey } from "./base.ts";
import { missionPoint, MISSION_IDS, MISSIONS, type MissionId } from "./missions.ts";
import { regionalGeoToPixel, regionalPixelToGeo, type LoadedRegional } from "./regions.ts";
import { useApp } from "./store.ts";

type View = { x: number; y: number; w: number; h: number };
export interface ExtraPoint { id: string; label: string; lat: number; lon: number }


export function RegionalCanvas({ r, focus, onPickGeo, onPickMission, onPickFeature, onPickSite, onPickTarget, extra = [], testId = "regional-svg" }: {
  r: LoadedRegional;
  focus: { lat: number; lon: number; radius_m: number; token: number } | null;
  onPickGeo: (lat: number, lon: number) => void;
  onPickMission?: (id: MissionId) => void;
  onPickFeature?: (id: string) => void;
  onPickSite?: (key: SiteKey) => void;
  onPickTarget?: (id: string) => void;
  extra?: ExtraPoint[];
  testId?: string;
}) {
  const a = r.meta.assets["science_6m.jpg"];
  const kx = Math.cos((regionalPixelToGeo(r, a.nx / 2, a.ny / 2).lat * Math.PI) / 180);
  const U = a.nx * kx, V = a.ny;
  const groundPerUnit = a.dy; // 1 unit = 6 m on the ground in both axes
  const box = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(U / V);
  const [cw, setCw] = useState(1000);
  const [view, setView] = useState<View>({ x: 0, y: 0, w: U, h: V });
  const drag = useRef<{ id: number; sx: number; sy: number; view: View; moved: boolean } | null>(null);
  const mission = useApp((s) => s.mission);
  const destination = useApp((s) => s.destination);
  const features = useApp((s) => s.features);
  const inspect = useApp((s) => s.inspect);
  const sites = useApp((s) => s.base?.scenario.sites);
  const m0aOrtho = useApp((s) => s.m0a?.orthoUrl);
  const wide = useApp((s) => s.m0ab);
  const science = useApp((s) => s.science);
  const [legend, setLegend] = useState(() => window.innerWidth >= 1200); // on small screens the legend starts folded so it does not cover the map

  const fit = (asp: number): View => (U / V > asp ? { x: 0, y: (V - U / asp) / 2, w: U, h: U / asp } : { x: (U - V * asp) / 2, y: 0, w: V * asp, h: V });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const asp = el.clientWidth / Math.max(1, el.clientHeight);
      setAspect(asp);
      setCw(el.clientWidth);
      setView((v) => ({ ...v, h: v.w / asp }));
    });
    ro.observe(el);
    const asp = el.clientWidth / Math.max(1, el.clientHeight);
    setAspect(asp);
    setView(fit(asp));
    return () => ro.disconnect();
  }, [U, V]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!focus) return;
    const p = regionalGeoToPixel(r, focus.lat, focus.lon);
    const w = (2 * focus.radius_m) / groundPerUnit;
    setView({ x: p.x * kx - w / 2, y: p.y - w / aspect / 2, w, h: w / aspect });
  }, [focus?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const toUnits = (svg: SVGSVGElement, cx: number, cy: number) => {
    const rect = svg.getBoundingClientRect();
    return { u: view.x + ((cx - rect.left) / rect.width) * view.w, v: view.y + ((cy - rect.top) / rect.height) * view.h };
  };
  useEffect(() => {
    const svg = box.current?.querySelector("svg");
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      setView((v) => {
        const rect = svg.getBoundingClientRect();
        const fu = (e.clientX - rect.left) / rect.width, fv = (e.clientY - rect.top) / rect.height;
        const w = Math.min(Math.max(v.w * f, 40), U * 1.5), h = w / aspect;
        return { x: v.x + fu * (v.w - w), y: v.y + fv * (v.h - h), w, h };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [aspect, U]);

  const q = (0.5 * view.w) / Math.max(1, cw); // content units per half screen pixel: markers keep their screen size at any zoom
  const f = r.meta.features_px_in_science_6m;
  const dest = destination ? regionalGeoToPixel(r, destination.lat, destination.lon) : null;
  const metres = useMemo(() => [5000, 2000, 1000, 500, 200, 100, 50].find((m) => m / groundPerUnit <= view.w * 0.22) ?? 50, [view.w, groundPerUnit]);
  const onUp = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || d.id !== e.pointerId) return;
    // the svg captured the pointer on press, so the event's own target is the svg: ask which element is under the pointer
    const hit = (document.elementFromPoint(e.clientX, e.clientY) ?? (e.target as Element)).closest("[data-target],[data-mission],[data-feature],[data-site]");
    if (hit?.getAttribute("data-target")) return onPickTarget?.(hit.getAttribute("data-target")!);
    if (hit?.getAttribute("data-site")) return onPickSite?.(hit.getAttribute("data-site") as SiteKey);
    if (hit?.getAttribute("data-mission")) return onPickMission?.(hit.getAttribute("data-mission") as MissionId);
    if (hit?.getAttribute("data-feature")) return onPickFeature?.(hit.getAttribute("data-feature")!);
    const { u, v } = toUnits(e.currentTarget, e.clientX, e.clientY);
    const g = regionalPixelToGeo(r, u / kx, v);
    onPickGeo(g.lat, g.lon);
  };
  const rect = (id: string, cls: string, label: string, img?: string) => {
    const b = f[id];
    if (!b?.nw || !b.se) return null;
    const detail = !!img && view.w * groundPerUnit < 6000; // closer than 6 km across: draw the validated 1 m ortho over the 6 m mosaic
    return (
      <g key={id} data-testid={`regional-${id}`}>
        {detail ? <image data-testid={`regional-${id}-detail`} href={img} x={b.nw.x_px} y={b.nw.y_px} width={b.se.x_px - b.nw.x_px} height={b.se.y_px - b.nw.y_px} preserveAspectRatio="none" /> : null}
        <rect className={detail ? `${cls} detail` : cls} x={b.nw.x_px} y={b.nw.y_px} width={b.se.x_px - b.nw.x_px} height={b.se.y_px - b.nw.y_px} vectorEffect="non-scaling-stroke" />
        {view.w < U * 0.6 || id === "roi_a" ? <text x={b.nw.x_px} y={b.nw.y_px - 10 * q} fontSize={22 * q} className="regional-label">{id === "roi_a" && view.w >= U * 0.6 ? "ROI-A" : detail ? `HiRISE 1 m imagery · ${label}` : label}</text> : null}
      </g>
    );
  };
  return (
    <div className="rc-box" ref={box}>
      <svg data-testid={testId} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="none" role="img"
        aria-label="Controlled CTX orthomosaic, north up, ground proportions. Wheel to zoom, drag to pan, click to inspect."
        onPointerDown={(e) => { if (e.button === 0) { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, view, moved: false }; } }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) <= 4) return;
          d.moved = true;
          const rc = e.currentTarget.getBoundingClientRect();
          setView({ ...d.view, x: d.view.x - ((e.clientX - d.sx) / rc.width) * d.view.w, y: d.view.y - ((e.clientY - d.sy) / rc.height) * d.view.h });
        }}
        onPointerUp={onUp}>
        <g transform={`scale(${kx} 1)`}>
          <image href={r.imageUrl} x={0} y={0} width={a.nx} height={a.ny} preserveAspectRatio="none" />
          {rect("roi_a", "regional-roi", "ROI-A engineering demo (CTX 20 m)")}
          {wide ? (() => { // the wider grid that reaches Amalik: drawn first, so the frozen M0-A box lies on top of it
            const b = wide.meta.bounds_geo, nw = regionalGeoToPixel(r, b.lat_max, b.lon_min), se = regionalGeoToPixel(r, b.lat_min, b.lon_max), detail = view.w * groundPerUnit < 6000;
            return (
              <g data-testid="regional-m0ab_analysis">
                {detail ? <image data-testid="regional-m0ab_analysis-detail" href={wide.orthoUrl} x={nw.x} y={nw.y} width={se.x - nw.x} height={se.y - nw.y} preserveAspectRatio="none" /> : null}
                <rect className={`regional-m0a regional-m0ab${detail ? " detail" : ""}`} x={nw.x} y={nw.y} width={se.x - nw.x} height={se.y - nw.y} vectorEffect="non-scaling-stroke" />
                {view.w < U * 0.6 ? <text x={nw.x} y={se.y + 26 * q} fontSize={22 * q} className="regional-label">M0–A–B wider grid (HiRISE 2 m, prototype)</text> : null}
              </g>
            );
          })() : null}
          {rect("m0a_analysis", "regional-m0a", "M0–A analysis grid (HiRISE 2 m, prototype)", m0aOrtho)}
          {(features?.features ?? []).map((ft) => {
            const p = regionalGeoToPixel(r, ft.anchor.lat, ft.anchor.lon), z = 13 * q;
            const on = inspect?.kind === "feature" && inspect.id === ft.feature_id;
            return (
              <g key={ft.feature_id} data-feature={ft.feature_id} data-testid={`regional-feature-${ft.feature_id}`} className="clickable">
                <polygon points={`${p.x},${p.y - z} ${p.x + z},${p.y} ${p.x},${p.y + z} ${p.x - z},${p.y}`} className={`regional-feature${on ? " on" : ""}`} vectorEffect="non-scaling-stroke" />
                <text x={p.x + z * 1.3} y={p.y + z * 1.6} fontSize={20 * q} className="regional-label">{view.w < U * 0.6 || ft.feature_id !== "F01" ? ft.feature_id : ""}</text>
              </g>
            );
          })}
          {MISSION_IDS.map((id) => {
            const at = missionPoint(id, r);
            if (!at) return null;
            const g = regionalGeoToPixel(r, at.lat, at.lon), p = { x_px: g.x, y_px: g.y };
            const on = mission === id;
            return (
              <g key={id} data-mission={id} data-testid={`regional-waypoint-${id}`} className="clickable">
                <circle cx={p.x_px} cy={p.y_px} r={16 * q} className={`regional-wp wp-${id}${on ? " on" : ""}`} vectorEffect="non-scaling-stroke" />
                {/* at regional zoom the base, M0 and A sit within 400 m: one cluster label is drawn at the base instead */}
                {(id === "C" || !sites || view.w < U * 0.45) && view.w * groundPerUnit >= (id === "M0" ? 420 : 2500) ? <text x={p.x_px + 22 * q} y={p.y_px - 10 * q} fontSize={28 * q} className="regional-label strong">{MISSIONS[id].shortTitle}</text> : null}
              </g>
            );
          })}
          {sites ? (() => {
            const px = (k: SiteKey) => regionalGeoToPixel(r, sites[k].lat, sites[k].lon);
            const b = px("base"), lz = px("landing_zone"), ca = px("camp_a"), cb = px("camp_b");
            const on = (k: SiteKey) => (inspect?.kind === "site" && inspect.key === k ? " on" : "");
            const tri = (p: { x: number; y: number }, z: number) => `${p.x},${p.y - z} ${p.x + z},${p.y + z * 0.8} ${p.x - z},${p.y + z * 0.8}`;
            return (
              <g data-testid="regional-sites">
                {/* no line is drawn between sites: nothing connects them over validated terrain */}
                <g data-site="landing_zone" data-testid="site-landing_zone" className="clickable">
                  <ellipse cx={lz.x} cy={lz.y} rx={sites.landing_zone.radius_m / (a.dx * kx)} ry={sites.landing_zone.radius_m / a.dy} className={`site-lz${on("landing_zone")}`} vectorEffect="non-scaling-stroke" />
                  <text x={lz.x + 18 * q} y={lz.y + 6 * q} fontSize={24 * q} className="regional-label site-text">{SITE_LABEL.landing_zone}</text>
                </g>
                <g data-site="camp_b" data-testid="site-camp_b" className="clickable">
                  <polygon points={tri(cb, 13 * q)} className={`site-camp provisional${on("camp_b")}`} vectorEffect="non-scaling-stroke" />
                  <text x={cb.x + 18 * q} y={cb.y + 6 * q} fontSize={22 * q} className="regional-label site-text">{SITE_LABEL.camp_b} (provisional)</text>
                </g>
                <g data-site="camp_a" data-testid="site-camp_a" className="clickable">
                  <polygon points={tri(ca, 11 * q)} className={`site-camp${on("camp_a")}`} vectorEffect="non-scaling-stroke" />
                  {view.w < U * 0.45 ? <text x={ca.x - 20 * q} y={ca.y + 34 * q} fontSize={20 * q} className="regional-label site-text">{SITE_LABEL.camp_a}</text> : null}
                </g>
                <g data-site="base" data-testid="site-base" className="clickable">
                  <rect x={b.x - 12 * q} y={b.y - 12 * q} width={24 * q} height={24 * q} className={`site-base${on("base")}`} vectorEffect="non-scaling-stroke" />
                  <text x={b.x + 20 * q} y={b.y + 30 * q} fontSize={28 * q} className="regional-label strong site-text">{view.w < U * 0.45 ? SITE_LABEL.base : "ARES Base · M0 · A · B"}</text>
                </g>
              </g>
            );
          })() : null}
          {view.w * groundPerUnit < 4000 ? (
            <g data-testid="regional-targets" data-count={science.filter((t) => !t.marker).length}>
              {science.filter((t) => !t.marker).map((t) => {
                const p = regionalGeoToPixel(r, t.lat, t.lon), z = (t.kind === "sample" ? 6 : 9) * q, wide = view.w * groundPerUnit;
                const on = inspect?.kind === "target" && (inspect.id === t.id || science.some((x) => x.id === inspect.id && x.marker === t.id));
                const label = t.kind === "sample" ? wide < 420 : wide < 2500;
                return (
                  <g key={t.id} data-target={t.id} data-testid={`target-${t.id}`} className={`clickable target t-${t.mission}${on ? " on" : ""}${mission && mission !== t.mission ? " dim" : ""}`}>
                    {t.kind === "sample" ? <circle cx={p.x} cy={p.y} r={z} vectorEffect="non-scaling-stroke" />
                      : t.kind === "outcrop" ? <polygon points={[0, 60, 120, 180, 240, 300].map((d) => `${p.x + (z * Math.cos((d * Math.PI) / 180)) / kx},${p.y + z * Math.sin((d * Math.PI) / 180)}`).join(" ")} vectorEffect="non-scaling-stroke" />
                      : <rect x={p.x - z / kx} y={p.y - z} width={(2 * z) / kx} height={2 * z} vectorEffect="non-scaling-stroke" />}
                    {label ? <text x={p.x + (z * 1.5) / kx} y={p.y + z * 0.5} fontSize={(t.kind === "sample" ? 20 : 24) * q} className="regional-label">{t.kind === "rock" ? `${t.name} · ${science.filter((x) => x.marker === t.id).map((x) => x.name).join(", ")}` : t.name}</text> : null}
                  </g>
                );
              })}
            </g>
          ) : null}
          {extra.map((e) => {
            const p = regionalGeoToPixel(r, e.lat, e.lon);
            return (
              <g key={e.id} data-testid={`regional-extra-${e.id}`}>
                <rect x={p.x - 7 * q} y={p.y - 7 * q} width={14 * q} height={14 * q} className="regional-extra" vectorEffect="non-scaling-stroke" />
                <text x={p.x + 12 * q} y={p.y + 20 * q} fontSize={18 * q} className="regional-label">{e.label}</text>
              </g>
            );
          })}
          {dest ? <circle data-testid="regional-destination" cx={dest.x} cy={dest.y} r={11 * q} className="regional-dest" vectorEffect="non-scaling-stroke" /> : null}
        </g>
        <g data-testid="regional-scale" data-metres={metres}>
          <line x1={view.x + view.w * 0.03} y1={view.y + view.h * 0.95} x2={view.x + view.w * 0.03 + metres / groundPerUnit} y2={view.y + view.h * 0.95} stroke="#fff" strokeWidth={3} vectorEffect="non-scaling-stroke" />
          <text x={view.x + view.w * 0.03} y={view.y + view.h * 0.93} fontSize={view.w * 0.018} className="regional-label">{metres >= 1000 ? `${metres / 1000} km` : `${metres} m`} (ground)</text>
        </g>
      </svg>
      <div className="rc-tools">
        <button type="button" onClick={() => setView(fit(aspect))} data-testid="regional-reset">Fit region</button>
        <span className="fine">Scroll to zoom, drag to pan, click to inspect</span>
      </div>
      <details className="rc-legend" data-testid="map-legend" open={legend} onToggle={(e) => setLegend(e.currentTarget.open)}>
        <summary>Legend</summary>
        <ul>
          <li><i className="lg lg-m0" /> M0 depot sample: rover position at the drop (PDS)</li>
          <li><i className="lg lg-a" /> A outcrop: rover position at sampling (PDS)</li>
          <li><i className="lg lg-b" /> B Amalik outcrop: rover position at sampling (PDS)</li>
          <li><i className="lg lg-c" /> C rock and core: rover position at sampling (PDS)</li>
          <li><i className="lg lg-f" /> Terrain feature F01–F03: anchor waypoint</li>
          <li><i className="lg lg-site" /> Hypothetical ARES-1 site: not a NASA location</li>
          <li><i className="lg lg-grid" /> Dashed box: terrain grid where a route can be computed</li>
        </ul>
        <p className="fine">Zoom in to see individual targets. Areas without validated terrain between them are not joined by any line.</p>
      </details>
    </div>
  );
}
