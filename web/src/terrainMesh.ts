import type { Cell, ProjPoint, TerrainMeta } from "@ares/contracts";
import { cellCenter, projToScene } from "@ares/core";

/** Scene-space gap above the mesh for the drawn route only. Does not scale with VE. */
export const ROUTE_LIFT_M = 0.5;

type GridMeta = Pick<TerrainMeta, "nx" | "ny" | "x0" | "y0" | "dx_proj" | "dy_proj" | "h_min"> & { dx_ground_m?: number };

export interface TerrainMeshData {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** DEM cell index to mesh vertex, or -1 when that sample is not finite. */
  vertexOfCell: Int32Array;
}

/** Display polyline for the route. Midpoints are draw-only; route cells stay unchanged. */
export interface RouteDisplayPath {
  positions: Float32Array;
  s_m: Float64Array;
}

/** Texel centre of the DEM-grid ortho. Row 0 is north, so v is measured from the top. */
export function cellUv(nx: number, ny: number, col: number, row: number): { u: number; v: number } {
  return { u: (col + 0.5) / nx, v: 1 - (row + 0.5) / ny };
}

export function buildTerrainMesh(meta: GridMeta, dem: ArrayLike<number>, ve: number): TerrainMeshData {
  const { nx, ny } = meta;
  const vertexOfCell = new Int32Array(nx * ny).fill(-1);
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let row = 0; row < ny; row++) {
    for (let col = 0; col < nx; col++) {
      const index = row * nx + col;
      const height = dem[index];
      if (!Number.isFinite(height)) continue;
      const scene = projToScene(meta, cellCenter(meta, { row, col }), height, ve);
      vertexOfCell[index] = positions.length / 3;
      positions.push(scene.x, scene.y, scene.z);
      const uv = cellUv(nx, ny, col, row);
      uvs.push(uv.u, uv.v);
    }
  }
  const indices: number[] = [];
  const at = (row: number, col: number) => vertexOfCell[row * nx + col];
  for (let row = 0; row < ny - 1; row++) {
    for (let col = 0; col < nx - 1; col++) {
      const nw = at(row, col);
      const ne = at(row, col + 1);
      const sw = at(row + 1, col);
      const se = at(row + 1, col + 1);
      if (nw < 0 || ne < 0 || sw < 0 || se < 0) continue;
      // +Y normal in Y-up: north-west, south-west, north-east.
      indices.push(nw, sw, ne, sw, se, ne);
    }
  }
  return {
    positions: Float32Array.from(positions),
    uvs: Float32Array.from(uvs),
    indices: Uint32Array.from(indices),
    vertexOfCell,
  };
}

function isNwSeStep(dr: number, dc: number): boolean {
  return (dr > 0 && dc > 0) || (dr < 0 && dc < 0);
}

/**
 * Drawn route with optional midpoints on NW↔SE steps so the line clears the SW–NE mesh split.
 * Null if a cell has no finite DEM sample. Lift is not written back to the route.
 */
export function routeScenePositions(
  meta: GridMeta,
  dem: ArrayLike<number>,
  cells: Cell[],
  vertices: ProjPoint[],
  ve: number,
  profileS: ReadonlyArray<{ s_m: number }> = [],
  liftM = ROUTE_LIFT_M,
): RouteDisplayPath | null {
  if (cells.length !== vertices.length || cells.length === 0) return null;
  if (profileS.length > 0 && profileS.length !== cells.length) return null;
  const xyz: number[] = [];
  const sOut: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const vertex = vertices[i];
    if (!cell || !vertex) return null;
    const height = dem[cell.row * meta.nx + cell.col];
    if (!Number.isFinite(height)) return null;
    const scene = projToScene(meta, vertex, height, ve);
    const sHere = profileS[i]?.s_m ?? i;
    if (i > 0) {
      const prev = cells[i - 1];
      const prevVertex = vertices[i - 1];
      if (!prev || !prevVertex) return null;
      const dr = cell.row - prev.row;
      const dc = cell.col - prev.col;
      if (isNwSeStep(dr, dc)) {
        const nwRow = Math.min(prev.row, cell.row);
        const nwCol = Math.min(prev.col, cell.col);
        const hPrev = dem[prev.row * meta.nx + prev.col];
        const hSw = dem[(nwRow + 1) * meta.nx + nwCol];
        const hNe = dem[nwRow * meta.nx + (nwCol + 1)];
        if (!Number.isFinite(hPrev) || !Number.isFinite(hSw) || !Number.isFinite(hNe)) return null;
        const linearMid = (hPrev + height) / 2;
        const ridge = (hSw + hNe) / 2;
        const hMid = Math.max(linearMid, ridge);
        const midProj: ProjPoint = { E: (prevVertex.E + vertex.E) / 2, N: (prevVertex.N + vertex.N) / 2 };
        const midScene = projToScene(meta, midProj, hMid, ve);
        const sPrev = profileS[i - 1]?.s_m ?? i - 1;
        xyz.push(midScene.x, midScene.y + liftM, midScene.z);
        sOut.push((sPrev + sHere) / 2);
      }
    }
    xyz.push(scene.x, scene.y + liftM, scene.z);
    sOut.push(sHere);
  }
  return {
    positions: Float32Array.from(xyz),
    s_m: Float64Array.from(sOut),
  };
}

/** Y component of the triangle cross product. Positive means the triangle faces up. */
export function triangleNormalY(positions: Float32Array, indices: Uint32Array, triangle: number): number {
  const base = triangle * 3;
  const a = indices[base] ?? 0;
  const b = indices[base + 1] ?? 0;
  const c = indices[base + 2] ?? 0;
  const ax = positions[a * 3] ?? 0;
  const az = positions[a * 3 + 2] ?? 0;
  const bx = positions[b * 3] ?? 0;
  const bz = positions[b * 3 + 2] ?? 0;
  const cx = positions[c * 3] ?? 0;
  const cz = positions[c * 3 + 2] ?? 0;
  return (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
}
