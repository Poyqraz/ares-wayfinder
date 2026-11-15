// Contextual inspector: the visible answer to a click on a mission marker, a feature anchor or any map location.
import { useRef } from "react";
import { destinationCard } from "./destinationView.ts";
import { SITE_LABEL } from "./base.ts";
import { SITE_EVIDENCE } from "./siteEvidence.ts";
import { AmalikLinks } from "./AmalikLinks.tsx";
import { isExplore, MISSIONS } from "./missions.ts";
import { useApp } from "./store.ts";
import { DestinationCard } from "./ui/DestinationCard.tsx";

export function Inspector({ onOpenAtlas, onOpenFeatures }: { onOpenAtlas: () => void; onOpenFeatures?: () => void }) {
  const inspect = useApp((s) => s.inspect);
  const destination = useApp((s) => s.destination);
  const regional = useApp((s) => s.regional);
  const features = useApp((s) => s.features);
  const m0aState = useApp((s) => s.m0aState);
  const m0abReason = useApp((s) => s.m0abReason); // set only when the wider grid failed its checks
  const close = useApp((s) => s.closeInspector);
  const clearDestination = useApp((s) => s.clearDestination);
  const routeTo = useApp((s) => s.routeToDestination);
  const routeFrom = useApp((s) => s.routeFromDestination);
  const setScene = useApp((s) => s.setScene);
  const setRegion = useApp((s) => s.setRegion);
  const selectMission = useApp((s) => s.selectMission);
  const box = useRef<HTMLDivElement>(null);
  const base = useApp((s) => s.base);
  const planFromBase = useApp((s) => s.planFromBase);
  const planAtLandingZone = useApp((s) => s.planAtLandingZone);
  const inspectSite = useApp((s) => s.inspectSite);
  const science = useApp((s) => s.science);
  const inspectTarget = useApp((s) => s.inspectTarget);
  const selectDestinationGeo = useApp((s) => s.selectDestinationGeo);

  if (!inspect) {
    return <div className="inspector empty" data-testid="inspector-empty">Select a mission, a feature diamond or any point on the map. The details appear here.</div>;
  }
  if (inspect.kind === "mission") {
    const m = MISSIONS[inspect.id];
    return (
      <div className="inspector" data-testid="inspector" data-kind="mission">
        <div className="inspector-head"><h3>{m.title}</h3><button type="button" onClick={close} data-testid="inspector-dismiss">Dismiss</button></div>
        <p>{m.summary}</p>
        <p className="fine"><strong>Objective.</strong> {m.objective}</p>
        <ul className="ready">
          {m.readiness.map((r) => <li key={r.label} className={`ready-${r.state}`} data-testid={`readiness-${r.state}`}>{r.label}</li>)}
        </ul>
        {m.noRoute ? <p className="fine warn" data-testid="mission-no-route">{m.noRoute.route}</p> : null}
        {m.id === "B" && m0abReason ? <p className="fine warn" data-testid="b-grid-disabled">{m0abReason}. B can be inspected but not routed.</p> : null}
        {m.id === "B" ? <AmalikLinks /> : null}
        <details><summary>Records</summary><ul>{m.records.map((t) => <li key={t}>{t}</li>)}</ul></details>
        <div className="row">
          {m.planning === "m0a" ? (
            <button type="button" data-testid="mission-plan" disabled={m0aState.status !== "ready" || (m.id === "B" && !!m0abReason)} title={(m.id === "B" ? m0abReason : null) ?? m0aState.reason ?? undefined}
              onClick={() => { selectMission(m.id, false); setRegion("m0a"); setScene("PLANNING"); }}>Plan M0 → {m.id === "B" ? "B" : "A"} corridor</button>
          ) : (
            <button type="button" data-testid="mission-explore" onClick={() => { selectMission(m.id, false); setScene("PLANNING"); }}>{m.id === "B" ? "Inspect Amalik" : "Explore Bright Angel"}</button>
          )}
          <button type="button" onClick={onOpenAtlas}>Science Atlas</button>
        </div>
      </div>
    );
  }
  if (inspect.kind === "target") {
    const t = science.find((x) => x.id === inspect.id);
    if (!t) return null;
    const siblings = science.filter((x) => x.mission === t.mission && x.id !== t.id);
    return (
      <div className={`inspector target-card m-${t.mission}`} data-testid="inspector" data-kind="target">
        <div className="inspector-head"><h3>{t.name}</h3><button type="button" onClick={close} data-testid="inspector-dismiss">Dismiss</button></div>
        <p className="fine"><span className={`tag tag-${t.mission}`}>{MISSIONS[t.mission].shortTitle}</span> {t.what}</p>
        <p data-testid="target-why"><strong>Why go there.</strong> {t.why}</p>
        <ul className="fine">{t.facts.map((f) => <li key={f}>{f}</li>)}</ul>
        <p className="fine" data-testid="target-position">{t.lat.toFixed(5)}° N, {t.lon.toFixed(5)}° E. {t.position}</p>
        <p className="fine warn" data-testid="target-limits">{t.limits}</p>
        <div className="row">
          {isExplore(t.mission)
            ? <button type="button" disabled data-testid="target-plan">No route at {t.mission}: inspect only</button>
            : <button type="button" data-testid="target-plan" disabled={m0aState.status !== "ready"} onClick={() => { selectDestinationGeo(t.lat, t.lon); routeTo(); }}>Plan a route to this rover position (prototype)</button>}
          <button type="button" onClick={onOpenAtlas}>Records in the Science Atlas</button>
        </div>
        {siblings.length ? <div className="chips fine">{siblings.map((x) => <button key={x.id} type="button" className="target-chip" onClick={() => inspectTarget(x.id)}>{x.name}</button>)}</div> : null}
      </div>
    );
  }
  if (inspect.kind === "site") {
    if (!base) return null;
    const sc = base.scenario, site = sc.sites[inspect.key], d = sc.distances_from_base_m;
    return (
      <div className="inspector" data-testid="inspector" data-kind="site">
        <div className="inspector-head"><h3>{SITE_LABEL[inspect.key]}</h3><button type="button" onClick={close} data-testid="inspector-dismiss">Dismiss</button></div>
        <p>{site.role}. Hypothetical scenario site, chosen by a stated rule on real terrain data. Not evaluated or approved by NASA.</p>
        <p className="fine" data-testid="site-facts">
          {site.lat.toFixed(5)}° N, {site.lon.toFixed(5)}° E. Slope within {site.radius_m} m: median {site.slope_p50_deg ?? sc.candidates[0].slope_p50_deg}°,
          95th percentile {site.slope_p95_deg ?? sc.candidates[0].slope_p95_deg}°. Evaluated on: {site.evaluation}.
        </p>
        {inspect.key === "base" ? (
          <>
            <p className="fine">From the base: M0 depot {d.M0} m, Western Delta {d.A} m, Camp Delta {d.camp_a} m (inside the M0–A terrain grid, routable). Landing zone {(d.landing_zone / 1000).toFixed(1)} km and Bright Angel {(d.B / 1000).toFixed(1)} km are straight-line distances: no validated terrain connects them yet.</p>
            <div className="row">
              <button type="button" data-testid="plan-base-M0" onClick={() => planFromBase("M0")}>Plan base → M0 depot</button>
              <button type="button" data-testid="plan-base-A" onClick={() => planFromBase("A")}>Plan base → Western Delta</button>
            </div>
          </>
        ) : null}
        {inspect.key === "landing_zone" ? (
          <>
            <p className="fine">The flattest 400 m disc 1.0–2.5 km from the base. It lies {site.distance_to_perseverance_landing_m} m from Perseverance's 2021 landing point, inside the ROI-A terrain grid. {site.routable_note}.</p>
            <details data-testid="site-candidates"><summary>Compared candidates</summary>
              <table className="conditions"><tbody>
                {sc.candidates.map((c) => <tr key={c.id}><th>{c.id}</th><td>{c.name}</td><td>p95 {c.slope_p95_deg}°</td></tr>)}
              </tbody></table>
            </details>
            <div className="row"><button type="button" data-testid="plan-lz" onClick={planAtLandingZone}>Open ROI-A terrain at the landing zone</button></div>
          </>
        ) : null}
        {inspect.key === "camp_a" ? <div className="row"><button type="button" onClick={() => planFromBase("A")}>Plan base → Western Delta</button></div> : null}
        {inspect.key === "camp_b" ? <p className="fine warn">Provisional: placed on the 40 m regional relief only. No route can be planned to Camp Neretva until Bright Angel has validated terrain.</p> : null}
        <details data-testid="site-evidence"><summary>Published context and sources</summary>
          <ul className="fine">{SITE_EVIDENCE.map((e) => <li key={e.topic}><strong>{e.topic}</strong> ({e.scope}): {e.statement} <em>{e.source}</em></li>)}</ul>
        </details>
        <details><summary>What was not evaluated</summary><ul className="fine">{sc.not_evaluated.map((t) => <li key={t}>{t}</li>)}</ul></details>
        <div className="row fine">
          {(Object.keys(SITE_LABEL) as (keyof typeof SITE_LABEL)[]).filter((k) => k !== inspect.key).map((k) => <button key={k} type="button" onClick={() => inspectSite(k)}>{SITE_LABEL[k]}</button>)}
        </div>
      </div>
    );
  }
  if (inspect.kind === "feature") {
    const f = features?.features.find((x) => x.feature_id === inspect.id);
    if (!f) return null;
    const n = f.measurements;
    return (
      <div className="inspector" data-testid="inspector" data-kind="feature">
        <div className="inspector-head"><h3>{f.feature_id} {f.name}</h3><button type="button" onClick={close} data-testid="inspector-dismiss">Dismiss</button></div>
        <p>{f.observation}</p>
        <p className="fine">Geomorphic feature, not a mission{f.related_missions.length ? `; relevant to ${f.related_missions.join(", ")}` : ""}. Evidence level: {f.evidence_level}. Marker = rover waypoint sol {f.anchor.sol} (RMC {f.anchor.rmc}), not the feature centre.</p>
        <p data-testid="inspector-feature-status"><strong>Raster check:</strong> {f.three_raster_validation} · {f.qa_status}</p>
        {f.feature_id === "F01" && n.delta_z_m != null ? (
          <p className="fine">Automated transect at the anchor: Δz {n.delta_z_m?.toFixed(2)} m over {n.horizontal_span_m?.toFixed(0)} m, mean slope {n.mean_transect_slope_deg?.toFixed(1)}°. Geology review pending; not approved.</p>
        ) : <p className="fine">Not measured. Literature evidence only.</p>}
        <div className="row">{onOpenFeatures ? <button type="button" onClick={onOpenFeatures}>Evidence and sources</button> : null}</div>
      </div>
    );
  }
  if (!destination) return null;
  const card = destinationCard(destination, regional);
  const why = destination.routable_in ? null : destination.not_routable_reason;
  return (
    <div className="inspector" data-testid="inspector" data-kind="destination" ref={box}>
      <DestinationCard open status={card.status} fields={card.fields} onDismiss={clearDestination} />
      <div className="row">
        <button type="button" data-testid="dest-set-start" disabled={!destination.routable_in} onClick={routeFrom}>Set as start</button>
        <button type="button" data-testid="route-to-destination" disabled={!destination.routable_in} onClick={routeTo}>
          {destination.routable_in ? "Set as goal" : "Routing not available here"}
        </button>
        <button type="button" data-testid="dest-inspect" onClick={() => box.current?.querySelector("details")?.toggleAttribute("open")}>Inspect details</button>
      </div>
      {why ? <p className="fine" data-testid="dest-why">{why}</p> : null}
    </div>
  );
}
