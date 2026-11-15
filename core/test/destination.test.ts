import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectDestination, parseMarsCoordinate, type AnalysisGridRef } from "../src/index.ts";
import { loadBundle } from "./bundle.ts";

describe("parseMarsCoordinate", () => {
  it("reads planetocentric lat, east-positive lon with optional hemispheres", () => {
    assert.deepEqual(parseMarsCoordinate("18.4589, 77.4062"), { ok: true, lat: 18.4589, lon: 77.4062 });
    assert.deepEqual(parseMarsCoordinate("18.4589N 77.4062E"), { ok: true, lat: 18.4589, lon: 77.4062 });
    assert.deepEqual(parseMarsCoordinate("4.5 S, 137.4 W"), { ok: true, lat: -4.5, lon: -137.4 });
    assert.deepEqual(parseMarsCoordinate("18.45, 282.6"), { ok: true, lat: 18.45, lon: 282.6 - 360 });
  });
  it("rejects ambiguous or out-of-range input instead of guessing", () => {
    for (const bad of ["", "18.45", "77.4 E, 18.4 N", "-18 N, 77", "91, 10", "18, 400", "18°27', 77°24'", "abc, def", "1, 2, 3"]) {
      assert.equal(parseMarsCoordinate(bad).ok, false, bad);
    }
  });
});

describe("inspectDestination", () => {
  const roiA = loadBundle("roi_a") as AnalysisGridRef["grid"];
  const grids = (routable: boolean): AnalysisGridRef[] => [{ id: "roi_a", role: "engineering_demo", routable, grid: roiA }];

  it("samples a point inside ROI-A and marks it routable only when the release allows it", () => {
    const d = inspectDestination("typed", 18.44463, 77.45088, grids(true));
    assert.equal(d.samples.length, 1);
    assert.equal(d.samples[0].grid_id, "roi_a");
    assert.ok(d.samples[0].elevation_m !== null && d.samples[0].elevation_m < -2000);
    assert.equal(d.routable_in, "roi_a");
    const locked = inspectDestination("click", 18.44463, 77.45088, grids(false));
    assert.equal(locked.routable_in, null);
    assert.match(locked.not_routable_reason!, /not accepted/);
  });

  it("lets a point outside every grid be inspected but not routed", () => {
    const m0 = inspectDestination("click", 18.452728, 77.408336, grids(true)); // M0 depot area, west of ROI-A
    assert.equal(m0.samples.length, 0);
    assert.equal(m0.routable_in, null);
    assert.match(m0.not_routable_reason!, /Outside every analysis grid/);
  });

  it("never routes into NoData", () => {
    const v = new Uint8Array(roiA.validity);
    const probe = inspectDestination("typed", 18.44463, 77.45088, grids(true)).samples[0].cell;
    v[probe.row * roiA.meta.nx + probe.col] = 1;
    const d = inspectDestination("typed", 18.44463, 77.45088, [{ id: "roi_a", role: "engineering_demo", routable: true, grid: { ...roiA, validity: v } }]);
    assert.equal(d.routable_in, null);
    assert.equal(d.samples[0].elevation_m, null);
    assert.match(d.not_routable_reason!, /NoData/);
  });
});
