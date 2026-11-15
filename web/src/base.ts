// ARES-1 hypothetical landing zone, base and camps (analysis/base, schema ares-base-scenario/1). Hash-checked, read-only.
// Scenario reference points computed by a stated rule; not NASA-evaluated, not a landing-site certification.
import { fail, sha256Hex, type Checked } from "./integrity.ts";

export type SiteKey = "landing_zone" | "base" | "camp_a" | "camp_b";
export interface Site {
  id: string; role: string; lat: number; lon: number; radius_m: number; evaluation: string; routable: boolean;
  slope_p50_deg?: number; slope_p95_deg?: number; slope_max_deg?: number; relief_m?: number; grid?: string;
  routable_note?: string; distance_to_perseverance_landing_m?: number;
}
export interface Candidate {
  id: string; name: string; lat: number; lon: number; note: string; slope_p50_deg: number; slope_p95_deg: number; slope_max_deg: number;
  relief_m: number; distance_m: Record<string, number>; distance_to_base_m: number;
}
export interface BaseScenario {
  schema: string; status: string; sites: Record<SiteKey, Site>; candidates: Candidate[];
  distances_from_base_m: Record<string, number>; rules: string; not_evaluated: string[]; limits: string[];
}
export interface LoadedBase { version: string; scenario: BaseScenario }

export const SITE_LABEL: Record<SiteKey, string> = {
  landing_zone: "Landing zone", base: "ARES Base", camp_a: "Camp Delta", camp_b: "Camp Neretva",
};

export async function loadBase(get: (url: string) => Promise<Checked<Uint8Array>>): Promise<Checked<LoadedBase>> {
  const idx = await get("/data/base/index.json");
  if (!idx.ok) return idx;
  let e: { version?: unknown; path?: unknown } | undefined;
  try {
    e = (JSON.parse(new TextDecoder().decode(idx.value)) as { base_scenario?: { version?: unknown; path?: unknown } }).base_scenario;
  } catch {
    return fail("DATASET INTEGRITY", "base index.json is not valid JSON");
  }
  if (typeof e?.version !== "string" || e.path !== `data/base/${e.version}/`) return fail("DATASET INTEGRITY", "base index entry is incomplete");
  const m = await get(`/${e.path}manifest.json`);
  if (!m.ok) return m;
  if ((await sha256Hex(m.value)).slice(0, 12) !== e.version) return fail("DATASET_VERSION_MISMATCH", "base manifest does not match its version");
  const list = JSON.parse(new TextDecoder().decode(m.value)) as { file: string; sha256: string }[];
  const s = await get(`/${e.path}base_scenario.json`);
  if (!s.ok) return s;
  if (list[0]?.file !== "base_scenario.json" || (await sha256Hex(s.value)) !== list[0].sha256) return fail("DATASET INTEGRITY", "base_scenario.json does not match the manifest");
  const scenario = JSON.parse(new TextDecoder().decode(s.value)) as BaseScenario;
  if (scenario.schema !== "ares-base-scenario/1" || !/HYPOTHETICAL/.test(scenario.status)) return fail("DATASET INTEGRITY", "base scenario schema or status is wrong");
  return { ok: true, value: { version: e.version, scenario } };
}
