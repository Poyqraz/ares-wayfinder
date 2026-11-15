// ARES-1 Mission Control dashboard: large regional map + in-view inspector + compact mission cards and tabs.
import { useEffect, useRef, useState } from "react";
import { EnvironmentPanel } from "./EnvironmentPanel.tsx";
import { FeaturePanel } from "./FeaturePanel.tsx";
import { Inspector } from "./Inspector.tsx";
import { ARES1_INTRO, MISSIONS, type MissionId } from "./missions.ts";
import { RegionalCanvas } from "./RegionalCanvas.tsx";
import { regionalGeoToPixel, regionalPixelToGeo } from "./regions.ts";
import { ScienceAtlas } from "./ScienceAtlas.tsx";
import { useApp } from "./store.ts";
import { DestinationForm } from "./ui/DestinationForm.tsx";
import { OrbitalMagnifier } from "./ui/OrbitalMagnifier.tsx";
import type { GroundBounds } from "./ui/magnifier.ts";
import "./ui/ui.css";

type Tab = "destination" | "features" | "atlas" | "zoom" | "environment" | "limits";
const TABS: [Tab, string][] = [["destination", "Destination"], ["features", "Terrain features"], ["atlas", "Atlas & MEDA"], ["zoom", "Zoom tool"], ["environment", "Environment"], ["limits", "Data & limits"]];

export function MissionControl() {
  const regional = useApp((s) => s.regional);
  const regionalState = useApp((s) => s.regionalState);
  const mission = useApp((s) => s.mission);
  const mapFocus = useApp((s) => s.mapFocus);
  const features = useApp((s) => s.features);
  const destinationError = useApp((s) => s.destinationError);
  const m0aState = useApp((s) => s.m0aState);
  const atlasOpen = useApp((s) => s.atlasOpen);
  const setAtlasOpen = useApp((s) => s.setAtlasOpen);
  const selectMission = useApp((s) => s.selectMission);
  const inspectFeature = useApp((s) => s.inspectFeature);
  const inspectSite = useApp((s) => s.inspectSite);
  const base = useApp((s) => s.base);
  const science = useApp((s) => s.science);
  const inspect = useApp((s) => s.inspect);
  const inspectTarget = useApp((s) => s.inspectTarget);
  const selectDestinationGeo = useApp((s) => s.selectDestinationGeo);
  const selectDestinationText = useApp((s) => s.selectDestinationText);
  const setRegion = useApp((s) => s.setRegion);
  const setScene = useApp((s) => s.setScene);
  const [tab, setTab] = useState<Tab>("destination");
  const [selection, setSelection] = useState<GroundBounds | null>(null);
  const side = useRef<HTMLElement>(null);
  useEffect(() => { side.current?.scrollTo({ top: 0 }); }, [inspect]); // a newly opened card is at the top of the panel: bring it into view

  if (atlasOpen) return <ScienceAtlas atlasOnly onBack={() => setAtlasOpen(false)} />;

  const a = regional?.meta.assets["science_6m.jpg"];
  let detail = null;
  if (regional && a && selection) {
    const p0 = regionalGeoToPixel(regional, selection.north, selection.west), p1 = regionalGeoToPixel(regional, selection.south, selection.east);
    const hits = (id: string) => {
      const b = regional.meta.features_px_in_science_6m[id];
      return !!b?.nw && !!b.se && b.nw.x_px < p1.x && b.se.x_px > p0.x && b.nw.y_px < p1.y && b.se.y_px > p0.y;
    };
    detail = (
      <div className="regional-detail" data-testid="regional-detail">
        <p className="fine">{selection.south.toFixed(4)}°–{selection.north.toFixed(4)}° lat, {selection.west.toFixed(4)}°–{selection.east.toFixed(4)}° E</p>
        <svg viewBox={`${p0.x} ${p0.y} ${p1.x - p0.x} ${p1.y - p0.y}`} preserveAspectRatio="none" className="detail-svg"
          style={{ aspectRatio: `${((p1.x - p0.x) * Math.cos((selection.north * Math.PI) / 180)) / Math.max(1e-6, p1.y - p0.y)}` }}>
          <image href={regional.imageUrl} x={0} y={0} width={a.nx} height={a.ny} preserveAspectRatio="none" />
        </svg>
        <div className="row">
          {hits("m0a_analysis") ? <button type="button" data-testid="open-m0a" disabled={m0aState.status !== "ready"} onClick={() => { selectMission("A", false); setRegion("m0a"); setScene("PLANNING"); }}>Open M0–A planning (prototype)</button> : null}
          {hits("roi_a") ? <button type="button" data-testid="open-roi-a" onClick={() => { selectMission(null); setRegion("roi_a"); setScene("PLANNING"); }}>Open ROI-A planning</button> : null}
          {!hits("m0a_analysis") && !hits("roi_a") ? <p className="fine">No analysis grid in this selection: inspect only.</p> : null}
        </div>
      </div>
    );
  }
  return (
    <section className="mc" data-testid="mission-overview">
      <header className="mc-head">
        <div>
          <h2>ARES-1 Mission Control</h2>
          <p className="fine">{ARES1_INTRO}</p>
        </div>
        <div className="row">
          <button type="button" onClick={() => setAtlasOpen(true)} data-testid="open-atlas">Open Science Atlas</button>
          <button type="button" data-testid="mc-open-relief" onClick={() => { useApp.getState().setRelief3d(true); setScene("FLYOVER"); }}>Regional relief 3D (display only)</button>
        </div>
        <nav className="mc-tabs" aria-label="Missions">
          {(Object.keys(MISSIONS) as MissionId[]).map((id) => (
            <button key={id} type="button" aria-pressed={mission === id} data-testid={`mission-tab-${id}`} onClick={() => selectMission(id)}>{MISSIONS[id].shortTitle}</button>
          ))}
        </nav>
      </header>
      <div className="mc-map" data-testid="regional-map">
        {regional ? (
          <RegionalCanvas r={regional} focus={mapFocus} onPickGeo={selectDestinationGeo} onPickMission={(id) => selectMission(id)} onPickFeature={inspectFeature} onPickSite={inspectSite} onPickTarget={inspectTarget} />
        ) : <p data-testid={regionalState.status === "error" ? "regional-unavailable" : undefined}>{regionalState.reason ?? "Checking the regional CTX basemap."}</p>}
        {regional ? <p className="fine mc-caption">{regional.meta.source.product} · USGS / NASA MRO CTX 6 m · version {regional.meta.version} · north up · imagery only, no terrain or hazard information</p> : null}
      </div>
      <aside className="mc-side" ref={side}>
        <Inspector onOpenAtlas={() => setAtlasOpen(true)} onOpenFeatures={() => setTab("features")} />
        <ol className="mc-seq" data-testid="mc-sequence" aria-label="Expedition sequence">
          {base ? <li><button type="button" className="chip-lz" data-testid="open-site-landing_zone" onClick={() => inspectSite("landing_zone")}>Landing zone</button><span>hypothetical · ROI-A grid</span></li> : null}
          {base ? <li><button type="button" className="chip-base" data-testid="open-site-base" onClick={() => inspectSite("base")}>ARES Base</button><span>hypothetical · M0–A grid</span></li> : null}
          <li><button type="button" className="seq-M0" aria-pressed={mission === "M0"} onClick={() => selectMission("M0")}>M0 depot</button><span>route: prototype</span></li>
          <li><button type="button" className="seq-A" aria-pressed={mission === "A"} onClick={() => selectMission("A")}>A delta</button><span>route: prototype</span></li>
          <li><button type="button" className="seq-B" aria-pressed={mission === "B"} onClick={() => selectMission("B")}>B Amalik</button><span>route: prototype</span></li>
          <li><button type="button" className="seq-C" aria-pressed={mission === "C"} onClick={() => selectMission("C")}>C Bright Angel</button><span>inspect only</span></li>
        </ol>
        {base ? (
          <div className="mc-sites" data-testid="mc-sites">
            <span className="fine">Camps (hypothetical):</span>
            <button type="button" className="chip-camp" onClick={() => inspectSite("camp_a")}>Camp Delta</button>
            <button type="button" className="chip-camp" onClick={() => inspectSite("camp_b")}>Camp Neretva</button>
          </div>
        ) : null}
        <div className="mc-cards">
          {(Object.keys(MISSIONS) as MissionId[]).map((id) => {
            const targets = science.filter((t) => t.mission === id);
            return (
              <article key={id} className={`mission-card m-${id}${mission === id ? " on" : ""}`} data-testid="mission-card">
                <div className="inspector-head">
                  <h3>{MISSIONS[id].title}</h3>
                  <button type="button" onClick={() => selectMission(id)} data-testid={`mission-select-${id}`}>Select</button>
                </div>
                <p className="fine">{MISSIONS[id].summary}</p>
                <p className="fine status">{MISSIONS[id].readiness[MISSIONS[id].readiness.length - 1].label}</p>
                {targets.length ? (
                  <div className="chips" data-testid={`targets-${id}`}>
                    {targets.map((t) => <button key={t.id} type="button" className="target-chip" data-testid={`target-chip-${t.id}`} aria-pressed={inspect?.kind === "target" && inspect.id === t.id} onClick={() => inspectTarget(t.id)}>{t.name}</button>)}
                  </div>
                ) : null}
              </article>
            );
          })}
          {features ? (
            <article className="mission-card m-F">
              <h3>Terrain features</h3>
              <p className="fine">Geomorphic observations near the objectives. They are evidence records, not missions and not routing inputs.</p>
              <div className="chips" data-testid="targets-F">
                {features.features.map((ft) => <button key={ft.feature_id} type="button" className="target-chip" data-testid={`target-chip-${ft.feature_id}`} aria-pressed={inspect?.kind === "feature" && inspect.id === ft.feature_id} onClick={() => inspectFeature(ft.feature_id)}>{ft.feature_id} · {Object.values(ft.measurements).some((x) => x != null) ? "measured, review pending" : "literature only"}</button>)}
              </div>
            </article>
          ) : null}
        </div>
        <div className="mc-tablist" role="tablist">
          {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} data-testid={`mc-tab-${id}`} onClick={() => setTab(id)}>{label}</button>)}
        </div>
        <div className="mc-tabpanel" role="tabpanel">
          {tab === "destination" ? (
            <>
              <p className="fine">Type a coordinate or click the map. Both use the same validated selection pipeline.</p>
              <DestinationForm onSubmit={selectDestinationText} error={destinationError} />
            </>
          ) : null}
          {tab === "features" ? (features ? <FeaturePanel data={features} /> : <p className="fine">Terrain-feature layer not loaded.</p>) : null}
          {tab === "atlas" ? (
            <div>
              <p className="fine">Source-backed records: 10 depot tubes, outcrops and cores, nine Bright Angel claims, and the historical MEDA sol 516 pressure record (rover-local, not a forecast).</p>
              <button type="button" onClick={() => setAtlasOpen(true)}>Open the records and the MEDA chart</button>
            </div>
          ) : null}
          {tab === "zoom" && regional && a ? (
            <>
              <p className="regional-help" data-testid="magnifier-help">Drag a rectangle on the small map: the detail view shows native 6 m CTX pixels and offers planning when it touches ROI-A or M0–A.</p>
              <div style={{ ["--ar" as string]: `${(a.nx * Math.cos((regionalPixelToGeo(regional, a.nx / 2, a.ny / 2).lat * Math.PI) / 180)) / a.ny}` }} className="regional">
                <OrbitalMagnifier imageUrl={regional.imageUrl}
                  bounds={{ west: regionalPixelToGeo(regional, 0, 0).lon, east: regionalPixelToGeo(regional, a.nx, a.ny).lon, north: regionalPixelToGeo(regional, 0, 0).lat, south: regionalPixelToGeo(regional, a.nx, a.ny).lat }}
                  northUp resolution="native-ctx" scaleLabel={`${a.dx} m per pixel`} validatedDataset={false}
                  disabledReason="Planning opens from the detail view below."
                  pixelToGround={(p) => regionalPixelToGeo(regional, (p.x / p.width) * a.nx, (p.y / p.height) * a.ny)} onSelectRect={setSelection} />
              </div>
              {detail}
            </>
          ) : null}
          {tab === "environment" ? <EnvironmentPanel /> : null}
          {tab === "limits" ? (
            <ul className="fine">
              <li>Positions are rover positions or approximate waypoints, never exact tube or rock points.</li>
              <li>Routing exists only inside validated analysis grids: ROI-A (CTX 20 m demo) and M0–A (HiRISE 2 m prototype corridor), and the wider M0–A–B grid that reaches Amalik (same source and gates). C (Bright Angel) has none.</li>
              <li>CTX/HiRISE image alignment ≈ 1 m; DEM registration (G1/S-4), vertical datum and the walking cost model (S6) remain open.</li>
              <li>No radiation, dust, temperature, mineral or weather surfaces are shown: no validated spatial data exist at this scale.</li>
              <li>F01 is an automated measurement awaiting geology review; F02/F03 are literature only.</li>
            </ul>
          ) : null}
        </div>
      </aside>
    </section>
  );
}
