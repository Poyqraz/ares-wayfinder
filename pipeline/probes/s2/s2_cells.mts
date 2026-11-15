// S2: CTX and HiRISE grid cells and heights for the PDS-verified target coordinates, via @ares/core.
// Usage: node --experimental-strip-types pipeline/probes/s2/s2_cells.mts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const W = fileURLToPath(new URL("../../../", import.meta.url));
const { geoToProj, projToCell, cellCenter, projToGeo } = await import(new URL("../../../core/src/coords.ts", import.meta.url).href);
const D = W + "web/public/data/";
const t = JSON.parse(readFileSync(D + "roi_a/fc22a0c8a91f/terrain.json", "utf8"));
const dem = new Float32Array(readFileSync(D + "roi_a/fc22a0c8a91f/dem.f32.bin").buffer.slice(0));
const val = readFileSync(D + "roi_a/fc22a0c8a91f/validity.u8.bin");
const m = JSON.parse(readFileSync(D + "hirise/roi_a/e88cfab318e6/manifest.json", "utf8"));
const g = m.grids.dtm_2m;
const hb = readFileSync(D + "hirise/roi_a/e88cfab318e6/" + g.file);
const hi = new Float32Array(hb.buffer.slice(hb.byteOffset, hb.byteOffset + hb.byteLength));
const hgrid = { nx: g.nx, ny: g.ny, x0: g.x0, y0: g.y0, dx_proj: g.dx_proj, dy_proj: g.dy_proj };
const pts = [
  ["landing (working)", 18.44463, 77.45088, null],
  ["landing PLACES best_interp SITE 1", 18.444627146, 77.450885729, -2569.910],
  ["landing PLACES best_tactical SITE 1", 18.444571297, 77.450910771, -2569.721],
  ["roubion (working)", 18.42769, 77.45165, null],
  ["roubion Initial Report M2020-164-2", 18.42769340, 77.45165066, -2584.96],
  ["rochette (working)", 18.43074, 77.44437, null],
  ["rochette Initial Report M2020-190-3/196-4", 18.43074132, 77.44436502, -2574.553],
  ["sid (working)", 18.44386, 77.45242, null],
  ["sid Initial Report M2020-371-9/374-10", 18.44386406, 77.45242176, -2568.357],
  ["sid PLACES ROVER 11/108 parked pose", 18.443901625, 77.452434450, null],
];
const out = [];
for (const [name, lat, lon, pdsH] of pts) {
  const q = geoToProj(t, { lat, lon });
  const c = projToCell(t, q);
  const hc = projToCell(hgrid, q);
  const ctxH = c ? dem[c.row * t.nx + c.col] : NaN;
  const hiH = hc ? hi[hc.row * g.nx + hc.col] : NaN;
  const cc = c ? cellCenter(t, c) : null;
  out.push({ name, E: +q.E.toFixed(2), N: +q.N.toFixed(2), ctx_cell: c ? [c.row, c.col] : null, ctx_validity: c ? val[c.row * t.nx + c.col] : null,
    dist_to_ctx_cell_centre_m: cc ? +Math.hypot(q.E - cc.E, q.N - cc.N).toFixed(1) : null,
    hirise_2m_cell: hc ? [hc.row, hc.col] : null, ctx_h: +ctxH.toFixed(3), hirise_h: +hiH.toFixed(3),
    pds_elev_areoid: pdsH, ctx_minus_pds: pdsH === null ? null : +(ctxH - pdsH).toFixed(2), hirise_minus_pds: pdsH === null ? null : +(hiH - pdsH).toFixed(2) });
}
console.log(JSON.stringify(out, null, 0).replaceAll("},{", "},\n{"));
