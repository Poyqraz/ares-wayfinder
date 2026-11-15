"""M0-A gates G3 (cross-DEM, HiRISE stereo-pair seams) and G4 numbers (registration, PLACES residuals).

docs/decisions/M0A-terrain-gate.md. Window reads from the official rasters (HTTP range), same box and endpoints
as m0a_validate.py. Analysis grid for the checks: HiRISE DTM block-averaged to 2 m (proposed G5 grid).
No routing, no bundle, nothing under web/. G4 is evidence for human sign-off, not an automatic pass.
Usage (from pipeline/): uv run python m0a_g3g4.py  -> analysis/m0a/validation/g3_g4.json, g4_overlay.png
"""
import datetime
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from PIL import Image, ImageDraw
from rasterio.crs import CRS
from rasterio.warp import Resampling, reproject, transform_bounds
from rasterio.warp import transform as wtransform
from rasterio.windows import Window
from scipy import ndimage

import m0a_area as area
import registration_check as reg
from m0a_validate import DEMS, ENV, HI, ORTHO, corridor_mask, endpoints
from roi import ground_dx, window_from_proj_bounds
from t03_validate import hillshade

REPO = Path(__file__).resolve().parent.parent
OUT = area.ANALYSIS / "validation"
PAIRS = ["C", "W", "DL"]  # the pairs covering every M0/A point (ares1/docs/dem_coverage.json)
PAIR_URL = HI + "DTM_MOLAtopography_DeltaGeoid_Jezero_{}_Edited_affine_1m_Eqc_latTs0_lon0.tif"
G = 2  # analysis grid, metres (projected, lat_ts = 0)
SHIFTS_M = np.arange(-80, 81, 4)  # DEM-to-DEM search, ground metres (±40 m hit the edge on the first run)
SMOOTH_M = 10.0  # Gaussian sigma applied to HiRISE before comparing with a 20 m DEM
LIMITS = {"g3_mad_m": 5.0, "g3_pair_offset_m": 2.0, "g4_shift_cells": 2, "g4_places_spread_m": 3.0}


def read_float(src, win):
    a = src.read(1, window=win, boundless=True, fill_value=np.nan).astype(np.float64)
    bad = ~np.isfinite(a) | (a < -1e30)
    if src.nodata is not None:
        bad |= a == np.float64(np.float32(src.nodata))
    a[bad] = np.nan
    return a


def block_mean(a, k):
    h, w = (a.shape[0] // k) * k, (a.shape[1] // k) * k
    return a[:h, :w].reshape(h // k, k, w // k, k).mean(axis=(1, 3))


def robust(d):
    d = d[np.isfinite(d)]
    med = float(np.median(d))
    return {"median_m": round(med, 3), "mad_m": round(float(np.median(np.abs(d - med))), 3),
            "p05_m": round(float(np.percentile(d, 5)), 3), "p95_m": round(float(np.percentile(d, 95)), 3), "n": int(d.size)}


def best_shift(ref, sample, shifts):
    """Grid-search the horizontal shift (sx, sy) in metres minimising the robust spread of ref - sample(sx, sy).

    sample(sx, sy) must return the other surface evaluated at each ref cell displaced by (+sx east, +sy north).
    Returns the table and the best shift; the median offset is removed, so a vertical bias does not matter.
    """
    table = {}
    for sy in shifts:
        for sx in shifts:
            d = ref - sample(float(sx), float(sy))
            d = d[np.isfinite(d)]
            table[(float(sx), float(sy))] = float(1.4826 * np.median(np.abs(d - np.median(d))))
    best = min(table, key=table.get)
    return table, best


def main():
    version, ends = endpoints()
    box = area.box()
    out = {"generated_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
           "catalog_version": version, "limits": LIMITS, "analysis_grid_m": G}
    cat_idx = json.loads((REPO / "ares1" / "bundle" / "index.json").read_bytes())["catalog"]
    cat = json.loads((REPO / cat_idx["path"] / "catalog.json").read_bytes())
    places = {d["id"]: d["rover_position"] for d in cat["depot_drop_events"]}
    for o in cat["outcrops"]:
        if o["id"] in ("outcrop:skinner_ridge", "outcrop:wildcat_ridge"):
            places[o["id"]] = o["spatial"]["positions"][0]
    if area.WIDE:
        places["sample:M2020-00579-17"] = area.amalik(cat)

    with rasterio.Env(**ENV):
        # --- HiRISE mosaic window on its own grid, then 2 m analysis grid
        with rasterio.open("/vsicurl/" + DEMS["hirise_dtm_1m"]) as hi:
            R = hi.crs.to_dict().get("R")
            geo = CRS.from_proj4(f"+proj=longlat +R={R} +no_defs")
            hi_crs = hi.crs
            xs, ys = wtransform(geo, hi.crs, [box["lon_min"], box["lon_max"]], [box["lat_min"], box["lat_max"]])
            c0, c1, r0, r1, x0, y0 = window_from_proj_bounds(hi.transform, min(xs), max(xs), min(ys), max(ys))
            nx, ny = ((c1 - c0) // G) * G, ((r1 - r0) // G) * G
            hi1 = read_float(hi, Window(c0, r0, nx, ny))
        hi2 = block_mean(hi1, G)
        grid_t = Affine(G, 0, x0, 0, -G, y0)
        H, W = hi2.shape
        lat_c = (box["lat_min"] + box["lat_max"]) / 2
        gx = ground_dx(1.0, lat_c, 0.0)  # ground metres per projected metre in x on lat_ts = 0 grids
        cols, rows = np.meshgrid(np.arange(W) + 0.5, np.arange(H) + 0.5)
        X, Y = x0 + cols * G, y0 - rows * G  # projected (lat_ts 0) cell centres
        lon, lat = wtransform(hi_crs, geo, X.ravel().tolist(), Y.ravel().tolist())
        lon, lat = np.array(lon).reshape(H, W), np.array(lat).reshape(H, W)

        def cell_of(e):
            (x,), (y,) = wtransform(geo, hi_crs, [e["lon"]], [e["lat"]])
            return (y0 - y) / G, (x - x0) / G  # fractional row, col

        rc = {k: cell_of(e) for k, e in ends.items()}
        corr = np.zeros(hi2.shape, dtype=bool)  # the straight corridor of every route pair of this area
        for a, b, *_ in area.ROUTES:
            corr |= corridor_mask(hi2.shape, (int(rc[a][0]), int(rc[a][1])), (int(rc[b][0]), int(rc[b][1])), 20.0 / (G * gx), 20.0 / G)

        # --- G3a: each 20 m DEM vs HiRISE (smoothed), with a horizontal shift search
        hi_s = ndimage.gaussian_filter(hi2, SMOOTH_M / G)
        g3 = {}
        for name in ("ctx_dem_20m", "trn_ctx_dtm_20m"):
            with rasterio.open("/vsicurl/" + DEMS[name]) as src:
                p = src.crs.to_dict()
                lat_ts = p.get("lat_ts", 0.0)
                ex, ey = wtransform(geo, src.crs, [box["lon_min"] - 0.002, box["lon_max"] + 0.002], [box["lat_min"] - 0.002, box["lat_max"] + 0.002])
                d0, d1, e0, e1, dx0, dy0 = window_from_proj_bounds(src.transform, min(ex), max(ex), min(ey), max(ey))
                z = read_float(src, Window(d0, e0, d1 - d0, e1 - e0))
                px, py = src.transform.a, -src.transform.e
                gdx = ground_dx(px, lat_c, lat_ts) / px  # ground metres per projected metre in x
                qx0, qy0 = wtransform(geo, src.crs, lon.ravel().tolist(), lat.ravel().tolist())
                qx0, qy0 = np.array(qx0).reshape(H, W), np.array(qy0).reshape(H, W)

                def sample(sx, sy, z=z, dx0=dx0, dy0=dy0, px=px, py=py, gdx=gdx, qx0=qx0, qy0=qy0):
                    qx = qx0 + sx / gdx
                    qy = qy0 + sy
                    fc, fr = (qx - dx0) / px - 0.5, (dy0 - qy) / py - 0.5  # pixel-centre indices
                    return ndimage.map_coordinates(z, [fr, fc], order=1, cval=np.nan)

                zero = hi_s - sample(0.0, 0.0)
                table, best = best_shift(hi_s, sample, SHIFTS_M)
                at_best = hi_s - sample(*best)
                # slope agreement at 20 m: Horn-like gradient magnitude of both on the 2 m grid after smoothing
                gy1, gx1 = np.gradient(hi_s, G, G * gx)
                other = sample(0.0, 0.0)
                gy2, gx2 = np.gradient(other, G, G * gx)
                s1, s2 = np.degrees(np.arctan(np.hypot(gx1, gy1))), np.degrees(np.arctan(np.hypot(gx2, gy2)))
                ok = np.isfinite(s1) & np.isfinite(s2)
                g3[name] = {
                    "hirise_minus_dem_zero_shift": robust(zero), "corridor_zero_shift": robust(zero[corr]),
                    "best_shift_m": {"east": best[0], "north": best[1]}, "robust_sigma_zero_shift_m": round(table[(0.0, 0.0)], 3),
                    "robust_sigma_best_m": round(table[best], 3), "hirise_minus_dem_best_shift": robust(at_best),
                    "slope_correlation": round(float(np.corrcoef(s1[ok], s2[ok])[0, 1]), 4),
                    "shift_search_edge": bool(abs(best[0]) == SHIFTS_M.max() or abs(best[1]) == SHIFTS_M.max()),
                }

        # --- G3b: HiRISE stereo-pair agreement inside the corridor (bounds any seam step in the blended mosaic)
        pair_grids = {}
        for pair in PAIRS:
            with rasterio.open("/vsicurl/" + PAIR_URL.format(pair)) as src:
                w = src.window(*transform_bounds(hi_crs, src.crs, x0 - 10, y0 - ny - 10, x0 + nx + 10, y0 + 10, densify_pts=64))
                w = w.round_offsets().round_lengths()
                a = read_float(src, w)
                dst = np.full((H, W), np.nan)
                reproject(a, dst, src_transform=src.window_transform(w), src_crs=src.crs, dst_transform=grid_t, dst_crs=hi_crs,
                          resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan)
                pair_grids[pair] = dst
        pairs = {}
        for i, p1 in enumerate(PAIRS):
            for p2 in PAIRS[i + 1:]:
                d = pair_grids[p1] - pair_grids[p2]
                both = np.isfinite(d)
                pairs[f"{p1}-{p2}"] = {"overlap_cells": int(both.sum()), "corridor_overlap_cells": int((both & corr).sum()),
                                       "box": robust(d) if both.any() else None, "corridor": robust(d[corr]) if (both & corr).any() else None}
        mosaic_vs_pair = {p: robust((hi2 - g)[corr]) if np.isfinite((hi2 - g)[corr]).any() else None for p, g in pair_grids.items()}
        coverage = {p: round(float(np.isfinite(g[corr]).mean()), 4) for p, g in pair_grids.items()}
        # direct seam test: where the blended mosaic equals one pair exactly, no pair boundary (seam) lies there
        same = {p: np.abs(hi2 - g) < 1e-3 for p, g in pair_grids.items()}
        mosaic_is_pair = {p: {"corridor": round(float(s[corr].mean()), 4), "box": round(float(s.mean()), 4)} for p, s in same.items()}

        # --- G4a: PLACES / MMGIS elevation residuals at rover positions, every DEM, bilinear
        resid = {}
        for name, url in DEMS.items():
            with rasterio.open("/vsicurl/" + url) as src:
                vals = {}
                for pid, pos in places.items():
                    (x,), (y,) = wtransform(geo, src.crs, [pos["lon_deg_east"]], [pos["lat_deg"]])
                    fc, fr = ~src.transform * (x, y)
                    c, r = math.floor(fc - 0.5), math.floor(fr - 0.5)
                    blk = read_float(src, Window(c, r, 2, 2))
                    tx, ty = fc - 0.5 - c, fr - 0.5 - r
                    h = (blk[0, 0] * (1 - tx) * (1 - ty) + blk[0, 1] * tx * (1 - ty) + blk[1, 0] * (1 - tx) * ty + blk[1, 1] * tx * ty)
                    vals[pid] = round(float(h - pos["elev_m"]), 3)
                v = np.array(list(vals.values()))
                resid[name] = {"dem_minus_places_m": vals, "median_m": round(float(np.median(v)), 3), "std_m": round(float(v.std()), 3),
                               "spread_m": round(float(v.max() - v.min()), 3)}

        # --- G4b: HiRISE DTM hillshade vs HiRISE ortho on the 2 m grid (area-based NCC, existing method)
        with rasterio.open("/vsicurl/" + ORTHO[1]) as o:
            # the ortho is orthographic (lat_0 18.4663, lon_0 77.4298), not eqc: convert the bounds first
            w = o.window(*transform_bounds(hi_crs, o.crs, x0 - 20, y0 - ny - 20, x0 + nx + 20, y0 + 20, densify_pts=64))
            w = w.round_offsets().round_lengths()
            src = o.read(1, window=w).astype(np.float32)
            src[src == (o.nodata if o.nodata is not None else 0)] = np.nan
            ortho2 = np.full((H, W), np.nan, dtype=np.float32)
            reproject(src, ortho2, src_transform=o.window_transform(w), src_crs=o.crs, dst_transform=grid_t, dst_crs=hi_crs,
                      resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan)
    ortho2 = ortho2.astype(np.float64)
    assert np.isfinite(ortho2).all() and np.isfinite(hi2).all()
    o_hp = reg.highpass(ortho2, 1.0)
    M = reg.MAXS
    R0, R1, C0, C1 = M, H - M, M, W - M
    az_table = {}
    for alt in (30, 45, 60):
        for az in range(0, 360, 15):
            az_table[(az, alt)] = reg.ncc(o_hp[R0:R1, C0:C1], reg.highpass(hillshade(hi2, G * gx, G, az, alt), 0)[R0:R1, C0:C1])
    best_az, best_alt = max(az_table, key=az_table.get)
    h_hp = reg.highpass(hillshade(hi2, G * gx, G, best_az, best_alt), 0)
    # sign check on synthetic data before trusting the real peak
    synth = []
    for ty, tx in ((2.0, 3.0), (-2.6, 1.4)):
        fake = ndimage.shift(h_hp, (ty, tx), order=1, mode="nearest")
        p = reg.peak(reg.surface(fake, h_hp, R0, R1, C0, C1))
        synth.append({"true_px": [tx, -ty], "found_px": [round(p["sx"], 2), round(-p["sy"], 2)]})
    rm, cm = (R0 + R1) // 2, (C0 + C1) // 2
    tiles = {"NW": (R0, rm, C0, cm), "NE": (R0, rm, cm, C1), "SW": (rm, R1, C0, cm), "SE": (rm, R1, cm, C1), "whole": (R0, R1, C0, C1)}
    ncc_res = {}
    for name, (a0, a1, b0, b1) in tiles.items():
        p = reg.peak(reg.surface(o_hp, h_hp, a0, a1, b0, b1))
        ncc_res[name] = {"east_m": round(p["sx"] * G * gx, 2), "north_m": round(-p["sy"] * G, 2), "ncc": round(p["ncc"], 3),
                         "sharp": round(p["sharp"], 3), "edge": bool(p["edge"]), "ok": bool(p["ncc"] >= reg.NCC_OK and not p["edge"])}

    out["g3"] = {"dem_vs_hirise": g3, "hirise_pairs": pairs, "mosaic_minus_pair_corridor": mosaic_vs_pair, "pair_corridor_coverage": coverage,
                 "mosaic_equals_pair_fraction": mosaic_is_pair}
    out["g4"] = {"places_residuals": resid,
                 "hirise_dtm_vs_ortho": {"sun_az_deg": best_az, "sun_alt_deg": best_alt, "ncc_zero_shift": round(az_table[(best_az, best_alt)], 3),
                                         "synthetic_sign_check": synth, "tiles": ncc_res, "search_radius_m": M * G}}

    # --- gate evaluation
    ctx_g3 = [g3[n]["hirise_minus_dem_zero_shift"]["mad_m"] <= LIMITS["g3_mad_m"] for n in g3]
    pair_off = [abs(v["corridor"]["median_m"]) for v in pairs.values() if v["corridor"]]
    out["g3"]["max_pair_offset_corridor_m"] = round(max(pair_off), 3) if pair_off else None
    # Gate definition (M0A-terrain-gate.md): "no seam step > 2 m along the corridor". A corridor taken entirely
    # from one stereo pair has no seam; otherwise the inter-pair offset bounds the possible step.
    seam_free = any(v["corridor"] == 1.0 for v in mosaic_is_pair.values())
    out["g3"]["corridor_single_pair"] = seam_free
    out["g3"]["pair_offset_proxy_ok"] = bool(pair_off and max(pair_off) <= LIMITS["g3_pair_offset_m"])
    out["g3"]["gate"] = "PASS" if all(ctx_g3) and (seam_free or out["g3"]["pair_offset_proxy_ok"]) else "FAIL"
    oks = [t for t in ncc_res.values() if t["ok"]]
    max_shift_cells = max((math.hypot(t["east_m"], t["north_m"]) / G for t in oks), default=None)
    spread_hi = resid["hirise_dtm_1m"]["spread_m"]
    out["g4"]["provisional"] = ("MEETS_LIMITS" if oks and max_shift_cells <= LIMITS["g4_shift_cells"] and spread_hi <= LIMITS["g4_places_spread_m"]
                                else "UNRESOLVED")
    out["g4"]["max_reliable_tile_shift_cells"] = round(max_shift_cells, 2) if max_shift_cells is not None else None
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "g3_g4.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    overlay(OUT / "g4_overlay.png", ortho2, hillshade(hi2, G * gx, G, best_az, best_alt), [rc[k] for k in ends])
    print(json.dumps({"g3": out["g3"]["gate"], "g4": out["g4"]["provisional"], "pair_offset": out["g3"]["max_pair_offset_corridor_m"],
                      "tiles": ncc_res, "places": {k: (v["median_m"], v["spread_m"]) for k, v in resid.items()},
                      "dem": {k: (v["hirise_minus_dem_zero_shift"]["median_m"], v["hirise_minus_dem_zero_shift"]["mad_m"], v["best_shift_m"]) for k, v in g3.items()}}, indent=1))


def overlay(path, ortho, hs, pts):
    """Left: HiRISE ortho (2 m). Right: 50/50 blend with the HiRISE-DTM hillshade. Endpoints marked (rover positions)."""
    o = np.clip((ortho - np.percentile(ortho, 2)) / max(np.percentile(ortho, 98) - np.percentile(ortho, 2), 1e-9) * 255, 0, 255)
    b = 0.5 * o + 0.5 * hs * 255
    img = Image.fromarray(np.hstack([o, np.full((o.shape[0], 8), 255), b]).astype(np.uint8)).convert("RGB")
    d = ImageDraw.Draw(img)
    for off in (0, o.shape[1] + 8):
        for (r, c), label in zip(pts, ("M0 rover", "A rover", "B rover (Amalik)")):
            d.ellipse((c + off - 4, r - 4, c + off + 4, r + 4), outline=(255, 120, 0), width=2)
            d.text((c + off + 6, r - 6), label, fill=(255, 120, 0))
    d.text((6, 4), "HiRISE ortho 2 m | blend with HiRISE DTM hillshade - USGS/NASA/JPL/UA - north up", fill=(255, 255, 0))
    img.save(path)


if __name__ == "__main__":
    main()
