// Terrain features F01-F03: anchors, status and evidence. Measurements show "Not measured" when null.
import type { LoadedFeatures, TerrainFeature } from "./features.ts";

const LABEL: Record<string, string> = {
  delta_z_m: "Relief Δz (m)", horizontal_span_m: "Horizontal span (m)", mean_transect_slope_deg: "Mean transect slope (°)",
  local_slope_p95_deg: "Local cell slope p95 (°)", crater_diameter_m: "Crater diameter (m)", crater_depth_m: "Crater depth (m)",
  slope_p95_deg: "Slope p95 (°)", channel_width_m: "Channel width (m)", bank_to_floor_relief_m: "Bank-to-floor relief (m)",
};

function Measures({ f, data }: { f: TerrainFeature; data: LoadedFeatures }) {
  const range = f.feature_id === "F01" ? (data.f01?.qa.uncertainty as Record<string, Record<string, [number, number] | null>> | undefined) : undefined;
  const keys = f.feature_id === "F01" ? ["delta_z_m", "horizontal_span_m", "mean_transect_slope_deg", "local_slope_p95_deg"] : Object.keys(f.measurements);
  return (
    <table>
      <tbody>
        {keys.map((k) => {
          const v = f.measurements[k];
          const dem = range?.independent_stereo_dem_range?.[k];
          const thr = range?.picking_threshold_range?.[k];
          return (
            <tr key={k} data-testid={`feature-${f.feature_id}-${k}`}>
              <td>{LABEL[k] ?? k}</td>
              <td>{v == null ? "Not measured" : v.toFixed(2)}</td>
              <td className="fine">{v == null ? "" : `stereo DEMs ${dem ? `${dem[0]}–${dem[1]}` : "n/a"}${thr ? `; picking threshold ${thr[0]}–${thr[1]}` : ""}`}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function FeaturePanel({ data }: { data: LoadedFeatures }) {
  return (
    <section className="block features" data-testid="terrain-features">
      <h3>Terrain features F01–F03 (evidence layer {data.version})</h3>
      <p className="fine">Geomorphic feature IDs, separate from mission IDs M0/A/B. Anchors are NASA MMGIS rover waypoints, not feature centres. Never used for routing or as certified hazards.</p>
      {data.features.map((f) => (
        <details key={f.feature_id} data-testid={`feature-${f.feature_id}`} open={f.feature_id === "F01"}>
          <summary>
            <strong>{f.feature_id}</strong> {f.name} · raster check: <span data-testid={`feature-${f.feature_id}-status`}>{f.three_raster_validation}</span> · {f.qa_status}
          </summary>
          <p className="fine">
            Anchor: {f.anchor.lat.toFixed(6)}°, {f.anchor.lon.toFixed(6)}° E, sol {f.anchor.sol}, RMC {f.anchor.rmc} ({f.anchor.source}; not the feature centre).
            {f.related_missions.length ? ` Related missions: ${f.related_missions.join(", ")}.` : ""} {f.observation}. Evidence: {f.evidence_level}. Geometry: {f.geometry_status}.
          </p>
          <Measures f={f} data={data} />
          {f.feature_id === "F01" && data.f01 ? (
            <>
              <p className="fine">
                Automated measurement on the HiRISE DTM soc_006 (2 m cells), pending geology review. Registration: HiRISE vs CTX{" "}
                {data.f01.qa.registration.ctx_vs_hirise_6m?.east_m} m E / {data.f01.qa.registration.ctx_vs_hirise_6m?.north_m} m N; DTM vs HiRISE{" "}
                {data.f01.qa.registration.dtm_hillshade_vs_hirise_2m?.east_m} m E / {data.f01.qa.registration.dtm_hillshade_vs_hirise_2m?.north_m} m N. Vertical datum UNVERIFIED.
              </p>
              <img className="feature-img" src={data.f01.panelUrl} alt="F01 evidence: CTX, two DEM hillshades and HiRISE in the same window, north up" data-testid="feature-F01-panel" />
              <img className="feature-img" src={data.f01.profileUrl} alt="F01 transect elevation profile" />
            </>
          ) : null}
        </details>
      ))}
    </section>
  );
}
