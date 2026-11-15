# S2 data release — prepared, NOT applied

Status: **prepared and dry-run verified; awaiting the CR-004 frontend status display and your explicit
approval of the combined release.** The current release is untouched:
- CTX `roi_a/fc22a0c8a91f`, `roi_b/5ee3aeb913b6`;
- HiRISE `e88cfab318e6`;
- H3 = `feat/hirise-display` @ `336dccc`;
- `main` = `2d255d6`.

Schema: `docs/decisions/CR-004-poi-evidence.md`. Data: `science/s2_release/pois.v2.proposed.json`.

## 1. Candidate versions (deterministic for the current `pois.v2.proposed.json` + the patch below)

The landing target changed to APPROXIMATE after the full dry run. The versions below were recomputed
exactly from the manifests: the same method reproduces the current versions and the earlier dry-run
versions `733c0a18de20` / `3bd716d1238b` / `12e69a388072`. `pois.json` is not a routing input, so the dry
run's route-equivalence result still applies. Re-run D1–D6 at release.

| Bundle | Current | Candidate | Difference |
|---|---|---|---|
| CTX ROI-A | `fc22a0c8a91f` | `7ec72147790e` | only `pois.json`; `terrain.json` only `dataset_version` |
| CTX ROI-B | `5ee3aeb913b6` | `05fddbe4d280` | only `pois.json` |
| HiRISE ROI-A | `e88cfab318e6` | `376dcb1220c4` | 4 data files byte-identical; manifest only `aligned_to_ctx_bundle.dataset_version` + one reference string |
| `core/test/golden/oracle_roi_a.json` | version `fc22a0c8a91f` | `7ec72147790e` | only the version line; 16 cases and POI cells identical |

## 2. Evidence that analysis results do not change (dry run in a fresh checkout)

- **Route equivalence** (`pipeline/probes/s2/route_equivalence.mts`), old vs candidate bundle:
  - 1 608 route results per ROI: 2 cost curves × {no gate, 15° gate} × 2 modes × (demo + 200 random pairs);
  - **0 differences** in cells, `vertices_proj`, profile, lengths, ascent/descent and costs, ROI-A and ROI-B.
- Demo: 969.161 m; Minetti 1093.229 / 1058.299; Tobler 1028.229 / 1008.018; LOWER (identical).
- Core 33/33, including X1 parity with the regenerated golden; pipeline 12/12; HiRISE validator passes;
  the offline HiRISE loader accepts `376dcb1220c4` and rejects all tampering.
- Code: no change in `core/`, `contracts/` or the route engine. `pipeline/hirise_bundle.py` changes by 2
  lines (it reads the CTX folder from `index.json`).

## 3. Line-ending defect: fixed and verified (done on `feat/data-core`)

- `b8eae55` + `a8f080a`: `.gitattributes` now has `science/**/*.json -text`.
- Fresh worktree with `core.autocrlf=true`:
  - 0 CRs in `science/*.json` and `science/s2_release/*.json`;
  - all 32 bundle file hashes, manifests and `terrain.json` hashes verify;
  - **rebuilding the current release reproduces `fc22a0c8a91f`, `5ee3aeb913b6`, `e88cfab318e6`
    byte-for-byte** (clean `git status`).

## 4. Exact files changed by the release (data commit)

| File | Change |
|---|---|
| `science/pois.json` | ← `science/s2_release/pois.v2.proposed.json` (byte copy) |
| `pipeline/hirise_bundle.py` | `CTX_DIR` from `index.json`; reference string uses the folder name (2 lines) |
| `web/public/data/roi_a/7ec72147790e/`, `roi_b/05fddbe4d280/` | **added** (t04) |
| `web/public/data/hirise/roi_a/376dcb1220c4/` | **added** (`hirise_bundle.py`) |
| `web/public/data/index.json`, `web/public/data/hirise/index.json` | point to the candidates |
| `core/test/golden/oracle_roi_a.json` | version line (`oracle.py`) |
| `science/hirise_bundle_validation_roi_a.md` | regenerated |
| `contracts/types.ts`, `contracts/CONTRACT.md` | already done on `feat/data-core` (optional `PoiEvidence`; `CONTRACT_VERSION` 1.0.0 → 1.1.0 decided at release) |

**Kept, unchanged (immutable):**
- `roi_a/fc22a0c8a91f`, `roi_b/5ee3aeb913b6`, `hirise/roi_a/e88cfab318e6`;
- the older `e7c8cb43f83a` and `43038eec7103`.

Removal of superseded folders is a separate, later step, after compatibility is accepted.

Frontend commit (Cursor; see `docs/handoff/CR-004-frontend.md`):
- render statuses from `evidence` (`map.tsx:249, 256`, `panels.tsx:176, 231`, `TerrainView.tsx:824`);
- read versions from `index.json` (`terrain.spec.ts:362-363`, `hirise.test.ts:31, 40`);
- update `mission.spec.ts:35-36, 53` and `terrain.spec.ts:69, 290`.

## 5. Atomic integration and recovery (no destructive reset)

1. **Checkpoint tags** (immutable, created before anything moves):
   - `ckpt/h3-pre-s2` → `336dccc` (or H3's head at that time);
   - `ckpt/data-pre-s2` → `feat/data-core` head;
   - `ckpt/main-pre-s2` → `2d255d6`.
2. **Data commit** on `feat/data-core`: the §4 changes in one commit, then acceptance tests D1–D6.
   Tag `ckpt/data-s2`.
3. **Frontend commit** on a Cursor branch from `ckpt/h3-pre-s2`: tests F1–F8 pass against **both** the
   current and the candidate data. With both data versions present, nothing else changes.
4. **Release branch** `release/s2` created from `ckpt/h3-pre-s2`. Merge the data commit and the frontend
   commit with `--no-ff`. Run the full acceptance list. Tag `s2-rc1`.
5. **Your explicit approval**, then fast-forward H3 (and later `main`) to `s2-rc1`. Until then, H3 and
   `main` do not move.
6. **Recovery:**
   - before step 5: abandon `release/s2` (or recreate it from `ckpt/h3-pre-s2`); no shared branch moved;
   - after step 5: `git revert -m 1 <merge>` on H3 restores the previous behaviour as a new commit;
   - a data-only rollback is a one-commit revert of the `index.json` / `hirise/index.json` pointers,
     because the old immutable folders are still present.

   Never `git reset` a shared branch.

## 6. Acceptance tests

Data:
- **D1** core 33/33 (X1 parity against the regenerated golden).
- **D2** pipeline pytest incl. `test_poi_evidence.py` (with the t04 release gate) and `test_hirise_bundle.py`.
- **D3** byte diff: only `pois.json` per CTX bundle; HiRISE data files identical.
- **D4** `route_equivalence.mts` → 0 differences on both ROIs.
- **D5** `offline_loader_check.mjs` passes.
- **D6** fresh-checkout rebuild reproduces the candidate versions.

Frontend:
- **F1–F8** as listed in CR-004 §6 (labels equal `display_status`, legacy rendering, no confidence
  inference, invalid-evidence fallback, landing role text, global S-4/datum notes, no hard-coded
  versions, e2e green on both data versions).

Release:
- **R1** e2e 5× green on `release/s2`.
- **R2** old/new compatibility matrix rows re-run.
- **R3** demo numbers unchanged on screen.

## 7. Remaining release blockers

1. CR-004 frontend status display not implemented (H3 + candidate data drops the badges: measured).
2. H3 tests hard-code dataset versions (`terrain.spec.ts:362-363`, `hirise.test.ts:31, 40`).
3. Your explicit approval of the combined release.
4. Minor (not blocking): H3 e2e overwrites the committed `docs/handoff/h3-ui-labels.png` during test
   runs (observed in a scratch copy). Tests should write only to `test-results/`.

## 8. Recommendation

- **GO** to hand CR-004 to Cursor (`docs/handoff/CR-004-frontend.md`).
- **NO-GO** for the live migration until blockers 1–3 are closed.
