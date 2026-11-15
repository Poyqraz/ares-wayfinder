import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { projToScene } from "@ares/core";
import { fail, type Checked } from "../src/integrity.ts";
import { loadRegionalRelief, reliefUv } from "../src/regionalRelief.ts";

const pub = new URL("../public/", import.meta.url);
const get = (edit?: (u: string, b: Uint8Array) => Uint8Array) => async (url: string): Promise<Checked<Uint8Array>> => {
  try {
    const b = new Uint8Array(readFileSync(new URL(url.replace(/^\//, ""), pub)));
    return { ok: true, value: edit ? edit(url, b) : b };
  } catch { return fail("DATASET INTEGRITY", url); }
};

describe("regional relief bundle (CR-006, display only)", () => {
  it("loads hash-checked, display-only, in the regional image's frame, with no NaN filled", async () => {
    const r = await loadRegionalRelief(get(), "d3d62fc34c56");
    assert.ok(r.ok, r.ok ? "" : r.failure.detail);
    if (!r.ok) return;
    const m = r.value.meta;
    assert.equal(m.role, "display_only_regional_relief");
    assert.deepEqual([m.nx, m.ny, m.dx_proj], [341, 178, 40]);
    assert.equal(m.gates.R3_registration, "UNRESOLVED");
    assert.match(m.vertical_reference, /^UNVERIFIED/);
    assert.ok(r.value.dem.every((h) => Number.isFinite(h)) && r.value.validity.every((v) => v === 0));
    for (const [row, col] of [[0, 0], [m.ny - 1, m.nx - 1], [89, 170]]) {
      const { u, v } = reliefUv(m, row, col);
      assert.ok(u > 0 && u < 1 && v > 0 && v < 1, `uv inside the image for ${row},${col}`);
    }
    // ground-true scene proportions (CR-005): 100 ground m east = 100 scene units
    const k = m.dx_ground_m / m.dx_proj, c = { E: m.x0 + 5000, N: m.y0 - 3000 };
    assert.ok(Math.abs(projToScene(m, { E: c.E + 100 / k, N: c.N }, -2000).x - projToScene(m, c, -2000).x - 100) < 1e-6);
  });

  it("refuses tampering, a wrong index role and a texture from another basemap", async () => {
    const flip = (b: Uint8Array) => { const c = new Uint8Array(b); c[64] ^= 0xff; return c; };
    assert.equal((await loadRegionalRelief(get((u, b) => (u.endsWith("dem.f32.bin") ? flip(b) : b)), "d3d62fc34c56")).ok, false);
    assert.equal((await loadRegionalRelief(get((u, b) => (u.endsWith("terrain.json") ? flip(b) : b)), "d3d62fc34c56")).ok, false);
    const role = get((u, b) => (u.endsWith("regional_dem/index.json") ? new TextEncoder().encode(new TextDecoder().decode(b).replace("display_only_regional_relief", "analysis")) : b));
    assert.equal((await loadRegionalRelief(role, "d3d62fc34c56")).ok, false);
    assert.equal((await loadRegionalRelief(get(), "000000000000")).ok, false);
  });
});
