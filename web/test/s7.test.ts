import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { geoToProj, projToCell } from "@ares/core";
import { loadBase } from "../src/base.ts";
import { fail, type Checked } from "../src/integrity.ts";
import { planPair } from "../src/plan.ts";
import { loadM0A } from "../src/regions.ts";
import { routeMarkers } from "../src/routeMarkers.ts";

globalThis.URL.createObjectURL ??= () => "blob:test";
const pub = new URL("../public/", import.meta.url);
const get = (edit?: (u: string, b: Uint8Array) => Uint8Array) => async (url: string): Promise<Checked<Uint8Array>> => {
  try {
    const b = new Uint8Array(readFileSync(new URL(url.replace(/^\//, ""), pub)));
    return { ok: true, value: edit ? edit(url, b) : b };
  } catch { return fail("DATASET INTEGRITY", url); }
};

describe("base scenario and route markers", async () => {
  const base = await loadBase(get());
  const m0a = await loadM0A(get());
  assert.ok(base.ok && m0a.ok);
  if (!base.ok || !m0a.ok) return;
  const sc = base.value.scenario, m = m0a.value;

  it("keeps landing zone, base and camps as separate hypothetical sites and refuses tampering", async () => {
    assert.match(sc.status, /HYPOTHETICAL.*not evaluated or approved by NASA/);
    const s = sc.sites;
    assert.equal(new Set([s.landing_zone, s.base, s.camp_a, s.camp_b].map((x) => `${x.lat},${x.lon}`)).size, 4);
    assert.equal(s.camp_b.routable, false);
    const bad = await loadBase(get((u, b) => { if (!u.endsWith("base_scenario.json")) return b; const c = new Uint8Array(b); c[40] ^= 0xff; return c; }));
    assert.equal(bad.ok, false);
  });

  it("routes from the base on the M0-A grid and never reuses the rover-to-rover reference route", () => {
    const start = projToCell(m.meta, geoToProj(m.meta, { lat: sc.sites.base.lat, lon: sc.sites.base.lon }))!;
    assert.ok(start && m.grid.validity[start.row * m.meta.nx + start.col] === 0);
    const toA = planPair(m.grid, start, m.goal), ref = planPair(m.grid, m.start, m.goal);
    assert.equal(toA.routes.terrain.status, "OK");
    assert.notEqual(toA.routes.terrain.length_horizontal_m, ref.routes.terrain.length_horizontal_m);
    assert.ok(Math.abs(ref.routes.distance.length_horizontal_m - 416.4257) < 1e-3, "reference route unchanged");
  });

  it("derives a few markers from real route values only", () => {
    const r = planPair(m.grid, m.start, m.goal).routes.terrain;
    const marks = routeMarkers(r, m.grid, "HiRISE 2 m cells.");
    assert.ok(marks.length >= 3 && marks.length <= 8);
    assert.deepEqual([marks[0].kind, marks[marks.length - 1].kind], ["start", "goal"]);
    const steep = marks.find((x) => x.kind === "steepest")!;
    const maxGrade = Math.max(...r.profile.map((q) => Math.abs(q.grade)));
    assert.equal(Math.abs(r.profile[steep.index].grade), maxGrade);
    assert.ok(marks.every((x) => x.lines.at(-1)!.includes("Not modelled") && !/\bsafe\b|hazard-free/i.test(x.lines.join(" "))));
    assert.deepEqual(routeMarkers(null, m.grid, ""), []);
  });
});
