// Reference implementation of the CR-003 §7 loading algorithm, run fully offline.
// fetch() is replaced by a disk-only shim for "/data/..." URLs; any other URL throws (no network).
// Does not read pipeline/cache or any source GeoTIFF. Usage: node pipeline/probes/hirise/offline_loader_check.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const PUBLIC = fileURLToPath(new URL("../../../web/public/", import.meta.url));
globalThis.fetch = async (url) => {
  if (typeof url !== "string" || !url.startsWith("/data/")) throw new Error(`network blocked: ${url}`);
  const bytes = new Uint8Array(await readFile(join(PUBLIC, url)));
  return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (bytes) => hex(await crypto.subtle.digest("SHA-256", bytes));
const getBytes = async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer());
function jpegSize(b) {
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error("bad JPEG marker");
    const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xc2) return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8], components: b[i + 9] };
    i += 2 + len;
  }
  throw new Error("no SOF");
}

async function loadHirise(ctxMeta, level) {
  const index = JSON.parse(new TextDecoder().decode(await getBytes("/data/hirise/index.json"))).roi_a;
  if (!index || index.role !== "display_only") throw new Error("index role");
  if (index.aligned_to_ctx_dataset_version !== ctxMeta.dataset_version) throw new Error("not aligned to loaded CTX");
  const base = "/" + index.path;
  const mbytes = await getBytes(base + "manifest.json");
  const mhash = await sha256(mbytes);
  if (mhash !== index.manifest_sha256 || mhash.slice(0, 12) !== index.dataset_version) throw new Error("manifest hash");
  const m = JSON.parse(new TextDecoder().decode(mbytes));
  if (m.elevation.adjusted_to_ctx !== false || m.registration.applied_correction_m.east !== 0 || m.registration.applied_correction_m.north !== 0) throw new Error("adjusted");
  if (m.aligned_to_ctx_bundle.dataset_version !== ctxMeta.dataset_version) throw new Error("manifest CTX version");
  const e = m.extent_proj_m, c = ctxMeta;
  const ext = [c.x0, c.y0, c.x0 + c.nx * c.dx_proj, c.y0 - c.ny * c.dy_proj];
  if (Math.abs(e.x_min - ext[0]) > 1e-6 || Math.abs(e.y_max - ext[1]) > 1e-6 || Math.abs(e.x_max - ext[2]) > 1e-6 || Math.abs(e.y_min - ext[3]) > 1e-6) throw new Error("extent");
  const [dtmId, texId] = level === "high" ? ["dtm_2m", "ortho_0p5m"] : ["dtm_4m", "ortho_1m"];
  const out = { version: index.dataset_version, level };
  for (const id of [dtmId, texId]) {
    const g = m.grids[id];
    const entry = m.files.find((f) => f.file === g.file);
    const b = await getBytes(base + g.file);
    if (b.byteLength !== entry.bytes || (await sha256(b)) !== entry.sha256) throw new Error(`hash ${g.file}`);
    if (id.startsWith("dtm")) {
      if (b.byteLength !== g.nx * g.ny * 4) throw new Error("dtm length");
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      const h = new Float32Array(g.nx * g.ny);
      for (let i = 0; i < h.length; i++) h[i] = dv.getFloat32(i * 4, true); // little-endian scalar per cell
      out.dtm = { id, grid: g, h, nan: h.reduce((n, v) => n + (Number.isNaN(v) ? 1 : 0), 0) };
    } else {
      const s = jpegSize(b);
      if (s.width !== g.nx || s.height !== g.ny || s.components !== 1) throw new Error("jpeg size");
      out.tex = { id, width: s.width, height: s.height, components: s.components };
    }
  }
  out.labels = {
    offset_median_m: m.elevation.ctx_minus_hirise_at_20m_m.median,
    reg: m.registration.offset_hirise_minus_ctx_m, reg_unc: m.registration.estimated_uncertainty_m,
    lines: m.elevation.line_artifacts_1m_source.count, datum: m.elevation.vertical_reference.split(":")[0],
    dois: m.sources.map((s) => s.doi),
  };
  return out;
}

const ctxIndex = JSON.parse(new TextDecoder().decode(await getBytes("/data/index.json"))).roi_a;
const ctxMeta = JSON.parse(new TextDecoder().decode(await getBytes("/" + ctxIndex.path + "terrain.json")));
const results = {};
for (const level of ["high", "low"]) {
  const r = await loadHirise(ctxMeta, level);
  results[level] = { version: r.version, dtm: [r.dtm.id, r.dtm.grid.nx, r.dtm.grid.ny, "nan", r.dtm.nan], tex: [r.tex.id, r.tex.width, r.tex.height, r.tex.components] };
  if (level === "high") {
    const at = (row, col) => +r.dtm.h[row * r.dtm.grid.nx + col].toFixed(3);
    results.reference_cells = { landing: at(220, 426), rochette: at(631, 243), roubion: at(722, 448), sid: at(242, 470) };
    results.labels = r.labels;
  }
}
// negative checks: tampered bytes must be rejected
const realFetch = globalThis.fetch;
for (const target of ["dtm_2m.f32.bin", "ortho_0p5m.jpg", "manifest.json"]) {
  globalThis.fetch = async (url) => {
    const res = await realFetch(url);
    if (!url.endsWith(target)) return res;
    const b = new Uint8Array(await res.arrayBuffer()); b[100] ^= 0xff;
    return { ok: true, arrayBuffer: async () => b.buffer };
  };
  try { await loadHirise(ctxMeta, "high"); results[`tamper_${target}`] = "NOT REJECTED"; } catch (err) { results[`tamper_${target}`] = `rejected (${err.message})`; }
}
globalThis.fetch = realFetch;
try { await loadHirise({ ...ctxMeta, dataset_version: "000000000000" }, "high"); results.wrong_ctx = "NOT REJECTED"; } catch (err) { results.wrong_ctx = `rejected (${err.message})`; }
try { await fetch("https://example.com/x"); results.network = "NOT BLOCKED"; } catch { results.network = "blocked"; }
console.log(JSON.stringify(results, null, 1));
