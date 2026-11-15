import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { coreBadge, layoutMeda, loadAres1Catalog, readWaypointPin } from "../src/ares1.ts";

const dataRoot = fileURLToPath(new URL("../public/data/", import.meta.url));
const sourceRoot = fileURLToPath(new URL("../../ares1/bundle/572fba1ce61f/", import.meta.url));
const servedNames = ["catalog.json", "manifest.json", "meda_sol0516_der_ps_qa.json", "meda_sol0516_der_ps_rows.csv"];

function readPublic(rel: string): Uint8Array {
  return new Uint8Array(readFileSync(join(dataRoot, rel)));
}

function loader(mutate?: (url: string, bytes: Uint8Array) => Uint8Array) {
  return async (url: string) => {
    const rel = url.replace(/^\/data\//, "");
    const bytes = readPublic(rel);
    return mutate ? mutate(url, bytes) : bytes;
  };
}

function flip(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes);
  copy[20] = (copy[20] ?? 0) ^ 0xff;
  return copy;
}

describe("ARES-1 catalog loader", () => {
  it("serves the frozen bundle byte-for-byte and reads ten tubes plus 7440 MEDA rows", async () => {
    for (const name of servedNames) {
      assert.deepEqual(readPublic(`ares1/catalog/572fba1ce61f/${name}`), new Uint8Array(readFileSync(join(sourceRoot, name))));
    }
    const loaded = await loadAres1Catalog(loader());
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    assert.equal(loaded.catalog.depot_drop_events.length, 10);
    assert.equal(loaded.catalog.depot_drop_events.every((drop) => drop.tube_center.status === "NOT_AVAILABLE"), true);
    assert.equal(loaded.rows.length, 7440);
    assert.equal(loaded.rows.every((row) => row.uncertainty === ""), true);
    assert.equal(loaded.catalog.claims.length, 9);
    const skyland = loaded.catalog.samples.find((sample) => sample.sample_name === "Skyland");
    const swift = loaded.catalog.samples.find((sample) => sample.sample_name === "Swift Run");
    const depot = loaded.catalog.reference_waypoints.find((waypoint) => waypoint.id === "waypoint:M0");
    assert.equal(readWaypointPin(depot!), "Approximate rover waypoint (NASA MMGIS, sol 674, RMC 32_774). Not a sample or tube point.");
    assert.equal(coreBadge(skyland?.current_location ?? ""), "In Three Forks Depot (M0)");
    assert.equal(coreBadge(swift?.current_location ?? ""), "On the rover");
  });

  for (const name of ["manifest.json", ...servedNames.filter((file) => file !== "manifest.json")]) {
    it(`rejects a flipped byte in ${name}`, async () => {
      const loaded = await loadAres1Catalog(loader((url, bytes) => (url.endsWith(name) ? flip(bytes) : bytes)));
      assert.equal(loaded.ok, false);
    });
  }

  it("rejects an index manifest hash that does not match the file", async () => {
    const loaded = await loadAres1Catalog(loader((url, bytes) => {
      if (url !== "/data/ares1/index.json") return bytes;
      const text = new TextDecoder().decode(bytes).replace("572fba1ce61fa89f441cb89dc30b0a7fe7c1b72ebecd750aa37be97e26df378f", "0000000000000000000000000000000000000000000000000000000000000000");
      return new TextEncoder().encode(text);
    }));
    assert.equal(loaded.ok, false);
  });

  it("lays the MEDA chart out in pascals and LMST with a gap between sessions", async () => {
    const loaded = await loadAres1Catalog(loader());
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    const layout = layoutMeda(loaded.rows, 880, 280);
    assert.equal(layout.points.length, 7440);
    assert.equal(layout.sessions, 24);
    assert.ok(layout.yTicks.every((tick) => tick.label.endsWith("Pa")));
    assert.ok(layout.xTicks.length > 0);
    assert.match(layout.xTicks[0]?.label ?? "", /^\d{2}:\d{2}$/);
    const low = layout.points.find((point) => point.pressure === Math.min(...layout.points.map((item) => item.pressure)));
    const high = layout.points.find((point) => point.pressure === Math.max(...layout.points.map((item) => item.pressure)));
    assert.ok(low && high && high.y < low.y);
    const boundary = layout.points.findIndex((point, index) => index > 0 && point.session !== layout.points[index - 1]?.session);
    assert.ok(boundary > 1);
    const gap = layout.points[boundary]!.x - layout.points[boundary - 1]!.x;
    const step = layout.points[1]!.x - layout.points[0]!.x;
    assert.ok(gap > step * 10);
  });
});
