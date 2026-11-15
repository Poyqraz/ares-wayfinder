// Run: node --test core/test/  (Node >= 22.18 strips TS types natively; no deps)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cellCenter,
  geoToProj,
  projToCell,
  projToGeo,
  projToScene,
  sceneToProj,
} from "../src/index.ts";

const close = (a: number, b: number, tol: number, what = "") =>
  assert.ok(Math.abs(a - b) <= tol, `${what} ${a} vs ${b} (tol ${tol})`);

// CTX DEM header values (GDAL read 2026-11-14): R, standard parallel, GeoTransform.
const CTX = { radius_m: 3396190, lat_ts_deg: 18.4663, central_meridian_deg: 0 };
const SRC = { x0: 4329000, y0: 1143420, dx_proj: 20, dy_proj: 20, nx: 4456, ny: 5067 };

describe("CRS-1/CRS-4: projection matches the published DEM bounds", () => {
  // PDS4 XML bounds W76.99744 E78.58256 N19.29019 S17.58052, stated to 1e-5 deg (~0.6 m).
  const cases = [
    ["west", { lat: 19.29019, lon: 76.99744 }, "E", SRC.x0],
    ["east", { lat: 19.29019, lon: 78.58256 }, "E", SRC.x0 + SRC.nx * SRC.dx_proj],
    ["north", { lat: 19.29019, lon: 77.5 }, "N", SRC.y0],
    ["south", { lat: 17.58052, lon: 77.5 }, "N", SRC.y0 - SRC.ny * SRC.dy_proj],
  ] as const;
  for (const [name, geo, axis, expected] of cases) {
    it(`${name} edge`, () => close(geoToProj(CTX, geo)[axis], expected, 1.5, name));
  }

  it("landing site falls in the expected DEM cell", () => {
    const cell = projToCell(SRC, geoToProj(CTX, { lat: 18.44463, lon: 77.45088 }));
    assert.deepEqual(cell, { row: 2506, col: 1274 });
  });
});

describe("CRS-2: roundtrips", () => {
  it("geo -> proj -> geo", () => {
    for (const g of [
      { lat: 18.44463, lon: 77.45088 },
      { lat: -45, lon: -179.5 },
      { lat: 0, lon: 0 },
    ]) {
      const back = projToGeo(CTX, geoToProj(CTX, g));
      close(back.lat, g.lat, 1e-10, "lat");
      close(back.lon, g.lon, 1e-10, "lon");
    }
  });

  it("cell centre -> proj -> same cell, for every corner cell", () => {
    for (const c of [
      { row: 0, col: 0 },
      { row: 0, col: SRC.nx - 1 },
      { row: SRC.ny - 1, col: 0 },
      { row: SRC.ny - 1, col: SRC.nx - 1 },
    ]) {
      assert.deepEqual(projToCell(SRC, cellCenter(SRC, c)), c);
    }
  });

  it("row 0 is north: its centre has the largest N", () => {
    assert.ok(cellCenter(SRC, { row: 0, col: 0 }).N > cellCenter(SRC, { row: 1, col: 0 }).N);
  });

  it("points outside the grid give null", () => {
    assert.equal(projToCell(SRC, { E: SRC.x0 - 1, N: SRC.y0 - 1 }), null);
    assert.equal(projToCell(SRC, { E: SRC.x0 + 1, N: SRC.y0 + 1 }), null);
  });

  it("proj -> scene -> proj, and north maps to -Z, east to +X", () => {
    const m = { ...SRC, nx: 74, ny: 90, h_min: -2600 };
    const p = cellCenter(m, { row: 3, col: 70 });
    const s = projToScene(m, p, -2500, 2);
    close(s.y, 200, 1e-9, "y");
    const back = sceneToProj(m, s);
    close(back.E, p.E, 1e-9, "E");
    close(back.N, p.N, 1e-9, "N");
    const north = projToScene(m, cellCenter(m, { row: 0, col: 0 }), 0);
    const south = projToScene(m, cellCenter(m, { row: 89, col: 0 }), 0);
    assert.ok(north.z < south.z, "north must be -Z");
    assert.ok(projToScene(m, cellCenter(m, { row: 0, col: 73 }), 0).x > north.x, "east must be +X");
  });
});
