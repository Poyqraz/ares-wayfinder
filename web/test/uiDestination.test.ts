import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { destinationMessage, readyLines } from "../src/ui/cardModel.ts";
import { groundRect, selectionAspect } from "../src/ui/magnifier.ts";
// Coordinate parsing is tested once, in core/test/destination.test.ts (single selection pipeline).

describe("destination card", () => {
  it("states NoData without an elevation and leaves a missing name unmarked as a place", () => {
    assert.equal(destinationMessage("nodata"), "NoData at this location. Elevation is not supplied.");
    assert.equal(destinationMessage("integrity"), "Destination data failed an integrity check.");
    const lines = readyLines({ coordinate: "18 N, 77 E" });
    assert.equal(lines.find((line) => line.label === "Region context")?.value, "Not supplied.");
    assert.equal(lines.find((line) => line.label === "Elevation")?.value, "Elevation not supplied.");
    assert.equal(lines.some((line) => line.label === "Slope"), false);
  });

  it("prints elevation only when the caller supplies it", () => {
    const lines = readyLines({ elevationM: -2560.1, elevationSource: "preview DEM label", routingAvailable: false, routingReason: "No validated analysis dataset is connected." });
    assert.equal(lines.find((line) => line.label === "Elevation")?.value, "-2560.1 m (preview DEM label)");
    assert.equal(lines.find((line) => line.label === "Routing")?.value, "No validated analysis dataset is connected.");
  });
});

describe("orbital selection", () => {
  it("keeps the supplied bounds ratio and refuses a crop without both corners", () => {
    const bounds = groundRect({ lat: 18.5, lon: 77.4 }, { lat: 18.42, lon: 77.46 });
    assert.deepEqual(bounds, { west: 77.4, south: 18.42, east: 77.46, north: 18.5 });
    assert.ok(Math.abs((selectionAspect(bounds!) ?? 0) - (0.06 / 0.08)) < 1e-9);
    assert.equal(groundRect(null, { lat: 1, lon: 2 }), null);
  });
});
