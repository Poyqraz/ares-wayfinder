// S14: the M0-A-B-C mission structure. B is Amalik (Shuyak and Mageik), the former B is C, and B has no route because
// it lies outside the validated grid. The frozen catalog and basemap ids are untouched.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { geoToProj, projToCell } from "@ares/core";
import { loadAres1Catalog } from "../src/ares1.ts";
import { greatCircleM } from "../src/destinationView.ts";
import { fail, type Checked } from "../src/integrity.ts";
import { AMALIK, B_IMAGERY, B_OUTSIDE_M0A_M, B_SOURCES, B_UNCERTAINTY, MAGEIK_EXTRA, SHUYAK } from "../src/missionB.ts";
import { isExplore, missionPoint, MISSION_IDS, MISSIONS } from "../src/missions.ts";
import { loadM0A, loadRegional } from "../src/regions.ts";
import { scienceTargets } from "../src/science.ts";

globalThis.URL.createObjectURL ??= () => "blob:test";
const pub = new URL("../public/", import.meta.url);
const bytes = (url: string) => new Uint8Array(readFileSync(new URL(url.replace(/^\//, ""), pub)));
const get = async (url: string): Promise<Checked<Uint8Array>> => { try { return { ok: true, value: bytes(url) }; } catch { return fail("DATASET INTEGRITY", url); } };

describe("ARES-1 missions M0, A, B, C", async () => {
  const atlas = await loadAres1Catalog(async (url) => { try { return bytes(url); } catch { return null; } }), regional = await loadRegional(get), m0a = await loadM0A(get);
  assert.ok(atlas.ok && regional.ok && m0a.ok);
  if (!atlas.ok || !regional.ok || !m0a.ok) return;
  const targets = scienceTargets(atlas.catalog), of = (id: string) => targets.filter((t) => t.mission === id), by = (id: string) => targets.find((t) => t.id === id)!;

  it("four missions; B is Amalik, C is the former B with its frozen record ids", () => {
    assert.deepEqual(MISSION_IDS, ["M0", "A", "B", "C"]);
    assert.match(MISSIONS.B.title, /Amalik \/ Enchanted Lake/);
    assert.match(MISSIONS.C.title, /Bright Angel/);
    assert.equal(MISSIONS.C.waypoint, "waypoint:B");
    assert.ok(MISSIONS.C.records.some((r) => /mission B in the frozen catalog 572fba1ce61f/.test(r)));
    assert.deepEqual(atlas.catalog.missions.map((m) => m.id), ["M0", "A", "B"], "the catalog itself is unchanged");
    assert.deepEqual([isExplore("M0"), isExplore("A"), isExplore("B"), isExplore("C"), isExplore(null)], [false, false, false, true, false]); // B is routed on the wider grid since S15
    assert.deepEqual(missionPoint("B", regional.value), { lat: SHUYAK.lat, lon: SHUYAK.lon });
    const c = regional.value.meta.features_px_in_science_6m["waypoint:B"];
    assert.deepEqual(missionPoint("C", regional.value), { lat: c.lat, lon: c.lon });
  });

  it("Bright Angel's records moved to C unchanged; nothing was dropped", () => {
    assert.deepEqual(of("C").map((t) => t.id).sort(), ["rock:cheyava_falls", "sample:M2020-01215-28"]);
    assert.equal(of("M0").length, 10);
    assert.equal(of("A").length, 2);
    assert.match(by("rock:cheyava_falls").limits, /inspection only/);
  });

  it("B: the outcrop and its two cores, with coring, sealing and depot drop kept apart", () => {
    assert.deepEqual(of("B").map((t) => t.id), [AMALIK.id, SHUYAK.id, "sample:M2020-00579-17"]);
    const shuyak = by(SHUYAK.id), mageik = by("sample:M2020-00579-17");
    assert.deepEqual([shuyak.marker, mageik.marker], [AMALIK.id, AMALIK.id], "the cores share the outcrop's marker: no drill-hole coordinate is invented");
    assert.ok(shuyak.facts.some((f) => /Cored on sol 575/.test(f)) && shuyak.facts.some((f) => /on the rover \(not in the Three Forks depot\)/.test(f)));
    assert.ok(mageik.facts.some((f) => /Cored on sol 579; sealed on sol 619/.test(f)), "Mageik: coring and sealing sols from the catalog");
    assert.ok(mageik.facts.some((f) => /Placed at the Three Forks depot on sol 655/.test(f)), "Mageik: depot drop from the catalog");
    assert.ok(of("M0").find((t) => t.name === "Mageik")!.facts.some((f) => /Collected at: Amalik \(the outcrop of mission B\)/.test(f)), "the depot tube points back at B");
    // the catalog's Mageik position and the transcribed Shuyak position are the same place to within a rover length
    const rp = (atlas.catalog.samples.find((s) => s.sample_designation === MAGEIK_EXTRA.designation) as unknown as { sampling_event: { rover_position: { lat_deg: number; lon_deg_east: number } } }).sampling_event.rover_position;
    assert.ok(greatCircleM({ lat: rp.lat_deg, lon: rp.lon_deg_east }, SHUYAK) < 0.5);
    for (const t of of("B")) assert.match(t.position, /rover position/i);
  });

  it("B lies outside the frozen M0-A grid by the stated distance; it is routed on the wider grid only (S15)", () => {
    const meta = m0a.value.grid.meta, proj = geoToProj(meta, { lat: SHUYAK.lat, lon: SHUYAK.lon });
    assert.equal(projToCell(meta, proj), null);
    const west = ((meta.x0 - proj.E) / meta.dx_proj) * meta.dx_ground_m;
    assert.equal(Math.round(west), B_OUTSIDE_M0A_M);
    const row = (meta.y0 - proj.N) / meta.dy_proj;
    assert.ok(row > 0 && row < meta.ny, "it is beside the grid, not beyond its north or south edge");
    assert.ok(MISSIONS.B.readiness.some((x) => new RegExp(`${B_OUTSIDE_M0A_M} m outside the frozen M0–A grid`).test(x.label)));
    for (const t of of("B")) assert.match(t.limits, /candidate corridors on the wider M0–A–B grid \(prototype\)/);
  });

  it("straight-line distances are of the size the research hand-off gives, and are never called routes", () => {
    const m0 = missionPoint("M0", regional.value)!, wildcat = by("outcrop:wildcat_ridge"), skinner = by("outcrop:skinner_ridge");
    assert.ok(Math.abs(greatCircleM(m0, SHUYAK) - 406) < 6, `M0 reference to B ${greatCircleM(m0, SHUYAK).toFixed(0)} m`);
    assert.ok(Math.abs(greatCircleM(wildcat, SHUYAK) - 533) < 6 && Math.abs(greatCircleM(skinner, SHUYAK) - 555) < 6);
  });

  it("wording: no life detection, uncertainty stated, every source and image has a link", () => {
    const text = JSON.stringify({ b: of("B"), AMALIK, B_UNCERTAINTY, m: MISSIONS.B });
    assert.ok(!/life (was |has been )?(detected|found|confirmed)|biosignature (was |has been )?(detected|found|confirmed)|\bsafe\b|approved waypoint/i.test(text.replace(/No sign of life has been found here|No evidence of life has been established/g, "")));
    assert.ok(B_UNCERTAINTY.some((u) => /not the drill holes, not the rock and not a surveyed astronaut waypoint/.test(u)));
    assert.ok(B_UNCERTAINTY.some((u) => /Bosak et al\. \(2024\) appears to show the reverse/.test(u)), "the source disagreement is kept, not hidden");
    for (const s of [...B_SOURCES, ...B_IMAGERY]) assert.match(s.url, /^https:\/\/(science\.nasa\.gov|www\.jpl\.nasa\.gov|pds-geosciences\.wustl\.edu|an\.rsl\.wustl\.edu|doi\.org)\//);
  });
});
