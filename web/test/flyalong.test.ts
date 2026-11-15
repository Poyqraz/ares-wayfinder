import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FLY_CLEARANCE, FLY_TRAIL_M, flyClearance, overviewCamera, pointAtDistance, sampleFlyalong } from "../src/flyalong.ts";

describe("flyalong sampler", () => {
  const profile = [
    { s_m: 0 },
    { s_m: 50 },
    { s_m: 100 },
  ];
  // Flat path along +X at y=10.
  const positions = Float32Array.from([
    0, 10, 0,
    50, 10, 0,
    100, 10, 0,
  ]);

  it("hits the start, midpoint, and end by horizontal distance", () => {
    assert.deepEqual(pointAtDistance(positions, profile, 0), [0, 10, 0]);
    assert.deepEqual(pointAtDistance(positions, profile, 50), [50, 10, 0]);
    assert.deepEqual(pointAtDistance(positions, profile, 100), [100, 10, 0]);
    assert.deepEqual(pointAtDistance(positions, profile, 25), [25, 10, 0]);
  });

  it("keeps the camera above the path and looking ahead", () => {
    const start = sampleFlyalong(positions, profile, 100, 0);
    assert.ok(start);
    assert.deepEqual(start.path, [0, 10, 0]);
    assert.equal(start.camera[1], 10 + FLY_CLEARANCE);
    assert.ok(start.lookAt[0]! > start.path[0]!);

    const mid = sampleFlyalong(positions, profile, 100, 0.5);
    assert.ok(mid);
    assert.deepEqual(mid.path, [50, 10, 0]);
    assert.equal(mid.camera[1], mid.path[1]! + FLY_CLEARANCE);

    const end = sampleFlyalong(positions, profile, 100, 1);
    assert.ok(end);
    assert.deepEqual(end.path, [100, 10, 0]);
    assert.equal(end.camera[1], end.path[1]! + FLY_CLEARANCE);
    assert.ok(end.lookAt[0]! >= end.path[0]!);
  });

  it("trails behind the path and looks down", () => {
    const mid = sampleFlyalong(positions, profile, 100, 0.5);
    assert.ok(mid);
    const midHorizontal = Math.hypot(mid.camera[0]! - mid.path[0]!, mid.camera[2]! - mid.path[2]!);
    assert.ok(Math.abs(midHorizontal - FLY_TRAIL_M) < 0.01);
    assert.ok(mid.camera[0]! < mid.path[0]!);
    assert.ok(mid.lookAt[1]! < mid.camera[1]!);

    const start = sampleFlyalong(positions, profile, 100, 0);
    assert.ok(start);
    const startHorizontal = Math.hypot(start.camera[0]! - start.path[0]!, start.camera[2]! - start.path[2]!);
    assert.ok(Math.abs(startHorizontal - FLY_TRAIL_M) < 0.01);
  });

  it("frames the overview camera closer than a distant orbit", () => {
    const view = overviewCamera(1000);
    assert.ok(view.position[1]! < 550);
    assert.ok(view.position[2]! < 850);
    assert.equal(view.target[0], 0);
  });

  it("scales fly clearance with vertical exaggeration", () => {
    assert.equal(flyClearance(1), FLY_CLEARANCE);
    assert.equal(flyClearance(10), 5 * FLY_CLEARANCE);
  });
});
