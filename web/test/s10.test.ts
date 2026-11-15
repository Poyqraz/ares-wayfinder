// S10: science targets come straight from the catalog's recorded rover positions; the x3 EVA display changes only the
// drawn height; route markers are few, spaced, and built from measured route values.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { loadAres1Catalog } from "../src/ares1.ts";
import { fail, type Checked } from "../src/integrity.ts";
import { loadRoiA } from "../src/load.ts";
import { demoEndpoints, planPair } from "../src/plan.ts";
import { loadM0A } from "../src/regions.ts";
import { MAX_ROUTE_MARKERS, routeMarkers } from "../src/routeMarkers.ts";
import { scienceTargets } from "../src/science.ts";
import { routeTerrain } from "../src/traverse.ts";
import { displayPose, EYE_HEIGHT_M, surfaceHeight, walkPose } from "../src/walk.ts";

globalThis.URL.createObjectURL ??= () => "blob:test";
const pub = new URL("../public/", import.meta.url);
const bytes = (url: string) => new Uint8Array(readFileSync(new URL(url.replace(/^\//, ""), pub)));
const get = async (url: string): Promise<Checked<Uint8Array>> => { try { return { ok: true, value: bytes(url) }; } catch { return fail("DATASET INTEGRITY", url); } };
globalThis.fetch = (async (url: unknown) => { try { return new Response(bytes(String(url))); } catch { return new Response(null, { status: 404 }); } }) as typeof fetch;

describe("science targets", async () => {
  const atlas = await loadAres1Catalog(async (url) => { try { return bytes(url); } catch { return null; } });
  assert.ok(atlas.ok);
  if (!atlas.ok) return;
  const raw = JSON.parse(new TextDecoder().decode(bytes("/data/ares1/catalog/572fba1ce61f/catalog.json")));
  const targets = scienceTargets(atlas.catalog);

  it("M0: ten samples, each at the PDS rover position of its own drop, never at a tube position", () => {
    const m0 = targets.filter((t) => t.mission === "M0");
    assert.equal(m0.length, 10);
    assert.equal(new Set(m0.map((t) => t.name)).size, 10);
    for (const t of m0) {
      const drop = raw.depot_drop_events.find((d: { id: string }) => d.id === t.id);
      assert.ok(drop, t.id);
      assert.equal(t.lat, drop.rover_position.lat_deg);
      assert.equal(t.lon, drop.rover_position.lon_deg_east);
      assert.equal(drop.tube_center.status, "NOT_AVAILABLE");
      assert.equal(drop.tube_center.lat_deg, null);
      assert.match(t.position, /rover position during the tube drop/);
      assert.match(t.limits, /Tube-centre coordinates are not published/);
      assert.ok(t.why.length > 20 && t.facts.length >= 3);
    }
    assert.ok(m0.some((t) => /witness/i.test(t.what)) && m0.some((t) => /atmosphere/i.test(t.what)));
  });

  it("A: Skinner Ridge and Wildcat Ridge as separate outcrops with their cores; B: rock and core kept apart, life never claimed", () => {
    const a = targets.filter((t) => t.mission === "A");
    assert.deepEqual(a.map((t) => t.name).sort(), ["Skinner Ridge", "Wildcat Ridge"]);
    assert.ok(a[0].lat !== a[1].lat || a[0].lon !== a[1].lon);
    assert.ok(a.every((t) => t.facts.filter((f) => f.startsWith("Core ")).length === 2 && /rover position during sampling/.test(t.position)));
    const rock = targets.find((t) => t.kind === "rock")!, core = targets.find((t) => t.kind === "core")!;
    assert.equal(rock.name, "Cheyava Falls");
    assert.equal(core.name, "Sapphire Canyon");
    assert.equal(core.marker, rock.id, "the core shares the rock's marker: one recorded position, not two invented ones");
    assert.match(rock.what, /not a waterfall or a sample/);
    assert.ok(rock.facts.includes("No evidence of life has been established."));
    assert.match(rock.limits, /inspection only/);
    const text = JSON.stringify(targets);
    assert.ok(!/life (was )?(detected|found|confirmed)|confirmed biosignature|\bsafe\b/i.test(text));
  });
});

describe("x3 EVA display and route markers on the real bundles", async () => {
  const m0a = await loadM0A(get), roi = await loadRoiA();
  assert.ok(m0a.ok && roi.ok);
  if (!m0a.ok || !roi.ok) return;
  const ends = demoEndpoints(roi.value.meta, roi.value.pois);
  assert.ok(ends.ok);
  if (!ends.ok) return;
  const cases = [
    ["M0-A", m0a.value, planPair(m0a.value.grid, m0a.value.start, m0a.value.goal).routes] as const,
    ["ROI-A", roi.value, planPair(roi.value.grid, ends.value.start, ends.value.goal).routes] as const,
  ];

  it("the camera stands 1.7 m above the drawn ground at x1 and at x3, at the same map position, along the whole route", () => {
    for (const [name, data, routes] of cases) for (const route of [routes.distance, routes.terrain]) {
      const hMin = data.meta.h_min;
      for (let q = 0; q <= 600; q++) {
        const s = (route.length_horizontal_m * q) / 600, one = displayPose(data.grid, route, s, 1, hMin), three = displayPose(data.grid, route, s, 3, hMin), real = walkPose(data.grid, route, s);
        assert.ok(one.clearance_m >= EYE_HEIGHT_M - 1e-6 && three.clearance_m >= EYE_HEIGHT_M - 1e-6, `${name}: clearance at sample ${q}`);
        assert.deepEqual([three.eye.E, three.eye.N, three.look.E, three.look.N], [one.eye.E, one.eye.N, one.look.E, one.look.N], "exaggeration never moves the walker on the map");
        assert.ok(Math.abs(one.eye.y - (real.eye.h - hMin)) < 1e-9, "x1 is the true geometry");
        assert.ok(Math.abs(three.eye.y - ((real.ground_m - hMin) * 3 + EYE_HEIGHT_M)) < 1e-9, "x3: ground height tripled, eye height not");
        const surface = surfaceHeight(data.grid, three.eye.E, three.eye.N);
        if (Number.isFinite(surface)) assert.ok(three.eye.y - (surface - hMin) * 3 >= EYE_HEIGHT_M - 1e-6, "above the drawn x3 mesh");
      }
    }
  });

  it("markers: at most eight, ordered, spaced, and each claim is the measured extreme it names", () => {
    for (const [name, data, routes] of cases) for (const route of [routes.distance, routes.terrain]) {
      const marks = routeMarkers(route, data.grid, "note.", { meta: data.meta, pois: data.pois, slopeSigmaDeg: name === "M0-A" ? 4 : null });
      assert.ok(marks.length >= 3 && marks.length <= MAX_ROUTE_MARKERS, `${name}: ${marks.length} markers`);
      assert.equal(new Set(marks.map((m) => m.id)).size, marks.length);
      assert.deepEqual([marks[0].kind, marks.at(-1)!.kind], ["start", "goal"]);
      assert.ok(marks.every((m, k) => k === 0 || m.index >= marks[k - 1].index));
      const steps = routeTerrain(data.grid, route), nx = data.grid.meta.nx;
      const ground = marks.find((m) => m.kind === "ground"), cross = marks.find((m) => m.kind === "cross");
      if (ground) assert.equal(data.grid.slope[route.cells[ground.index].row * nx + route.cells[ground.index].col], Math.max(...route.cells.slice(1).map((c) => data.grid.slope[c.row * nx + c.col])));
      if (cross) assert.equal(steps[cross.index - 1].cross_slope_deg, Math.max(...steps.map((q) => (Number.isFinite(q.cross_slope_deg) ? q.cross_slope_deg : -1))));
      const optional = marks.filter((m) => !["start", "goal", "steepest"].includes(m.kind)), gap = Math.max(6, route.length_horizontal_m * 0.05);
      for (const m of optional) for (const o of marks) if (o !== m) assert.ok(Math.abs(o.s_m - m.s_m) >= gap - 1e-9, `${name}: ${m.id} is clear of ${o.id}`);
      assert.ok(marks.every((m) => /not a hazard or safety rating/.test(m.lines.at(-1)!) && !/\bsafe\b|hazard-free|obstacle-free/i.test(m.lines.join(" "))));
    }
    const m0aMarks = routeMarkers(cases[0][2].terrain, cases[0][1].grid, "", { meta: cases[0][1].meta, pois: cases[0][1].pois, slopeSigmaDeg: 4 });
    assert.ok(m0aMarks.find((m) => m.kind === "goal")!.lines.some((t) => t.startsWith("At a recorded position:")), "arrival names the recorded position at the destination");
    assert.ok(m0aMarks.some((m) => m.kind === "ground" && m.lines.some((t) => t.includes("Uncertain: independent stereo models"))));
  });
});
