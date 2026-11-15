// Inspection mode for the two missions without a route: B Amalik and C Bright Angel. Regional imagery, markers and
// science records; routing and detailed 3D are not available, and the reason is stated.
import { useEffect, useState } from "react";
import { loadAres1Catalog } from "./ares1.ts";
import { Inspector } from "./Inspector.tsx";
import { MISSIONS } from "./missions.ts";
import { RegionalCanvas, type ExtraPoint } from "./RegionalCanvas.tsx";
import { RegionSelector } from "./panels.tsx";
import { useApp } from "./store.ts";

async function bytes(url: string): Promise<Uint8Array | null> {
  const r = await fetch(url);
  return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
}

export function BExplore({ id }: { id: "B" | "C" }) {
  const regional = useApp((s) => s.regional);
  const mapFocus = useApp((s) => s.mapFocus);
  const selectDestinationGeo = useApp((s) => s.selectDestinationGeo);
  const inspectFeature = useApp((s) => s.inspectFeature);
  const selectMission = useApp((s) => s.selectMission);
  const setAtlasOpen = useApp((s) => s.setAtlasOpen);
  const setScene = useApp((s) => s.setScene);
  const [extra, setExtra] = useState<ExtraPoint[]>([]);
  const [claims, setClaims] = useState<{ id: string; kind: string; confidence: string }[]>([]);
  const m = MISSIONS[id];

  useEffect(() => {
    if (!mapFocus && regional) selectMission(id);
    if (id !== "C") return; // the Bright Angel claims and the Sapphire Canyon position belong to C only
    let cancel = false;
    void loadAres1Catalog(bytes).then((res) => {
      if (cancel || !res.ok) return;
      const sapphire = res.catalog.samples.find((s) => s.sample_designation === "M2020-01215-28") as unknown as
        { sampling_event?: { rover_position?: { lat_deg: number; lon_deg_east: number } } } | undefined;
      const rp = sapphire?.sampling_event?.rover_position;
      if (rp) setExtra([{ id: "sapphire", label: "Sapphire Canyon sampling rover position", lat: rp.lat_deg, lon: rp.lon_deg_east }]);
      setClaims(res.catalog.claims.map((c) => ({ id: c.id.replace("claim:", ""), kind: c.evidence_kind, confidence: c.confidence })));
    });
    return () => { cancel = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="work bx" data-testid="explore-view" data-explore={id}>
      <div className="map-col">
        <RegionSelector />
        <div className="bx-map">
          {regional ? <RegionalCanvas r={regional} focus={mapFocus} extra={extra} onPickGeo={selectDestinationGeo} onPickFeature={inspectFeature}
            onPickMission={(pick) => selectMission(pick)} onPickSite={useApp.getState().inspectSite} onPickTarget={useApp.getState().inspectTarget} testId="explore-map" /> : <p>Checking the regional CTX basemap.</p>}
        </div>
        <p className="fine">{id === "B"
          ? "B inspection on the controlled CTX 6 m mosaic (imagery only). The wider terrain grid is unavailable, so no route is drawn to B."
          : "C exploration on the controlled CTX 6 m mosaic (imagery only). No route is drawn at C."}</p>
      </div>
      <aside className="side">
        <section className="block">
          <h2>{m.title}</h2>
          <p>{m.summary}</p>
          <p className="warn" data-testid="explore-route-disabled">{m.noRoute?.route ?? useApp.getState().m0abReason}</p>
          <p className="fine" data-testid="explore-3d-reason">{m.noRoute?.terrain}</p>
          <ul className="fine">{m.records.map((t) => <li key={t}>{t}</li>)}</ul>
          {claims.length ? (
            <details data-testid="c-claims">
              <summary>{claims.length} source-backed claims (B-08 is a low-confidence hypothesis; claim ids are the catalog's)</summary>
              <ul className="fine">{claims.map((c) => <li key={c.id}>{c.id}: {c.kind}, confidence {c.confidence}</li>)}</ul>
            </details>
          ) : null}
          <p className="fine">No evidence of life has been established. {id === "B" ? "Preservation potential is what is being studied here, not a detection." : "Possible-biosignature interpretations remain unresolved."}</p>
          <div className="row">
            <button type="button" onClick={() => { setAtlasOpen(true); setScene("MISSION_CONTROL"); }}>Open Science Atlas</button>
          </div>
        </section>
        <Inspector onOpenAtlas={() => { setAtlasOpen(true); setScene("MISSION_CONTROL"); }} />
      </aside>
    </div>
  );
}
