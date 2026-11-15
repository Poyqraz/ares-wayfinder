// B Amalik: how far it is from M0 and A (straight lines only), what is uncertain, and where the records and the
// historical NASA imagery are. Shared by the mission card and the Science Atlas.
import { greatCircleM } from "./destinationView.ts";
import { B_IMAGERY, B_SOURCES, B_UNCERTAINTY, SHUYAK } from "./missionB.ts";
import { missionPoint } from "./missions.ts";
import { useApp } from "./store.ts";

export function AmalikLinks() {
  const regional = useApp((s) => s.regional);
  const science = useApp((s) => s.science);
  const b = { lat: SHUYAK.lat, lon: SHUYAK.lon }, m0 = missionPoint("M0", regional);
  const from = [
    ...(m0 ? [{ name: "M0 reference waypoint", ...m0 }] : []),
    ...science.filter((t) => t.mission === "A" && t.kind === "outcrop").map((t) => ({ name: `${t.name} sampling position`, lat: t.lat, lon: t.lon })),
  ];
  return (
    <div className="amalik" data-testid="amalik-links">
      {from.length ? (
        <p className="fine" data-testid="b-distances">
          Straight lines between recorded rover positions: {from.map((p) => `${p.name} ${greatCircleM(p, b).toFixed(0)} m`).join(", ")}. These are straight lines, not walking distances. Planning computes a candidate corridor from M0 on the wider terrain grid.
        </p>
      ) : null}
      <details data-testid="b-uncertainty"><summary>What is uncertain</summary><ul className="fine">{B_UNCERTAINTY.map((t) => <li key={t}>{t}</li>)}</ul></details>
      <details data-testid="b-sources"><summary>Sources ({B_SOURCES.length})</summary>
        <ul className="fine">{B_SOURCES.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>. {s.checked}</li>)}</ul>
      </details>
      <details data-testid="b-imagery"><summary>Historical NASA imagery ({B_IMAGERY.length} links, need a connection)</summary>
        <ul className="fine">{B_IMAGERY.map((i) => <li key={i.url}><a href={i.url} target="_blank" rel="noreferrer">{i.title}</a>, sol {i.sol}: {i.what}. Credit: {i.credit}.</li>)}</ul>
      </details>
    </div>
  );
}
