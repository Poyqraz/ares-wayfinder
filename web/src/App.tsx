import { lazy, Suspense, useEffect } from "react";
import type { SceneId } from "@ares/contracts";
import { CONTRACT_VERSION } from "@ares/contracts";
import { Workbench } from "./panels.tsx";
import { BExplore } from "./BExplore.tsx";
import { isExplore } from "./missions.ts";
import { MissionControl } from "./MissionControl.tsx";
import { EvaHud } from "./EvaHud.tsx";
import { OrbitalScene, ProvenanceScene } from "./Scenes.tsx";
import { bGridMissing, SCENES, useApp } from "./store.ts";
const TerrainView = lazy(() => import("./TerrainView.tsx").then((mod) => ({ default: mod.TerrainView })));

const SCENE_LABEL: Record<SceneId, string> = {
  ORBITAL: "Orbital",
  MISSION_CONTROL: "Mission control",
  PLANNING: "Planning",
  FLYOVER: "3D terrain",
  EVA_HUD: "EVA HUD",
  PROVENANCE: "Provenance",
};

export function App() {
  const status = useApp((s) => s.status);
  useEffect(() => {
    void useApp.getState().load();
    void useApp.getState().loadExtras();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (tag === "BUTTON" && event.key === " ") return;
      if (event.key === " ") {
        if (useApp.getState().scene === "FLYOVER") return;
        event.preventDefault();
        useApp.getState().step(1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        useApp.getState().step(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        useApp.getState().step(-1);
      } else if ((event.key === "r" || event.key === "R") && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        useApp.getState().resetDemo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="shell">
      <Header />
      {status === "error" ? <ErrorScreen /> : status !== "ready" ? <Loading /> : <SceneBody />}
      <Footer />
    </div>
  );
}

function Header() {
  const scene = useApp((s) => s.scene);
  const meta = useApp((s) => s.meta);
  const setScene = useApp((s) => s.setScene);
  const region = useApp((s) => s.region);
  const gate = useApp((s) => s.slopeGate);
  return (
    <header className="top">
      <div>
        <p className="word">ARES <b>WAYFINDER</b></p>
        <p className="fine">ARES-1, a hypothetical crewed expedition to Jezero crater</p>
      </div>
      <nav className="scenes" aria-label="Scenes">
        {SCENES.map((id) => (
          <button key={id} type="button" aria-current={scene === id ? "page" : undefined} onClick={() => setScene(id)}>
            {SCENE_LABEL[id]}
          </button>
        ))}
      </nav>
      <div className="chips">
        <span className="chip" title={`contract ${meta?.contract_version ?? CONTRACT_VERSION}`}>Terrain: {region === "m0a" ? `${meta?.roi_id === "m0ab" ? "M0–A–B" : "M0–A"} HiRISE 2 m` : "ROI-A CTX 20 m"} ({meta?.dataset_version ?? "…"})</span>
        {gate === null ? null : <span className="chip chip-exp" data-testid="route-mode">Routes: EXPERIMENTAL {gate}° terrain gate</span>}
        <span className="chip">Real NASA/USGS data, offline</span>
      </div>
    </header>
  );
}

function SceneBody() {
  const scene = useApp((s) => s.scene);
  const mission = useApp((s) => s.mission);
  const noGrid = useApp(bGridMissing);
  switch (scene) {
    case "ORBITAL":
      return <OrbitalScene />;
    case "MISSION_CONTROL":
      return <MissionControl />;
    case "PLANNING":
      return isExplore(mission) || noGrid ? <BExplore key={mission} id={mission as "B" | "C"} /> : <Workbench planning />;
    case "FLYOVER":
      return (
        <Suspense fallback={<section className="sheet"><p>Loading the terrain preview.</p></section>}>
          <TerrainView />
        </Suspense>
      );
    case "EVA_HUD":
      return <EvaHud />;
    case "PROVENANCE":
      return <ProvenanceScene />;
    default: {
      const unreachable: never = scene;
      return unreachable;
    }
  }
}

function Loading() {
  return (
    <section className="sheet">
      <h2>Checking the bundle</h2>
      <p>Reading ROI-A and the CTX overview, then comparing SHA-256 to the manifest, the index, and the overview sidecar.</p>
    </section>
  );
}

function ErrorScreen() {
  const error = useApp((s) => s.error);
  return (
    <section className="sheet error-screen" data-testid="integrity-error">
      <h1>{error?.kind ?? "DATASET INTEGRITY"}</h1>
      <p>{error?.detail}</p>
      <p>No route was planned. No substitute terrain is shown.</p>
      <button type="button" onClick={() => void useApp.getState().load(true)}>Retry the same files</button>
    </section>
  );
}

function Footer() {
  const scene = useApp((s) => s.scene);
  const region = useApp((s) => s.region);
  const mission = useApp((s) => s.mission);
  const relief3d = useApp((s) => s.relief3d);
  const keys = scene === "FLYOVER"
    ? "Left and Right change scene. Space plays and pauses the flyover. R restores the demo route."
    : "Left and Right change scene. Space advances. R restores the demo route.";
  return (
    <footer className="foot">
      <p data-testid="footer-credit">{relief3d && scene === "FLYOVER"
        ? "Data: USGS TRN CTX DTM 20 m (display-only regional relief, 40 m) and the controlled CTX 6 m orthomosaic (NASA MRO / USGS Astrogeology). Not for routing."
        : isExplore(mission)
        ? `Data: NASA MRO CTX controlled orthomosaic (USGS Astrogeology, Mars 2020 TRN) and ARES-1 catalog (NASA/PDS). Imagery only at ${mission}; no terrain analysis.`
        : region === "m0a"
        ? "Data: NASA MRO HiRISE DTM and orthomosaic (USGS Astrogeology, Mars 2020 TRN), MRO CTX controlled mosaic, ARES-1 catalog (NASA/PDS). Historical data, prototype analysis."
        : "Data: NASA MRO CTX (USGS/PDS; Mangold et al. 2021). Historical data, simulated mission preview."}</p>
      <p className="fine" data-testid="key-help">{keys}</p>
    </footer>
  );
}
