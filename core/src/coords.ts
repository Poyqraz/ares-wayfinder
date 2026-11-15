// The only coordinate transforms in the project (contracts/CONTRACT.md §1).
import type {
  Cell,
  GeoPoint,
  ProjPoint,
  Projection,
  ScenePoint,
  TerrainMeta,
} from "@ares/contracts";

const DEG = Math.PI / 180;

type Grid = Pick<TerrainMeta, "nx" | "ny" | "x0" | "y0" | "dx_proj" | "dy_proj"> & { dx_ground_m?: number };

/** Ground metres per projected metre east-west, for display geometry only (SCENE and the 2D map, CR-005).
 *  shortcut: exactly 1 when within 0.1 % of 1 (ROI-A: 1.00006), so legacy scene coordinates stay bit-identical;
 *  a grid needing sub-0.1 % display fidelity would need the exact factor. Distances never use this. */
export function groundScaleX(m: { dx_proj: number; dx_ground_m?: number }): number {
  const k = m.dx_ground_m && m.dx_proj ? m.dx_ground_m / m.dx_proj : 1;
  return Number.isFinite(k) && Math.abs(k - 1) > 1e-3 ? k : 1;
}

/** Wrap longitude into [-180, 180). */
export function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** MARS_GEO -> PROJ (Equirectangular sphere, false easting/northing 0). */
export function geoToProj(p: Projection, g: GeoPoint): ProjPoint {
  const dLon = normalizeLon(g.lon - p.central_meridian_deg);
  return {
    E: p.radius_m * dLon * DEG * Math.cos(p.lat_ts_deg * DEG),
    N: p.radius_m * g.lat * DEG,
  };
}

/** PROJ -> MARS_GEO (planetocentric, east-positive, lon in [-180, 180)). */
export function projToGeo(p: Projection, q: ProjPoint): GeoPoint {
  return {
    lat: q.N / p.radius_m / DEG,
    lon: normalizeLon(
      p.central_meridian_deg + q.E / (p.radius_m * Math.cos(p.lat_ts_deg * DEG)) / DEG,
    ),
  };
}

/** ROI_GRID cell centre -> PROJ. */
export function cellCenter(m: Grid, c: Cell): ProjPoint {
  return {
    E: m.x0 + (c.col + 0.5) * m.dx_proj,
    N: m.y0 - (c.row + 0.5) * m.dy_proj,
  };
}

/** PROJ -> containing ROI_GRID cell, or null when outside the grid. */
export function projToCell(m: Grid, q: ProjPoint): Cell | null {
  const col = Math.floor((q.E - m.x0) / m.dx_proj);
  const row = Math.floor((m.y0 - q.N) / m.dy_proj);
  if (row < 0 || col < 0 || row >= m.ny || col >= m.nx) return null;
  return { row, col };
}

function sceneOrigin(m: Grid): ProjPoint {
  return { E: m.x0 + (m.nx * m.dx_proj) / 2, N: m.y0 - (m.ny * m.dy_proj) / 2 };
}

/** PROJ + elevation -> SCENE (Y-up, north = -Z). ve = vertical exaggeration. */
export function projToScene(
  m: Grid & Pick<TerrainMeta, "h_min">,
  q: ProjPoint,
  h: number,
  ve = 1,
): ScenePoint {
  const o = sceneOrigin(m);
  return { x: (q.E - o.E) * groundScaleX(m), y: (h - m.h_min) * ve, z: -(q.N - o.N) };
}

/** SCENE -> PROJ (horizontal only). */
export function sceneToProj(m: Grid, s: Pick<ScenePoint, "x" | "z">): ProjPoint {
  const o = sceneOrigin(m);
  return { E: s.x / groundScaleX(m) + o.E, N: o.N - s.z };
}
