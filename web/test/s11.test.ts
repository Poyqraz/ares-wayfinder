// S11: the Regional Relief 3D markers are the same places as on the 2D Mission Control map, with the same caveats.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { projToGeo, sceneToProj } from "@ares/core";
import { loadAres1Catalog } from "../src/ares1.ts";
import { loadBase } from "../src/base.ts";
import { loadFeatures } from "../src/features.ts";
import { fail, type Checked } from "../src/integrity.ts";
import { missionPoint, MISSION_IDS, MISSIONS } from "../src/missions.ts";
import { loadRegional } from "../src/regions.ts";
import { loadRegionalRelief, reliefScene } from "../src/regionalRelief.ts";
import { reliefMarkers } from "../src/reliefMarkers.ts";
import { scienceTargets } from "../src/science.ts";

globalThis.URL.createObjectURL ??= () => "blob:test";
const pub = new URL("../public/", import.meta.url);
const bytes = (url: string) => new Uint8Array(readFileSync(new URL(url.replace(/^\//, ""), pub)));
const get = async (url: string): Promise<Checked<Uint8Array>> => { try { return { ok: true, value: bytes(url) }; } catch { return fail("DATASET INTEGRITY", url); } };

describe("regional relief mission markers", async () => {
  const regional = await loadRegional(get), base = await loadBase(get), features = await loadFeatures(get);
  const atlas = await loadAres1Catalog(async (url) => { try { return bytes(url); } catch { return null; } });
  assert.ok(regional.ok && base.ok && features.ok && atlas.ok);
  if (!regional.ok || !base.ok || !features.ok || !atlas.ok) return;
  const relief = await loadRegionalRelief(get, regional.value.meta.version);
  assert.ok(relief.ok);
  if (!relief.ok) return;
  const science = scienceTargets(atlas.catalog);
  const { markers, boxes } = reliefMarkers({ regional: regional.value, base: base.value, science, features: features.value });
  const by = (id: string) => markers.find((m) => m.id === id)!;

  it("has every Mission Control location once, at the coordinates the 2D map uses", () => {
    assert.equal(markers.length, 4 + 4 + 17 + 3); // sites, missions M0 A B C, science targets (14 catalog + Amalik and its two cores), features
    assert.equal(new Set(markers.map((m) => m.id)).size, markers.length);
    for (const [key, s] of Object.entries(base.value.scenario.sites)) assert.deepEqual([by(`site:${key}`).lat, by(`site:${key}`).lon], [s.lat, s.lon]);
    for (const t of science) assert.deepEqual([by(t.id).lat, by(t.id).lon], [t.lat, t.lon]);
    for (const f of features.value.features) assert.deepEqual([by(`feature:${f.feature_id}`).lat, by(`feature:${f.feature_id}`).lon], [f.anchor.lat, f.anchor.lon]);
    for (const id of MISSION_IDS) {
      const w = missionPoint(id, regional.value)!;
      assert.deepEqual([by(`mission:${id}`).lat, by(`mission:${id}`).lon], [w.lat, w.lon]);
    }
    assert.equal(MISSIONS.C.waypoint, "waypoint:B", "Bright Angel keeps the frozen basemap's waypoint id");
    assert.deepEqual(boxes.map((b) => b.id), ["roi_a", "m0a_analysis"]);
    assert.ok(boxes.every((b) => b.corners.length === 4 && /routes can be computed inside this box only/.test(b.note)));
  });

  it("stands on the drawn relief: map position unchanged, height is the 40 m cell times the exaggeration", () => {
    const meta = relief.value.meta;
    for (const m of markers) {
      const one = reliefScene(relief.value, m.lat, m.lon, 1), three = reliefScene(relief.value, m.lat, m.lon, 3);
      assert.ok(one && three, `${m.id} is on the relief grid`);
      const back = projToGeo(meta, sceneToProj(meta, one!));
      assert.ok(Math.abs(back.lat - m.lat) < 1e-7 && Math.abs(back.lon - m.lon) < 1e-7, `${m.id}: scene position maps back to its latitude and longitude`);
      assert.deepEqual([three!.x, three!.z], [one!.x, one!.z], "exaggeration never moves a marker on the map");
      assert.ok(Math.abs(three!.y - 3 * one!.y) < 1e-6 && one!.y >= 0, "only the height scales");
    }
    assert.equal(reliefScene(relief.value, 0, 0, 1), null, "off the grid: no marker");
  });

  it("keeps the distinctions: hypothetical sites, rover positions, evidence status, no routing at B, nothing joined by a route", () => {
    for (const m of markers.filter((x) => x.group === "site")) {
      assert.match(m.kind, /Hypothetical/);
      assert.match(m.limits, /Not evaluated or approved by NASA/);
      assert.ok(m.shape === "flag" || m.shape === "base");
    }
    assert.match(by("site:camp_b").limits, /no route can be planned/);
    const samples = markers.filter((m) => m.id.startsWith("drop:"));
    assert.equal(samples.length, 10);
    for (const m of samples) {
      assert.match(m.evidence, /rover position during the tube drop/);
      assert.match(m.limits, /Tube-centre coordinates are not published/);
      assert.ok(m.showWithin_m < 5000 && m.labelWithin_m < 1000, "sample markers and labels appear only close in");
    }
    assert.equal(by("sample:M2020-01215-28").drawAs, "rock:cheyava_falls");
    assert.match(by("rock:cheyava_falls").limits, /inspection only/);
    assert.match(by("mission:C").limits, /Route planning at C is disabled/);
    assert.match(by("mission:B").limits, /wider M0–A–B grid.*owner-approved for prototype analysis/);
    assert.match(by("feature:F01").kind, /measured, geology review pending/);
    assert.match(by("feature:F02").kind, /literature only, not measured/);
    assert.match(by("feature:F03").kind, /literature only, not measured/);
    for (const id of MISSION_IDS) assert.match(by(`mission:${id}`).evidence, /not a sample, tube or rock point/);
    assert.ok(!/\bsafe\b|validated route|life (detected|found|confirmed)/i.test(JSON.stringify({ markers, boxes })));
    // label density: from far away only a handful of labels are eligible
    const farLabels = markers.filter((m) => !m.drawAs && m.showWithin_m === Infinity && m.labelWithin_m === Infinity);
    assert.ok(farLabels.length <= 5, `${farLabels.length} labels from far away`);
  });
});
