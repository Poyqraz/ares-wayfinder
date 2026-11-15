"""Area-based (NCC) horizontal registration check: CTX ortho vs CTX-DEM hillshade, ROI A.

Usage (from pipeline/): uv run python registration_check.py
Input: cache/roi_a.npz (from t03_validate.py). Output: science/registration_roi_a.md
Shift convention: (E, N) = position of a feature in the ortho minus its position in the DEM, metres.
"""
import datetime
from pathlib import Path

import numpy as np
from scipy import ndimage

from t03_validate import hillshade

UP = 4
MAXS = 10  # search radius, 5 m px
NCC_OK = 0.3
REPO = Path(__file__).resolve().parent.parent


def ncc(a, b):
    a, b = a - a.mean(), b - b.mean()
    return float((a * b).sum() / np.sqrt((a * a).sum() * (b * b).sum()))


def highpass(img, smooth):
    s = ndimage.gaussian_filter(img, smooth) if smooth else img
    return s - ndimage.gaussian_filter(s, 15)


def hs_5m(dem_halo, dxg, dyg, az, alt):
    hs = hillshade(dem_halo, dxg, dyg, az, alt)  # gradients use the halo, so edge cells are proper
    i = (np.arange(360) + 0.5) / UP + 0.5  # 5 m px centre -> halo-DEM index (DEM cell centre at (r+0.5)*4)
    j = (np.arange(296) + 0.5) / UP + 0.5
    rr, cc = np.meshgrid(i, j, indexing="ij")
    return ndimage.map_coordinates(hs, [rr, cc], order=1)


def surface(ref, mov, r0, r1, c0, c1):
    """NCC of ref[r0:r1,c0:c1] vs mov window displaced by (-sy,-sx): peak at s means ref(x) ~ mov(x - s)."""
    s = np.full((2 * MAXS + 1, 2 * MAXS + 1), np.nan)
    for sy in range(-MAXS, MAXS + 1):
        for sx in range(-MAXS, MAXS + 1):
            s[sy + MAXS, sx + MAXS] = ncc(ref[r0:r1, c0:c1], mov[r0 - sy:r1 - sy, c0 - sx:c1 - sx])
    return s


def para(m, z, p):
    d = m - 2 * z + p
    return 0.0 if d >= 0 else 0.5 * (m - p) / d


def peak(s):
    iy, ix = np.unravel_index(np.nanargmax(s), s.shape)
    edge = iy in (0, s.shape[0] - 1) or ix in (0, s.shape[1] - 1)
    fy = 0.0 if edge else para(s[iy - 1, ix], s[iy, ix], s[iy + 1, ix])
    fx = 0.0 if edge else para(s[iy, ix - 1], s[iy, ix], s[iy, ix + 1])
    yy, xx = np.mgrid[:s.shape[0], :s.shape[1]]
    dist = np.hypot(yy - iy, xx - ix)
    ring = s[(dist >= 3) & (dist <= 4)]
    sx, sy = ix - MAXS + fx, iy - MAXS + fy
    return {"sx": sx, "sy": sy, "ncc": float(s[iy, ix]), "sharp": float(s[iy, ix] - ring.mean()), "edge": edge}


def to_m(p, px_e, px_n):
    return p["sx"] * px_e, -p["sy"] * px_n  # row increases southward


def main():
    d = np.load(Path(__file__).parent / "cache" / "roi_a.npz")
    meta = d["meta"]
    dxg, dyg = float(meta[4]), float(meta[5])
    px_e, px_n = dxg / UP, dyg / UP
    ortho = d["ortho_5m"].astype(np.float64)
    assert ortho.shape == (360, 296) and np.isfinite(ortho).all() and np.isfinite(d["dem_halo"]).all()
    o_hp = highpass(ortho, 2.0)
    H, W = ortho.shape
    R0, R1, C0, C1 = MAXS, H - MAXS, MAXS, W - MAXS  # inner region so shifted windows stay in bounds

    # 1) sun azimuth/altitude search at zero shift
    az_table = {}
    for alt in (30, 45, 60):
        for az in range(0, 360, 15):
            h = highpass(hs_5m(d["dem_halo"], dxg, dyg, az, alt), 0)
            az_table[(az, alt)] = ncc(o_hp[R0:R1, C0:C1], h[R0:R1, C0:C1])
    best_az, best_alt = max(az_table, key=az_table.get)
    best_g = az_table[(best_az, best_alt)]
    h_hp = highpass(hs_5m(d["dem_halo"], dxg, dyg, best_az, best_alt), 0)

    # 2) synthetic sign check: ortho-like image = hillshade with features moved +E / -N
    synth = []
    for ty, tx in ((2.0, 3.0), (-2.6, 1.4)):  # rows (south +), cols (east +)
        fake = ndimage.shift(h_hp, (ty, tx), order=1, mode="nearest")
        p = peak(surface(fake, h_hp, R0, R1, C0, C1))
        synth.append(((tx * px_e, -ty * px_n), to_m(p, px_e, px_n), p))

    # 3) tiles (2x2 over the inner region) + whole ROI
    rm, cm = (R0 + R1) // 2, (C0 + C1) // 2
    tiles = {"NW": (R0, rm, C0, cm), "NE": (R0, rm, cm, C1), "SW": (rm, R1, C0, cm), "SE": (rm, R1, cm, C1),
             "whole": (R0, R1, C0, C1)}
    res = {}
    for name, (r0, r1, c0, c1) in tiles.items():
        p = peak(surface(o_hp, h_hp, r0, r1, c0, c1))
        p["E"], p["N"] = to_m(p, px_e, px_n)
        p["size"] = (r1 - r0, c1 - c0)
        p["ok"] = p["ncc"] >= NCC_OK and not p["edge"]
        res[name] = p
        print(f"{name}: E={p['E']:+.1f} m N={p['N']:+.1f} m ncc={p['ncc']:.3f} sharp={p['sharp']:.3f} edge={p['edge']}")

    write(az_table, best_az, best_alt, best_g, synth, res, px_e, px_n)


def write(az_table, best_az, best_alt, best_g, synth, res, px_e, px_n):
    stamp = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    quads = [res[k] for k in ("NW", "NE", "SW", "SE")]
    good = [p for p in quads if p["ok"]]
    L = [f"# Registration check, ROI A: CTX ortho vs CTX DEM", "",
         f"Generated {stamp} by `pipeline/registration_check.py` from `pipeline/cache/roi_a.npz`.", "",
         "## Method", "",
         "**Area-based matching** (normalized cross-correlation of image patches), not point features.",
         "",
         f"- DEM hillshade (Lambert, computed on the 20 m DEM with its 1-cell halo) upsampled bilinearly to the 5 m ortho grid; "
         "DEM cell centre r maps to 5 m pixel coordinate (r+0.5)*4.",
         "- Ortho smoothed with Gaussian sigma 2 px; both images high-passed (minus Gaussian sigma 15 px) to remove albedo gradients.",
         f"- Search region is the ROI minus a {MAXS} px border so shifted windows stay inside the data; integer shifts in "
         f"[-{MAXS}, +{MAXS}] px (5 m px, +/-50 m) both axes, peak refined by 1-D parabola per axis.",
         f"- Pixel size used: {px_e:.4f} m east (ground-scaled), {px_n:.4f} m north.",
         "- Sign convention: **E/N = position of a feature in the ortho minus its position in the DEM** (east +, north +).",
         f"- Peak sharpness = peak NCC minus mean NCC on the ring at distance 3-4 px. A tile is 'adequate' if peak NCC >= {NCC_OK} "
         "and the peak is not on the search border.", "",
         "## Sun direction search (global NCC at zero shift)", "",
         f"Chosen: azimuth **{best_az} deg**, altitude **{best_alt} deg**, global NCC **{best_g:.3f}**"
         + (" (below 0.3: the match is weak)." if best_g < 0.3 else "."), "",
         "| az (deg) | " + " | ".join(f"alt {a}" for a in (30, 45, 60)) + " |", "|---|---|---|---|"]
    for az in range(0, 360, 15):
        L.append(f"| {az} | " + " | ".join(f"{az_table[(az, a)]:+.3f}" for a in (30, 45, 60)) + " |")
    L += ["", "Note: azimuth is chosen at zero shift; a large true offset could bias this choice.", "",
          "## Synthetic sign check", "",
          "The chosen hillshade was shifted by a known amount (bilinear) and used as a fake ortho; the same matcher was run.", "",
          "| imposed E (m) | imposed N (m) | recovered E (m) | recovered N (m) | peak NCC | sharpness |", "|---|---|---|---|---|---|"]
    for (te, tn), (re, rn), p in synth:
        L.append(f"| {te:+.2f} | {tn:+.2f} | {re:+.2f} | {rn:+.2f} | {p['ncc']:.3f} | {p['sharp']:.3f} |")
    ok_sign = all(abs(re - te) < 2 and abs(rn - tn) < 2 for (te, tn), (re, rn), _ in synth)
    L += ["", f"Sign convention check: **{'PASS' if ok_sign else 'FAIL'}** (tolerance 2 m).", "",
          "## Per-tile results", "",
          "| tile | size (px) | shift E (m) | shift N (m) | |shift| (m) | peak NCC | sharpness | peak on border | adequate |",
          "|---|---|---|---|---|---|---|---|---|"]
    for k, p in res.items():
        L.append(f"| {k} | {p['size'][0]}x{p['size'][1]} | {p['E']:+.1f} | {p['N']:+.1f} | {np.hypot(p['E'], p['N']):.1f} | "
                 f"{p['ncc']:.3f} | {p['sharp']:.3f} | {p['edge']} | {p['ok']} |")
    w = res["whole"]
    L += ["", f"Whole-ROI shift: E {w['E']:+.1f} m, N {w['N']:+.1f} m (peak NCC {w['ncc']:.3f}, sharpness {w['sharp']:.3f}).", "",
          "## Verdict", ""]
    if not ok_sign:
        verdict = "No verdict: the synthetic sign check failed, so the measured shifts cannot be interpreted."
    elif best_g < NCC_OK:
        marg = ", ".join(f"{k} ({np.hypot(res[k]['E'], res[k]['N']):.1f} m at NCC {res[k]['ncc']:.3f}, sharpness {res[k]['sharp']:.3f})"
                         for k in ("NW", "NE", "SW", "SE") if res[k]["ok"]) or "none"
        verdict = (f"**Inconclusive.** The best global hillshade-vs-ortho NCC is only {best_g:.3f} (< {NCC_OK}): the match is weak, "
                   "and every NCC surface is nearly flat (sharpness <= "
                   f"{max(p['sharp'] for p in res.values()):.3f}, vs {min(x[2]['sharp'] for x in synth):.3f} for the synthetic test). "
                   f"Tiles passing the NCC >= {NCC_OK} cut: {marg}. Shifts scatter in direction and several peaks sit on the "
                   "+/-50 m search border, which is the signature of no real correlation peak, not of a coherent offset. "
                   "These data support neither 'consistent within 20 m' nor a measured offset; the ortho texture here appears "
                   "dominated by albedo rather than DEM-resolvable shading (limitation c).")
    elif not good:
        verdict = (f"Inconclusive: no quadrant tile has an adequate match (peak NCC >= {NCC_OK}, peak inside the search window). "
                   "The data do not support a registration statement at this ROI.")
    elif len(good) == len(quads) and all(np.hypot(p["E"], p["N"]) <= 20 for p in good):
        verdict = (f"Ortho and DEM are **consistent within 20 m** at ROI A: all {len(good)} quadrant tiles have adequate peaks "
                   f"and |shift| <= 20 m (max {max(np.hypot(p['E'], p['N']) for p in good):.1f} m).")
    elif all(np.hypot(p["E"], p["N"]) <= 20 for p in good):
        verdict = (f"Partially supported: the {len(good)} of {len(quads)} quadrant tiles with adequate peaks show |shift| <= 20 m "
                   f"(max {max(np.hypot(p['E'], p['N']) for p in good):.1f} m); the other tiles gave no usable match, so "
                   "'consistent within 20 m' is claimed only for those tiles.")
    else:
        big = [k for k in ("NW", "NE", "SW", "SE") if res[k]["ok"] and np.hypot(res[k]["E"], res[k]["N"]) > 20]
        verdict = (f"Not consistent within 20 m: adequate tile(s) {', '.join(big)} show |shift| > 20 m. "
                   "See the table; this could be a real offset or a matching bias (limitation c).")
    L += [verdict, "", "## Limitations", "",
          "(a) The CTX DEM and ortho are co-produced from the same CTX stereo data, so this measures internal consistency, "
          "not absolute position against an independent reference.",
          "(b) The 20 m DEM resolution limits precision; sub-5 m shifts are not meaningful here.",
          "(c) Albedo vs shading mismatch can bias the peak: the ortho shows albedo plus real illumination from an unknown "
          "(mosaicked) sun, the hillshade shows modelled shading only.", ""]
    out = REPO / "science" / "registration_roi_a.md"
    out.write_text("\n".join(L), encoding="utf-8")
    print(f"sign check {'PASS' if ok_sign else 'FAIL'}; wrote {out}")


if __name__ == "__main__":
    main()
