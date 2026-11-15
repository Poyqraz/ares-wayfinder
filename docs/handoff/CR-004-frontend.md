# Handoff to Cursor — CR-004 POI status display (paste the prompt below into Cursor)

Worktree: your H3 worktree, on a NEW branch from `feat/hirise-display` @ `336dccc`
(e.g. `feat/cr004-status`). Use PowerShell for `pnpm`.

```
GATED: CR-004 is approved in principle (optional POI evidence record). This task is ONLY the frontend
status display. Do NOT change web/public/data/ (the live dataset migration is a separate, approved step).
Do NOT edit core/, contracts/, pipeline/, science/. Do not merge, rebase or push. Local agent only.

Read first (copy them from feat/data-core @ d2b85b7 if missing in your branch):
  docs/decisions/CR-004-poi-evidence.md       (schema, rules, exact labels, compatibility matrix)
  docs/handoff/cr004_display_fixture.json     (12 golden cases: input POI -> expected statuses/labels)
  science/s2_release/pois.v2.proposed.json    (candidate POIs with evidence; use as a TEST FIXTURE only)
  pipeline/poi_evidence.py                    (reference implementation of display_status)

1) Types: import PoiEvidence and Poi.evidence from @ares/contracts (already defined in contracts/types.ts on
   feat/data-core; bring contracts/ over unchanged, do not edit it). Define no local copy. parsePois keeps
   accepting POIs without evidence (v1.0.0 data).

2) Port display_status to web/src/poiStatus.ts, field for field (CR-004 §2-§3):
   - statuses come ONLY from evidence; confidence never yields VERIFIED;
   - coordinate VERIFIED only if |geo - evidence.coordinate_source.printed| <= 1e-9 deg in lat and lon;
   - invalid/unknown evidence (schema != "ares-poi-evidence/1", missing field, bad enum,
     role.validated_habitat !== false) -> legacy statuses + notice
     "POI evidence record invalid; showing legacy statuses";
   - no evidence -> legacy labels ("Coordinates UNVERIFIED (no evidence record)", "Target location:
     precision unknown", "CTX DEM/image registration UNRESOLVED (S-4)", "Vertical datum UNVERIFIED").

3) Field mapping (replace every confidence === "low" check):
   - web/src/map.tsx:249 aria-label and :256 badge -> badges from poiStatus:
     coordinate VERIFIED -> "PDS POSITION ✓"; target APPROXIMATE -> "TARGET APPROX.";
     coordinate UNVERIFIED/legacy -> "UNVERIFIED". Keep data-testid="poi-unverified" ONLY on the
     UNVERIFIED badge; add data-testid="poi-pds-verified" and "poi-target-approx".
   - web/src/panels.tsx:176 catalogue flag -> same badges.
   - web/src/panels.tsx:231 card: replace the single S2 line with four lines (testids poi-coord-status,
     poi-target-precision, poi-registration, poi-datum) using the exact labels; add poi-elevation with elevation_label (provenance only: never in the profile, numbers panel or HUD); add poi-role with
     role.text when present; show coordinate_source.product + locator + url, printed lat/lon/elev,
     convention, cross_checks (source, delta_m), and science.samples/geology/events/references.
   - web/src/TerrainView.tsx:824 static "Coordinates UNVERIFIED (S2)…": replace the S2 clause with a
     per-dataset summary derived from the loaded POIs (e.g. "POI coordinates: 4 PDS-verified rover/
     landing positions; sample targets APPROXIMATE" or, for legacy data, "POI coordinates UNVERIFIED").
     KEEP verbatim: "Vertical datum is the DEM model height", "Horizontal distances stay in metres",
     "No measured EVA time or surface hazard is shown", "Minetti costs stay as model limits only", and
     ADD a global line "CTX DEM/image registration UNRESOLVED (S-4)".
   - Never remove the global S-4 / vertical-datum notes in 2D or 3D.

4) Remove hard-coded dataset versions: web/e2e/terrain.spec.ts:362-363 and web/test/hirise.test.ts:31,40
   must read /data/index.json and /data/hirise/index.json.

5) Tests (must pass against BOTH data versions):
   - unit: every case in cr004_display_fixture.json -> poiStatus output equals "expected" exactly;
   - unit: confidence "high" without evidence -> UNVERIFIED;
   - e2e on the CURRENT data (no evidence): 4 "UNVERIFIED" badges, legacy card lines, global S-4 line;
   - component test (no loader, no integrity bypass): render the POI card/badges from the parsed
     pois.v2.proposed.json objects and compare with the fixture;
   - e2e on the CANDIDATE data: ONLY against the real candidate bundles once the data commit exists
     on the release branch (CTX 7ec72147790e / 05fddbe4d280, HiRISE 376dcb1220c4). Never weaken or
     bypass SHA-256 integrity checks to test. Expect 4 "PDS POSITION ✓",
     4 "TARGET APPROX." (landing included), landing role text containing "not a validated astronaut habitat",
     route numbers unchanged (969.161 m, 1093.229 / 1058.299, LOWER);
   - e2e writes screenshots ONLY to test-results/ (h3-ui-labels.png is currently overwritten in
     docs/handoff/ during e2e - fix that).

Acceptance: pnpm -r test, pnpm --filter @ares/web build, 5x pnpm --filter @ares/web test:e2e all pass;
git status clean after e2e. Report: branch, SHA, changed paths, raw outputs, screenshots of the POI card
(legacy and candidate), what you could not verify.
```
