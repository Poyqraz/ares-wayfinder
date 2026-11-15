# G1 / S-4 — CTX DEM ↔ image registration investigation (2026-11-14)

**Summary statement (approved wording):** under the tested registration perturbations (one 20 m cell
north, south, east or west), the terrain-aware route's cost superiority on the demo is **relatively
stable**: it stays LOWER, with a model-cost advantage of 30.7–38.1 flat-equivalent m against 34.9, and
costs change by ±1 %. The **exact drawn path is not stable**: path-cell overlap with the baseline is
0.24–0.83. Claims must not tie the route to specific visible surface features.

Status: **S-4 remains UNRESOLVED. No registration correction applied or proposed.** Read-only analysis;
scripts in `pipeline/probes/s4/` and `pipeline/probes/hirise/s4_*.py`; the source cache
`pipeline/cache/s4_roib.npz` is git-ignored.

## 1. Source transforms (actual GeoTIFF headers, ROI-B read)

| Product | CRS | Transform (a, b, c, d, e, f) | Pixel | AREA_OR_POINT |
|---|---|---|---|---|
| JPL CTX DEM 20 m (our bundle) | eqc lat_ts 18.4663 | 20, 0, 4329000, 0, −20, 1143420 | 20 × 20 | Area |
| JPL CTX ortho 5 m (our bundle) | same | 5.002065, 0, 4329192.108, 0, −5.002263, 1143347.424 | **non-square, not aligned to the DEM** | Area |
| USGS TRN/LVS CTX DTM 20 m | eqc **lat_ts 0** | 20, 0, 4573663.251, 0, −20, 1109693.140 | 20 × 20 | Area |
| USGS HiRISE DTM 1 m | eqc **lat_ts 0** | 1, 0, 4577366, 0, −1, 1106618 | 1 × 1 | Area |

- No PixelIsPoint/Area mismatch exists, so there is no half-pixel artifact.
- The ortho's non-square pixels would accumulate up to ~46 m north–south over the full mosaic if treated
  as 5 m. Our bundle placed the ortho with the true transform (`t03_validate.py:117`, `reproject`), so
  that is **not** a source of error.

## 2. Measurements, separated by pair

| Pair | Method | Result (second − first) | Strength |
|---|---|---|---|
| HiRISE ortho − CTX ortho | image NCC, ROI-A | **+1.2 m E, −4.3 m N** | strong (NCC 0.72 vs runner-up 0.47) |
| HiRISE DTM − HiRISE ortho | hillshade NCC, ROI-A | ≤ ~2 m E–W | moderate; USGS orthorectified each image on its DTM |
| **TRN CTX DTM − JPL CTX DEM** | 336 mutual-nearest band-pass features, ROI-B | **−4.4 m E, −9.9 m N** (95 % CI −5.0…−3.7 / −10.2…−9.8; MAD 2.6 / 1.3 m) | **strong**: the two CTX DEMs are offset by about half a cell |
| HiRISE DTM − JPL CTX DEM | 138 features, R = 60 m | −6.7 m E (CI −11.3…−0.2), **+12.1 m N** (CI 4.5…18.5); MAD ~19 m | weak–moderate; consistent sign in both halves (north +18.2, south +8.2) |
| HiRISE DTM − TRN CTX DTM | 128 features | −5.9 m E, +13.4 m N (CI 6.9…20.0) | weak–moderate |
| HiRISE DTM − JPL CTX DEM | detrended and high-pass terrain correlation, ROI-A | +18 … +24 m N, −4 … +2 m E | weak (shallow peaks, plateau ~28 m) |
| Named feature: ROI-B scarp (18.4657 N, 77.4232 E), >15° slope centroid | independent location in each DEM | HiRISE − JPL: **−10.1 m E**, −46.0 m N; TRN − JPL: −0.6 E, −3.9 N | E–W usable; **N–S not usable**: the scarp is a long, curved north–south feature, and HiRISE resolves it further south (figure) |
| Control: HiRISE positions moved 40 m south | same feature matcher | measured shift −28.6 m instead of −40 m | **the matcher underestimates by ~30 %**, because of the matching radius and false matches |

## 3. Interpretation

- **Robust:** the JPL CTX DEM and the USGS TRN CTX DTM differ by about 10 m north–south and 4 m
  east–west. Two "official" CTX DEMs disagree by half a cell, which sets a floor for CTX DEM horizontal
  uncertainty.
- **Consistent across methods (moderate):** HiRISE terrain lies about **7–10 m west** of both CTX DEMs
  (features, scarp E–W edge, correlation).
- **Suggestive, not established:** HiRISE terrain lies about **12–25 m north** of both CTX DEMs. After
  correcting for the matcher's underestimation, that is ~15–25 m. The north–south value could not be
  confirmed with a sharp, independently identifiable feature: the only distinct feature is elongated
  north–south.
- Combined with HiRISE ortho ≈ CTX ortho (4.3 m), this suggests the CTX ortho and CTX DEM in our bundle
  may be offset by roughly **0.5–1.5 cells**, mainly north–south. This is the S-4 question, and it stays
  open.
- **Failed or limited methods:**
  - the original hillshade-vs-ortho NCC (inconclusive);
  - elevation-residual minimization (too flat);
  - named-feature N–S centroid (elongated feature).

  A crater with a sharp rim, visible in both the CTX ortho and the CTX DEM, would be the decisive
  control. None with sufficient size (≥ ~5 DEM cells) was identified automatically in ROI-A/ROI-B. A
  manual pick by the science lead is recommended.

## 4. Effect of a one-cell (20 m) displacement on slope and routing (ROI-A)

Method: the JPL DEM was re-sampled from the source one cell N/S/E/W of its current position. The ROI-A
window equals the bundle exactly before shifting. The unchanged `@ares/core` router was then re-run
(Minetti, g_max 0.45, no gate) on the demo route and 150 random pairs
(`pipeline/probes/s4/route_shift.mts`).

| Shift (true terrain lies…) | Demo terrain cost | Demo distance-route cost | Model-cost advantage | Relation | Demo path overlap (Jaccard) | Random pairs: \|Δcost\| median / p95 / max | Relation flips (of 150) |
|---|---|---|---|---|---|---|---|
| baseline | 1058.299 | 1093.229 | 34.93 | LOWER | 1 | — | — |
| 1 cell north | 1048.603 (−0.92 %) | 1082.243 | 33.64 | LOWER | 0.787 | 0.62 / 3.16 / 10.1 % | 5 |
| 1 cell south | 1068.319 (+0.95 %) | 1101.373 | 33.05 | LOWER | 0.826 | 0.60 / 3.86 / 9.6 % | 3 |
| 1 cell east | 1060.977 (+0.25 %) | 1099.081 | 38.10 | LOWER | 0.235 | 0.54 / 3.29 / 13.8 % | 2 |
| 1 cell west | 1054.997 (−0.31 %) | 1085.733 | 30.74 | LOWER | 0.474 | 0.54 / 3.73 / 11.2 % | 0 |

Per-cell slope change from a one-cell shift in ROI-A: median 0.3°, p95 1.0–1.2°, max 3.5°. Per-cell
height change: median 0.4 m, p95 1.3 m, max 2.9 m.

**Consequences:**
- The demo's **numbers** are robust to a one-cell registration error: horizontal length unchanged, costs
  within ±1 %, the advantage stays 31–38 flat-equivalent m, still LOWER.
- The **drawn path is not robust**: the cells used change substantially (overlap 0.24–0.83), because
  ROI-A is flat and many paths are nearly equivalent.
- So: do not claim the route follows specific visible features in the imagery, and keep quoting the
  34.9 m as model-specific.
- On steeper terrain (ROI-B scarp, up to 31°) the effect would be larger. It was not tested, because
  ROI-B is not the demo ROI.

## 5. Decision

- **No correction.** The only strong offset is between two CTX DEMs. The HiRISE-vs-CTX north–south value
  is method-dependent, and no sharp control feature confirms it.
- Keep S-4 **UNRESOLVED**. Add to the UI/claims: "CTX DEM and imagery may be offset by up to ~1–1.5 cells
  (S-4 unresolved); drawn path cells are not robust to this; route numbers change by about ±1 %."
- Next step (science lead): manually pick 3+ sharp features (crater rims, boulders larger than 40 m) in
  the CTX ortho, the CTX DEM hillshade and the HiRISE DTM. Then repeat the comparison with those points.
- S6 and the vertical datum stay open.

Figure: `science/s4_named_feature_slopes.png`. It shows slope at the ROI-B scarp in the JPL DEM, the
TRN DTM, HiRISE at 20 m and HiRISE at 2 m, with the >15° centroid marked.
