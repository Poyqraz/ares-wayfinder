import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groundScaleX, projToScene, sceneToProj } from "../src/index.ts";

// M0-A-like grid: eqc lat_ts 0 near 18.4557 N (ground/proj = cos 18.4557 = 0.94857); ROI-A: lat_ts 18.4663 (1.00006).
const m0a = { nx: 259, ny: 369, x0: 4588032, y0: 1094326, dx_proj: 2, dy_proj: 2, dx_ground_m: 1.897139, h_min: -2550 };
const roiA = { nx: 74, ny: 90, x0: 4353640, y0: 1092620, dx_proj: 20, dy_proj: 20, dx_ground_m: 20.00123, h_min: -2600 };

describe("SCENE ground scale (CR-005)", () => {
  it("draws 100 ground metres east-west and 100 m north-south with equal scene length on a lat_ts 0 grid", () => {
    const k = groundScaleX(m0a);
    assert.ok(Math.abs(k - 0.9485695) < 1e-6);
    const c = { E: m0a.x0 + 200, N: m0a.y0 - 300 };
    const east = projToScene(m0a, { E: c.E + 100 / k, N: c.N }, -2550); // 100 ground m east
    const north = projToScene(m0a, { E: c.E, N: c.N + 100 }, -2550); // 100 m north
    const o = projToScene(m0a, c, -2550);
    assert.ok(Math.abs(east.x - o.x - 100) < 1e-9, "E-W control distance");
    assert.ok(Math.abs(o.z - north.z - 100) < 1e-9, "N-S control distance (north = -z)");
  });

  it("round-trips scene <-> projected exactly and keeps north-up / east-right", () => {
    for (const q of [{ E: m0a.x0, N: m0a.y0 }, { E: m0a.x0 + 517.9, N: m0a.y0 - 737.3 }]) {
      const s = projToScene(m0a, q, -2500);
      const back = sceneToProj(m0a, s);
      assert.ok(Math.abs(back.E - q.E) < 1e-6 && Math.abs(back.N - q.N) < 1e-9);
    }
    const nw = projToScene(m0a, { E: m0a.x0, N: m0a.y0 }, -2550), se = projToScene(m0a, { E: m0a.x0 + 518, N: m0a.y0 - 738 }, -2550);
    assert.ok(nw.x < se.x && nw.z < se.z);
  });

  it("leaves ROI-A scene coordinates bit-identical (factor 1.00006 is below the 0.1 % threshold)", () => {
    assert.equal(groundScaleX(roiA), 1);
    const q = { E: roiA.x0 + 333.3, N: roiA.y0 - 444.4 };
    const s = projToScene(roiA, q, -2580);
    assert.equal(s.x, q.E - (roiA.x0 + (roiA.nx * roiA.dx_proj) / 2));
    assert.equal(groundScaleX({ dx_proj: 20 }), 1, "no ground spacing given: projected metres");
  });
});
