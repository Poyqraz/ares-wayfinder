import { useEffect, useMemo, useRef, useState } from "react";
import {
  ATLAS_TEXT,
  atlasUnavailable,
  coreBadge,
  dropTimeLabel,
  layoutMeda,
  loadAres1Catalog,
  readWaypointPin,
  roverDropLine,
  sealingLabel,
  separationLine,
  statusCounts,
  type AtlasCatalog,
  type AtlasClaim,
  type AtlasLoad,
  type AtlasSample,
  type MedaRow,
} from "./ares1.ts";
import { AmalikLinks } from "./AmalikLinks.tsx";
import { AMALIK, MAGEIK_EXTRA, SHUYAK } from "./missionB.ts";
import { MISSIONS } from "./missions.ts";
import { RegionalMap } from "./RegionalMap.tsx";
import { useApp } from "./store.ts";

const KIND_LABEL: Record<string, string> = {
  identity: "Identity",
  observation: "Observation",
  measurement: "Measurement",
  interpretation: "Interpretation",
  hypothesis: "Hypothesis",
  rationale: "Rationale",
};

const STATUS_COLOR: Record<string, string> = {
  valid: "#79e7ff",
  flagged: "#ff9a42",
  missing: "#c2b0a1",
  invalid: "#ff6d57",
};

const OVERVIEW_CARDS = [
  { id: "M0", title: "M0 Three Forks sample recovery", catalog: "M0" },
  { id: "A", title: "A Western Delta science objectives", catalog: "A" },
  { id: "B", title: MISSIONS.B.title, catalog: null, name: "Amalik outcrop: Shuyak and Mageik cores" },
  { id: "C", title: MISSIONS.C.title, catalog: "B" }, // the frozen catalog records Bright Angel as its mission B
] as const;

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

function findById<T extends { id: string }>(rows: readonly T[], id: string | undefined): T | undefined {
  return rows.find((row) => row.id === id);
}

export function ScienceAtlas({ atlasOnly = false, onBack }: { atlasOnly?: boolean; onBack?: () => void } = {}) {
  const setScene = useApp((state) => state.setScene);
  const [loaded, setLoaded] = useState<AtlasLoad | null>(null);
  const [view, setView] = useState<"overview" | "atlas">(atlasOnly ? "atlas" : "overview");

  useEffect(() => {
    let cancel = false;
    void loadAres1Catalog(fetchBytes).then((result) => {
      if (!cancel) setLoaded(result);
    });
    return () => {
      cancel = true;
    };
  }, []);

  const openPlanning = () => setScene("PLANNING");

  if (view === "overview") {
    return (
      <section className="sheet atlas" data-testid="mission-overview">
        <h2>ARES-1</h2>
        <p>Historical NASA and PDS records for four Jezero investigations. This is not a mission plan. Planning offers two analysis regions: ROI-A (CTX 20 m engineering demo) and M0–A (HiRISE 2 m prototype, between two rover positions), which mission B uses in a wider form that reaches Amalik. C (Bright Angel) has no analysis grid.</p>
        <RegionalMap />
        {loaded == null ? <p>Reading the ARES-1 catalog.</p> : loaded.ok ? <OverviewCards loaded={loaded} /> : <p data-testid="atlas-unavailable">{atlasUnavailable(loaded.reason)}</p>}
        <div className="row">
          <button type="button" disabled>{ATLAS_TEXT.route}</button>
          {loaded?.ok ? <button type="button" onClick={() => setView("atlas")}>Open Science Atlas</button> : null}
          <button type="button" onClick={openPlanning}>Open ROI-A route planning</button>
        </div>
      </section>
    );
  }

  return (
    <section className="sheet atlas" data-testid="atlas-root">
      <div className="row">
        <button type="button" onClick={() => (onBack ? onBack() : setView("overview"))}>Back to mission overview</button>
        <button type="button" onClick={openPlanning}>Open ROI-A route planning</button>
      </div>
      <p>{ATLAS_TEXT.banner}</p>
      <p>{ATLAS_TEXT.positions}</p>
      <p>{ATLAS_TEXT.consistency}</p>
      <div className="row">
        <button type="button" disabled data-testid="route-disabled">{ATLAS_TEXT.route}</button>
        <button type="button" disabled data-testid="tube-disabled">{ATLAS_TEXT.tubes}</button>
        <button type="button" disabled data-testid="exact-disabled">{ATLAS_TEXT.exact}</button>
      </div>
      {loaded == null ? <p>Reading the ARES-1 catalog.</p> : loaded.ok ? <AtlasBody loaded={loaded} /> : <p data-testid="atlas-unavailable">{atlasUnavailable(loaded.reason)}</p>}
    </section>
  );
}

function OverviewCards({ loaded }: { loaded: Extract<AtlasLoad, { ok: true }> }) {
  return (
    <>
      <p data-testid="catalog-status">Data status: {loaded.catalog.schema} loaded.</p>
      <div className="mission-cards">
        {OVERVIEW_CARDS.map((card) => {
          const mission = loaded.catalog.missions.find((item) => item.id === card.catalog);
          return (
            <article key={card.id} className="mission-card" data-testid="mission-card">
              <h3>{card.title}</h3>
              <p>{mission?.name ?? ("name" in card ? card.name : "")}</p>
              <p data-testid="route-readiness">Route not available</p>
            </article>
          );
        })}
      </div>
    </>
  );
}

function AtlasBody({ loaded }: { loaded: Extract<AtlasLoad, { ok: true }> }) {
  const { catalog, sources, rows, anomalies } = loaded;
  const samples = useMemo(() => new Map(catalog.samples.map((sample) => [sample.id, sample])), [catalog.samples]);
  const mission = (id: string) => catalog.missions.find((item) => item.id === id);
  const m0 = mission("M0");
  const missionA = mission("A");
  const missionB = mission("B");
  const drops = (m0?.drop_events ?? []).map((id) => findById(catalog.depot_drop_events, id)).filter((drop) => drop != null);
  const distance = catalog.reference_distances_m["skinner_ridge-wildcat_ridge_sampling_positions"];

  return (
    <>
      <section data-testid="atlas-m0">
        <h2>M0 Three Forks Depot</h2>
        <p data-testid="route-readiness">Route not available</p>
        <Waypoint catalog={catalog} id={m0?.reference_waypoint} />
        <div className="atlas-table">
          <table>
            <thead>
              <tr>
                <th>Designation</th>
                <th>Name</th>
                <th>Class (team)</th>
                <th>NASA type/rock</th>
                <th>Drop sol</th>
                <th>Drop time</th>
                <th>Sealing</th>
                <th>Tube center</th>
              </tr>
            </thead>
            <tbody>
              {drops.map((drop) => {
                const sample = samples.get(drop.sample);
                const witness = drop.sample_designation === "M2020-00586-18";
                return (
                  <tr key={drop.id} data-testid="m0-row">
                    <td>{drop.sample_designation}</td>
                    <td>{sample?.sample_name ?? ""}</td>
                    <td>{sample?.classification.team_class.replaceAll("_", " ") ?? ""}</td>
                    <td>{nasaType(sample)}</td>
                    <td>{drop.drop_sol}</td>
                    <td>{dropTimeLabel(drop.drop_time)}</td>
                    <td>
                      {sample?.sealing_event ? sealingLabel(sample.sealing_event.sol, sample.sealing_event.lmst) : ""}
                      {witness ? <span data-testid="witness-row"> {ATLAS_TEXT.witnessRow}</span> : null}
                    </td>
                    <td>{drop.tube_center.status === "NOT_AVAILABLE" ? ATLAS_TEXT.tubeCenter : drop.tube_center.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {drops.map((drop) => (
          <details key={`${drop.id}-detail`}>
            <summary>{drop.sample_designation} row detail</summary>
            <p>{roverDropLine(drop.rover_position.lat_deg, drop.rover_position.lon_deg_east)}</p>
            {drop.sample_designation === "M2020-00586-18" ? <p data-testid="witness-note">{ATLAS_TEXT.witness}</p> : null}
          </details>
        ))}
      </section>

      <section data-testid="atlas-a">
        <h2>A Western delta front</h2>
        <p data-testid="route-readiness">Route not available</p>
        <Waypoint catalog={catalog} id={missionA?.reference_waypoint} />
        {(missionA?.outcrops ?? []).map((id) => {
          const outcrop = findById(catalog.outcrops, id);
          if (!outcrop) return null;
          return (
            <article key={outcrop.id}>
              <h3>{outcrop.name}</h3>
              <p>{ATLAS_TEXT.samplingPosition}</p>
              <ul>
                {outcrop.cores.map((coreId) => {
                  const sample = samples.get(coreId);
                  const badge = sample ? coreBadge(sample.current_location) : null;
                  return (
                    <li key={coreId}>
                      {sample?.sample_name ?? coreId}
                      {badge ? <span className="flag" data-testid="core-badge">{badge}</span> : null}
                    </li>
                  );
                })}
              </ul>
              <p>Rock type: {outcrop.evidence.rock_type.confidence} ({outcrop.evidence.rock_type.evidence_kind})</p>
              <p>Interpretation: {outcrop.evidence.scientific_interpretation.confidence} ({outcrop.evidence.scientific_interpretation.evidence_kind})</p>
              <p>Core IDs: {outcrop.evidence.core_ids.confidence} ({outcrop.evidence.core_ids.evidence_kind})</p>
            </article>
          );
        })}
        {typeof distance === "number" ? <p>{separationLine(distance)}</p> : null}
      </section>

      <section data-testid="atlas-b">
        <h2>B Amalik / Enchanted Lake</h2>
        <p data-testid="route-readiness">Route not available</p>
        <p>Amalik is {AMALIK.setting}. It is a {AMALIK.rock}. Minerals reported: {AMALIK.minerals}. The science team's reading: {AMALIK.interpretation}.</p>
        <p>{AMALIK.fluorescence}.</p>
        <p className="fine">{AMALIK.source}. {AMALIK.abrasion}.</p>
        {(() => {
          const mageik = catalog.samples.find((s) => s.sample_designation === MAGEIK_EXTRA.designation), drop = drops.find((d) => d.sample === mageik?.id);
          const at = (mageik as unknown as { sampling_event?: { designation_sol?: number; rover_position?: { lat_deg: number; lon_deg_east: number } } } | undefined)?.sampling_event;
          return (
            <div className="table-scroll">
              <table data-testid="atlas-b-cores">
                <thead><tr><th>Core</th><th>Designation</th><th>NASA no.</th><th>Cored (sol)</th><th>Sealed (sol)</th><th>Depot drop (sol)</th><th>Where it is now</th><th>Rover position at sampling</th></tr></thead>
                <tbody>
                  <tr data-testid="b-row-shuyak"><td>{SHUYAK.name}</td><td>{SHUYAK.designation}</td><td>{SHUYAK.nasa_sample_no}</td><td>{SHUYAK.coring_sol}</td><td>{SHUYAK.coring_sol}</td><td>none</td><td>{SHUYAK.now}</td><td>{SHUYAK.lat.toFixed(5)}° N, {SHUYAK.lon.toFixed(5)}° E</td></tr>
                  {mageik ? <tr data-testid="b-row-mageik"><td>{mageik.sample_name}</td><td>{mageik.sample_designation}</td><td>{mageik.nasa_public_sample_number}</td><td>{at?.designation_sol ?? ""}</td><td>{mageik.sealing_event?.sol ?? ""}</td><td>{drop?.drop_sol ?? ""}</td><td>Three Forks depot (mission M0)</td><td>{at?.rover_position ? `${at.rover_position.lat_deg.toFixed(5)}° N, ${at.rover_position.lon_deg_east.toFixed(5)}° E` : ""}</td></tr> : null}
                </tbody>
              </table>
            </div>
          );
        })()}
        <p className="fine">Shuyak's record is read from the PDS Initial Report for this mission; it is not in the frozen catalog. Mageik's is the catalog record. Coring, sealing and depot drop are separate events.</p>
        <AmalikLinks />
        <p data-testid="no-life-b">{ATLAS_TEXT.noLife}</p>
      </section>

      <section data-testid="atlas-c">
        <h2>C Bright Angel</h2>
        <p className="fine">Formerly mission B. The frozen catalog still records it under its own ids (mission B, claims B-01 to B-09); they are shown unchanged.</p>
        <p data-testid="route-readiness">Route not available</p>
        <p className="chip">{ATLAS_TEXT.caution}</p>
        <Waypoint catalog={catalog} id={missionB?.reference_waypoint} />
        <h3>Bright Angel (region)</h3>
        {(missionB?.rocks ?? []).map((id) => {
          const rock = findById(catalog.rocks, id);
          if (!rock) return null;
          const core = samples.get(rock.cores[0] ?? "");
          return (
            <article key={rock.id}>
              <h3>{rock.name} (rock, not {rock.is_not})</h3>
              {core ? (
                <h3>
                  {core.sample_name} (core; NASA Sample No. {core.nasa_public_sample_number} = designation {core.sample_designation}; on the rover; not in M0)
                </h3>
              ) : null}
            </article>
          );
        })}
        <ClaimGroups claims={(missionB?.claims ?? []).map((id) => findById(catalog.claims, id)).filter((claim) => claim != null)} />
        <p data-testid="no-life">{ATLAS_TEXT.noLife}</p>
      </section>

      <MedaPanel catalog={catalog} rows={rows} anomalies={anomalies} />
      <Provenance sources={sources} />
    </>
  );
}

function nasaType(sample: AtlasSample | undefined): string {
  if (!sample) return "";
  const rock = sample.classification.nasa_rock_type;
  const kind = sample.classification.nasa_sample_type ?? "";
  return rock ? `${kind} / ${rock}` : kind;
}

function Waypoint({ catalog, id }: { catalog: AtlasCatalog; id: string | undefined }) {
  const waypoint = findById(catalog.reference_waypoints, id);
  const line = waypoint ? readWaypointPin(waypoint) : null;
  if (!line) return null;
  return <p data-testid="waypoint">{line}</p>;
}

function ClaimGroups({ claims }: { claims: AtlasClaim[] }) {
  const order = ["identity", "observation", "interpretation", "hypothesis", "rationale", "measurement"];
  return (
    <>
      {order.map((kind) => {
        const group = claims.filter((claim) => claim.evidence_kind === kind);
        if (group.length === 0) return null;
        return (
          <section key={kind}>
            <h3>{KIND_LABEL[kind] ?? kind}</h3>
            {group.map((claim) => (
              <article key={claim.id} data-testid="claim">
                <p>{claim.id.replace("claim:", "")}: {claim.claim}</p>
                <p>Confidence: {claim.confidence}. Limitation: {claim.limitation}</p>
                {claim.id === "claim:B-08" ? <p className="flag" data-testid="b08-badge">{ATLAS_TEXT.b08}</p> : null}
                {claim.primary_source_url ? <p><a href={claim.primary_source_url}>{claim.primary_source}</a></p> : <p>{claim.primary_source}</p>}
              </article>
            ))}
          </section>
        );
      })}
    </>
  );
}

function MedaPanel({ catalog, rows, anomalies }: { catalog: AtlasCatalog; rows: MedaRow[]; anomalies: string[] }) {
  const series = catalog.measurement_series[0];
  const counts = statusCounts(rows);
  const uncertaintyProvided = rows.some((row) => row.uncertainty !== "");
  return (
    <section data-testid="atlas-meda">
      <h2>MEDA sol {series?.sol ?? 516}</h2>
      <p>{ATLAS_TEXT.medaCaption}</p>
      <p>{ATLAS_TEXT.parserNote}</p>
      <p data-testid="meda-uncertainty">{uncertaintyProvided ? "Published uncertainty is shown per row; missing values are not filled." : ATLAS_TEXT.uncertaintyValue}</p>
      <p>{ATLAS_TEXT.location}</p>
      <p data-testid="meda-axis">Pressure axis: Pa. Time axis: LMST.</p>
      {series?.pressure_pa_valid ? <p>Parser-valid pressure {series.pressure_pa_valid.min}–{series.pressure_pa_valid.max} Pa (mean {series.pressure_pa_valid.mean}, median {series.pressure_pa_valid.median}).</p> : null}
      {series ? <p>Product UTC span {series.start_utc} – {series.stop_utc} (label only; not a per-record axis).</p> : null}
      <div className="row">
        <button type="button" disabled data-testid="meda-uncertainty-disabled">{ATLAS_TEXT.uncertaintyDisabled}</button>
        <button type="button" disabled data-testid="meda-utc-disabled">{ATLAS_TEXT.utc}</button>
      </div>
      <ul className="terrain-legend">
        {Object.entries(STATUS_COLOR).map(([status, color]) => (
          <li key={status} data-testid={`meda-status-${status}`}>
            <span className="swatch" style={{ background: color }} /> {status} ({counts[status] ?? 0})
          </li>
        ))}
      </ul>
      <MedaChart rows={rows} />
      <ul>
        {anomalies.map((line) => <li key={line}>{line}</li>)}
      </ul>
    </section>
  );
}

function MedaChart({ rows }: { rows: MedaRow[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const layout = layoutMeda(rows, 880, 280);
  useEffect(() => {
    const node = canvas.current;
    const context = node?.getContext("2d");
    if (!node || !context) return;
    const drawn = layoutMeda(rows, node.width, node.height);
    context.clearRect(0, 0, node.width, node.height);
    context.strokeStyle = "#5a3d2e";
    context.strokeRect(64, 16, node.width - 80, node.height - 52);
    context.fillStyle = "#c2b0a1";
    context.font = "12px sans-serif";
    for (const tick of drawn.yTicks) context.fillText(tick.label, 2, (tick.y ?? 0) + 4);
    for (const tick of drawn.xTicks) context.fillText(tick.label, (tick.x ?? 0) - 16, node.height - 8);
    let current = -1;
    for (const point of drawn.points) {
      if (point.session !== current) {
        if (current >= 0) context.stroke();
        current = point.session;
        context.beginPath();
        context.strokeStyle = "#79e7ff";
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    }
    if (current >= 0) context.stroke();
  }, [rows]);
  return (
    <>
      <canvas ref={canvas} className="atlas-chart" width={880} height={280} data-testid="meda-chart" data-points={layout.points.length} data-sessions={layout.sessions} />
      <p data-testid="meda-sessions">{layout.sessions} measurement sessions</p>
    </>
  );
}

function Provenance({ sources }: { sources: { id: string; title: string; kind: string; url: string | null; sha256: string | null; retrieved: string | null }[] }) {
  return (
    <details data-testid="provenance-drawer">
      <summary>Source register</summary>
      {sources.map((source) => (
        <article key={source.id}>
          <p>{source.title}</p>
          <p>{source.kind === "cited_not_retrieved" ? ATLAS_TEXT.cited : source.kind}</p>
          {source.url ? <p><a href={source.url}>{source.url}</a></p> : null}
          <p>{source.sha256 ?? ""}</p>
          <p>{source.retrieved ?? ""}</p>
        </article>
      ))}
    </details>
  );
}
