// S7 scenes: Orbital (regional entry), EVA HUD (simulated route preview) and the datasets table for Provenance.
import { ARES1_INTRO } from "./missions.ts";
import { Provenance } from "./panels.tsx";
import { RegionalCanvas } from "./RegionalCanvas.tsx";
import { regionalPixelToGeo } from "./regions.ts";
import { useApp } from "./store.ts";

const STEPS = [
  "Meet the expedition: a hypothetical crewed mission built on Perseverance's real records.",
  "Compare the landing zone and base candidates.",
  "Choose a science mission: M0 sample recovery, A Western Delta, B Amalik, C Bright Angel.",
  "Plan a route where validated terrain exists, then read its markers.",
  "Review the terrain in 3D and the evidence in the Science Atlas.",
];

export function OrbitalScene() {
  const regional = useApp((s) => s.regional);
  const mapFocus = useApp((s) => s.mapFocus);
  const setScene = useApp((s) => s.setScene);
  const selectMission = useApp((s) => s.selectMission);
  const inspectSite = useApp((s) => s.inspectSite);
  const inspectFeature = useApp((s) => s.inspectFeature);
  const selectDestinationGeo = useApp((s) => s.selectDestinationGeo);
  const inspectTarget = useApp((s) => s.inspectTarget);
  const go = (fn: () => void) => { fn(); setScene("MISSION_CONTROL"); };
  // ground-true width over height of the mosaic (CR-005), so the map box matches it and no empty bands are drawn
  const a = regional?.meta.assets["science_6m.jpg"];
  const asp = regional && a ? (a.nx * Math.cos((regionalPixelToGeo(regional, a.nx / 2, a.ny / 2).lat * Math.PI) / 180)) / a.ny : 1;
  return (
    <section className="orbital-s7" data-testid="orbital-scene">
      <div className="orbital-map" style={{ aspectRatio: asp }}>
        {regional ? <RegionalCanvas r={regional} focus={mapFocus} testId="orbital-svg" onPickGeo={(a, b) => go(() => selectDestinationGeo(a, b))}
          onPickMission={(id) => go(() => selectMission(id))} onPickSite={(k) => go(() => inspectSite(k))} onPickFeature={(id) => go(() => inspectFeature(id))} onPickTarget={(id) => go(() => inspectTarget(id))} />
          : <p>Checking the regional CTX basemap.</p>}
      </div>
      <aside className="orbital-side">
        <h1>Jezero crater, Mars</h1>
        <p>{ARES1_INTRO}</p>
        <ol className="steps">{STEPS.map((t) => <li key={t}>{t}</li>)}</ol>
        <div className="row">
          <button type="button" className="primary" data-testid="enter-mission-control" onClick={() => setScene("MISSION_CONTROL")}>Open Mission Control</button>
          <button type="button" onClick={() => { useApp.getState().setRelief3d(true); setScene("FLYOVER"); }}>Regional relief 3D</button>
        </div>
        <p className="fine">Map: USGS controlled CTX mosaic, 6 m per pixel, north up. Select any marker to open it in Mission Control.</p>
      </aside>
    </section>
  );
}

export function ProvenanceScene() {
  const roiA = useApp((s) => s.roiA);
  const m0a = useApp((s) => s.m0a);
  const m0ab = useApp((s) => s.m0ab);
  const regional = useApp((s) => s.regional);
  const features = useApp((s) => s.features);
  const base = useApp((s) => s.base);
  const rows: [string, string, string, string][] = [
    ["ROI-A terrain", roiA?.meta.dataset_version ?? "not loaded", "JPL CTX DEM 20 m and CTX ortho 5 m (MRO/CTX; Mangold et al. 2021)", "Routing demo. DEM/image registration unresolved (S-4)."],
    ["M0–A terrain", m0a?.meta.dataset_version ?? "not loaded", "USGS HiRISE DTM soc_006 1 m, averaged to 2 m; HiRISE ortho", "Prototype routing. Vertical datum unverified."],
    ["M0–A–B terrain (wider grid)", m0ab?.meta.dataset_version ?? "not loaded", "Same source and method; contains the M0–A grid cell for cell", "Prototype routing for mission B. Approved for prototype analysis, 15 Nov 2026."],
    ["Regional basemap", regional?.meta.version ?? "not loaded", "USGS controlled CTX orthomosaic soc_008, 6 m", "Imagery only."],
    ["Regional relief", "5c4dd158f4cf", "USGS TRN CTX DTM 20 m, averaged to 40 m", "Display only. Registration unresolved, datum unverified."],
    ["ARES-1 science catalog", "572fba1ce61f", "PDS Three Forks depot tables, PDS Initial Reports, NASA MMGIS, PDS MEDA", "Historical records; rover positions, not tube or rock points."],
    ["Terrain features F01–F03", features?.version ?? "not loaded", "CTX soc_008, HiRISE DTM and ortho soc_006", "F01 automated, geology review pending; F02, F03 literature only."],
    ["Landing zone, base, camps", base?.version ?? "not loaded", "Computed from the regional relief and M0–A grids", "Hypothetical scenario; slope only; not NASA-evaluated."],
  ];
  return (
    <section className="sheet prov" data-testid="provenance-scene">
      <h2>Data in this build</h2>
      <p className="fine">Every dataset is checked against its recorded SHA-256 before use. The app makes no network requests.</p>
      <table className="conditions" data-testid="dataset-table">
        <thead><tr><th>Dataset</th><th>Version</th><th>Source</th><th>Use and limit</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r[0]}><th>{r[0]}</th><td><code>{r[1]}</code></td><td>{r[2]}</td><td>{r[3]}</td></tr>)}</tbody>
      </table>
      <h2>Open scientific limits</h2>
      <ul className="fine">
        <li>Route costs use an Earth walking model (Minetti); not validated for suited Mars EVA. The 24.2° cutoff is an algorithm threshold.</li>
        <li>DEM registration and vertical datum are unverified; routes are candidate corridors, not surveyed paths.</li>
        <li>No radiation, dust, thermal or weather surface exists for Jezero in this build. MEDA is one rover-local historical record.</li>
        <li>B (Amalik) is routed on a wider HiRISE grid, approved for prototype analysis like the M0–A grid. C (Bright Angel) has no validated terrain: inspection only.</li>
      </ul>
      <Provenance />
    </section>
  );
}
