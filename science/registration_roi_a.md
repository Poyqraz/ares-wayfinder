# Registration check, ROI A: CTX ortho vs CTX DEM

Generated 2026-11-14T06:44:28+00:00 by `pipeline/registration_check.py` from `pipeline/cache/roi_a.npz`.

## Method

**Area-based matching** (normalized cross-correlation of image patches), not point features.

- DEM hillshade (Lambert, computed on the 20 m DEM with its 1-cell halo) upsampled bilinearly to the 5 m ortho grid; DEM cell centre r maps to 5 m pixel coordinate (r+0.5)*4.
- Ortho smoothed with Gaussian sigma 2 px; both images high-passed (minus Gaussian sigma 15 px) to remove albedo gradients.
- Search region is the ROI minus a 10 px border so shifted windows stay inside the data; integer shifts in [-10, +10] px (5 m px, +/-50 m) both axes, peak refined by 1-D parabola per axis.
- Pixel size used: 5.0009 m east (ground-scaled), 5.0000 m north.
- Sign convention: **E/N = position of a feature in the ortho minus its position in the DEM** (east +, north +).
- Peak sharpness = peak NCC minus mean NCC on the ring at distance 3-4 px. A tile is 'adequate' if peak NCC >= 0.3 and the peak is not on the search border.

## Sun direction search (global NCC at zero shift)

Chosen: azimuth **285 deg**, altitude **60 deg**, global NCC **0.084** (below 0.3: the match is weak).

| az (deg) | alt 30 | alt 45 | alt 60 |
|---|---|---|---|
| 0 | +0.033 | +0.034 | +0.037 |
| 15 | +0.014 | +0.016 | +0.019 |
| 30 | -0.005 | -0.003 | +0.000 |
| 45 | -0.024 | -0.022 | -0.019 |
| 60 | -0.042 | -0.040 | -0.037 |
| 75 | -0.058 | -0.056 | -0.053 |
| 90 | -0.070 | -0.068 | -0.065 |
| 105 | -0.076 | -0.075 | -0.072 |
| 120 | -0.076 | -0.075 | -0.072 |
| 135 | -0.070 | -0.069 | -0.066 |
| 150 | -0.059 | -0.058 | -0.055 |
| 165 | -0.045 | -0.043 | -0.041 |
| 180 | -0.028 | -0.027 | -0.024 |
| 195 | -0.010 | -0.008 | -0.005 |
| 210 | +0.010 | +0.011 | +0.014 |
| 225 | +0.029 | +0.031 | +0.034 |
| 240 | +0.047 | +0.049 | +0.052 |
| 255 | +0.063 | +0.064 | +0.067 |
| 270 | +0.074 | +0.076 | +0.078 |
| 285 | +0.080 | +0.082 | +0.084 |
| 300 | +0.080 | +0.082 | +0.084 |
| 315 | +0.074 | +0.076 | +0.078 |
| 330 | +0.064 | +0.065 | +0.067 |
| 345 | +0.049 | +0.051 | +0.053 |

Note: azimuth is chosen at zero shift; a large true offset could bias this choice.

## Synthetic sign check

The chosen hillshade was shifted by a known amount (bilinear) and used as a fake ortho; the same matcher was run.

| imposed E (m) | imposed N (m) | recovered E (m) | recovered N (m) | peak NCC | sharpness |
|---|---|---|---|---|---|
| +15.00 | -10.00 | +15.00 | -9.99 | 1.000 | 0.063 |
| +7.00 | +13.00 | +6.13 | +12.08 | 0.998 | 0.062 |

Sign convention check: **PASS** (tolerance 2 m).

## Per-tile results

| tile | size (px) | shift E (m) | shift N (m) | |shift| (m) | peak NCC | sharpness | peak on border | adequate |
|---|---|---|---|---|---|---|---|---|
| NW | 170x138 | +31.8 | -12.4 | 34.1 | 0.311 | 0.021 | False | True |
| NE | 170x138 | -20.0 | -50.0 | 53.9 | 0.113 | 0.020 | True | False |
| SW | 170x138 | +23.7 | +30.9 | 38.9 | 0.154 | 0.011 | False | False |
| SE | 170x138 | +50.0 | +30.0 | 58.3 | 0.187 | 0.031 | True | False |
| whole | 340x276 | +50.0 | +15.0 | 52.2 | 0.173 | 0.012 | True | False |

Whole-ROI shift: E +50.0 m, N +15.0 m (peak NCC 0.173, sharpness 0.012).

## Verdict

**Inconclusive.** The best global hillshade-vs-ortho NCC is only 0.084 (< 0.3): the match is weak, and every NCC surface is nearly flat (sharpness <= 0.031, vs 0.062 for the synthetic test). Tiles passing the NCC >= 0.3 cut: NW (34.1 m at NCC 0.311, sharpness 0.021). Shifts scatter in direction and several peaks sit on the +/-50 m search border, which is the signature of no real correlation peak, not of a coherent offset. These data support neither 'consistent within 20 m' nor a measured offset; the ortho texture here appears dominated by albedo rather than DEM-resolvable shading (limitation c).

## Limitations

(a) The CTX DEM and ortho are co-produced from the same CTX stereo data, so this measures internal consistency, not absolute position against an independent reference.
(b) The 20 m DEM resolution limits precision; sub-5 m shifts are not meaningful here.
(c) Albedo vs shading mismatch can bias the peak: the ortho shows albedo plus real illumination from an unknown (mosaicked) sun, the hillshade shows modelled shading only.
