"""Regional DEM evaluation and display-only regional relief bundle (gates: analysis/regional_dem/GATES.md).

Candidates: JPL CTX DEM 20 m and USGS TRN CTX DTM 20 m over the regional science extent of the regional basemap
(analysis/regional/<version>/regional.json). Cross-checks: DEM vs DEM, HiRISE DTM 1 m (averaged to 20 m) vs each,
and each DEM's hillshade vs the regional CTX 6 m orthomosaic (NCC, registration_check.py). Nothing is filled,
smoothed or synthesised; no local DEM is stretched over the region; nothing is written under web/.

Usage (from pipeline/):
  uv run python regional_dem.py fetch     HTTP range reads -> pipeline/cache/regional_dem.npz (HiRISE ~390 MB, slow)
  uv run python regional_dem.py analyze   cache -> analysis/regional_dem/checks.json + evidence_dem_differences.png
  uv run python regional_dem.py build     re-reads the chosen DEM over HTTP -> analysis/regional_dem/<version>/
"""
import hashlib
import json
import math
import shutil
import sys
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from PIL import Image
from rasterio.crs import CRS
from rasterio.warp import Resampling, reproject
from rasterio.warp import transform as wtransform
from rasterio.windows import Window
from scipy import ndimage

import registration_check as reg
from m0a_bundle import block_mean
from m0a_validate import CTX, DEMS, ENV, header
from roi import ground_dx, horn_slope_deg, validity, window_from_proj_bounds
from t03_validate import hillshade

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "analysis" / "regional_dem"
CACHE = Path(__file__).parent / "cache" / "regional_dem.npz"
ORTHO6 = CTX + "JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif"
CANDIDATES = ("ctx_dem_20m", "trn_ctx_dtm_20m")
M = 4  # native margin cells read around the extent window (slope halo, 2x2 block halo, warp support)
K = 2  # native cells per bundle cell axis: 20 m -> 40 m posting (GATES.md)
REG_PX = 12.0  # registration grid: 2 x 2 block mean of the 6 m ortho
LIMITS = {"r1_valid_share": 0.98, "r2_mad_m": 5.0, "r3_shift_m": 40.0, "r3_sign_tol_px": 0.5, "median_flag_m": 10.0,
          "vertex_budget": 150_000}
TILES = (2, 4)  # rows x cols of tiles over the extent (it is about twice as wide as tall)
HTTP_ENV = dict(ENV, GDAL_HTTP_MAX_RETRY="5", GDAL_HTTP_RETRY_DELAY="2")


def regional_basemap():
    idx = json.loads((REPO / "analysis" / "regional" / "index.json").read_bytes())["regional"]
    meta = json.loads((REPO / idx["path"] / "regional.json").read_bytes())
    return idx["version"], meta


def nodata_to_nan(a, nodata):
    a = a.astype(np.float64)
    bad = ~np.isfinite(a) | (a < -1e30)
    if nodata is not None:
        bad |= a == np.float64(np.float32(nodata))
    a[bad] = np.nan
    return a


def extent_window(src, region):
    """Contract window rounding of the geographic region in this raster's own grid."""
    geo = CRS.from_proj4(f"+proj=longlat +R={src.crs.to_dict()['R']} +no_defs")
    xs, ys = wtransform(geo, src.crs, [region["lon_min"], region["lon_max"]], [region["lat_min"], region["lat_max"]])
    return window_from_proj_bounds(src.transform, min(xs), max(xs), min(ys), max(ys))


def fetch():
    _, rmeta = regional_basemap()
    region = rmeta["assets"]["science_6m.jpg"]["bounds_geo_requested"]
    c = {"region": json.dumps(region)}
    with rasterio.Env(**HTTP_ENV):
        for name in CANDIDATES:
            with rasterio.open("/vsicurl/" + DEMS[name]) as s:
                h = header(s)
                assert h["proj"] == "eqc" and h["area_or_point"] == "Area" and s.transform.b == s.transform.d == 0, h
                c0, c1, r0, r1, x0, y0 = extent_window(s, region)
                assert c0 - M >= 0 and r0 - M >= 0 and c1 + M <= s.width and r1 + M <= s.height, f"{name}: extent + margin outside raster"
                raw = s.read(1, window=Window(c0 - M, r0 - M, c1 - c0 + 2 * M, r1 - r0 + 2 * M))
                c[name] = raw
                c[name + "_meta"] = json.dumps({"header": h, "url": DEMS[name], "window": [c0, c1, r0, r1], "x0": x0, "y0": y0,
                                                "read_transform": list(s.window_transform(Window(c0 - M, r0 - M, 1, 1)))[:6],
                                                "crs": s.crs.to_proj4(), "nodata": s.nodata})
        t = json.loads(c["trn_ctx_dtm_20m_meta"])
        c0, c1, r0, r1 = t["window"]
        nx, ny, dx = c1 - c0, r1 - r0, t["header"]["transform"][0]
        hi_val, hi_cov = np.full((ny, nx), np.nan, np.float32), np.zeros((ny, nx), np.float32)
        with rasterio.open("/vsicurl/" + DEMS["hirise_dtm_1m"]) as s:
            c["hirise_meta"] = json.dumps({"header": header(s), "url": DEMS["hirise_dtm_1m"]})
            step = 50  # TRN rows per chunk (~55 MB of HiRISE per read)
            for r in range(0, ny, step):
                n = min(step, ny - r)
                dst_t = Affine(dx, 0, t["x0"], 0, -dx, t["y0"] - r * dx)
                w = s.window(t["x0"], t["y0"] - (r + n) * dx, t["x0"] + nx * dx, t["y0"] - r * dx)
                w = Window(math.floor(w.col_off) - 2, math.floor(w.row_off) - 2, math.ceil(w.width) + 4, math.ceil(w.height) + 4)
                a = s.read(1, window=w, boundless=True, fill_value=np.nan)
                a = nodata_to_nan(a, s.nodata).astype(np.float32)
                kw = dict(src_transform=s.window_transform(w), src_crs=s.crs, dst_transform=dst_t, dst_crs=s.crs, resampling=Resampling.average)
                val, cov = np.full((n, nx), np.nan, np.float32), np.zeros((n, nx), np.float32)
                reproject(a, val, src_nodata=np.nan, dst_nodata=np.nan, **kw)
                reproject(np.isfinite(a).astype(np.float32), cov, **kw)
                hi_val[r:r + n], hi_cov[r:r + n] = val, cov
                print(f"hirise rows {r + n}/{ny}", flush=True)
        c["hirise_20m"], c["hirise_cov"] = hi_val, hi_cov
        sw = rmeta["assets"]["science_6m.jpg"]
        with rasterio.open("/vsicurl/" + ORTHO6) as s:
            w = Window(sw["source_window"]["col0"], sw["source_window"]["row0"], sw["nx"], sw["ny"])
            wt = s.window_transform(w)
            assert abs(wt.c - sw["x0"]) < 1e-6 and abs(wt.f - sw["y0"]) < 1e-6, (wt, sw)
            c["ortho6"] = s.read(1, window=w)
            c["ortho_meta"] = json.dumps({"header": header(s), "url": ORTHO6})
    CACHE.parent.mkdir(exist_ok=True)
    np.savez_compressed(CACHE, **c)
    print("wrote", CACHE)


# ---------------------------------------------------------------- analysis
def load_cache():
    d = np.load(CACHE, allow_pickle=False)
    return {k: (json.loads(d[k].item()) if d[k].dtype.kind == "U" else d[k]) for k in d.files}


def dem_grid(c, name):
    """Native DEM over the extent window plus margin M, NaN for NoData, with its grid facts."""
    m = c[name + "_meta"]
    z = nodata_to_nan(c[name], m["nodata"])
    c0, c1, r0, r1 = m["window"]
    h = m["header"]
    region = c["region"]
    lat_c = (region["lat_min"] + region["lat_max"]) / 2
    dx, dy = h["transform"][0], -h["transform"][4]
    return {"z": z, "nx": c1 - c0, "ny": r1 - r0, "dx": dx, "dy": dy, "dx_g": ground_dx(dx, lat_c, h["lat_ts"] or 0.0),
            "crs": m["crs"], "read_t": Affine(*m["read_transform"]), "x0": m["x0"], "y0": m["y0"], "lat_c": lat_c, "meta": m}


def stats(d):
    d = d[np.isfinite(d)]
    med = float(np.median(d))
    mad = float(np.median(np.abs(d - med)))
    p = np.percentile(d, [5, 95])
    return {"n": int(d.size), "median_m": round(med, 3), "mad_m": round(mad, 3), "robust_sigma_m": round(1.4826 * mad, 3),
            "p05_m": round(float(p[0]), 3), "p95_m": round(float(p[1]), 3), "mean_m": round(float(d.mean()), 3), "std_m": round(float(d.std()), 3)}


def per_dem(g):
    """R1 coverage, NoData pattern, elevation range and Horn slope on the native grid over the extent window."""
    zz = g["z"][M - 1:M + g["ny"] + 1, M - 1:M + g["nx"] + 1]  # extent + 1-cell halo
    dem = zz[1:-1, 1:-1]
    bad = ~np.isfinite(dem)
    lab, n = ndimage.label(bad)
    sizes = np.bincount(lab.ravel())[1:] if n else np.array([], int)
    edge = bool(bad[0].any() or bad[-1].any() or bad[:, 0].any() or bad[:, -1].any())
    s = horn_slope_deg(zz, g["dx_g"], g["dy"])
    fs = s[np.isfinite(s)]
    fin = dem[np.isfinite(dem)]
    return {
        "window_cells": [g["nx"], g["ny"]], "x0": g["x0"], "y0": g["y0"],
        "spacing_m": {"dx_proj": g["dx"], "dy_proj": g["dy"], "dx_ground": g["dx_g"], "lat_center": g["lat_c"]},
        "valid_share": round(float(1 - bad.mean()), 6), "nodata_cells": int(bad.sum()),
        "nodata_pattern": {"components": int(n), "largest_component_cells": int(sizes.max()) if n else 0, "touches_window_edge": edge,
                           "rows_with_nodata": int(bad.any(axis=1).sum()), "cols_with_nodata": int(bad.any(axis=0).sum())},
        "elev_m": {"min": round(float(fin.min()), 3), "p01": round(float(np.percentile(fin, 1)), 3),
                   "p99": round(float(np.percentile(fin, 99)), 3), "max": round(float(fin.max()), 3)},
        "slope_deg_horn": {"p50": round(float(np.percentile(fs, 50)), 2), "p95": round(float(np.percentile(fs, 95)), 2),
                           "p99": round(float(np.percentile(fs, 99)), 2), "max": round(float(fs.max()), 2)},
    }


def warp(src, src_t, src_crs, dst_shape, dst_t, dst_crs, resampling):
    out = np.full(dst_shape, np.nan, np.float64)
    reproject(src, out, src_transform=src_t, src_crs=src_crs, dst_transform=dst_t, dst_crs=dst_crs, resampling=resampling,
              src_nodata=np.nan, dst_nodata=np.nan)
    return out


def warp_strict(g, dst_shape, dst_t, dst_crs, resampling=Resampling.bilinear):
    """Warp a DEM-derived array; any destination cell whose support touches NoData becomes NaN (never filled)."""
    v = warp(g["z"], g["read_t"], g["crs"], dst_shape, dst_t, dst_crs, resampling)
    ok = warp(np.isfinite(g["z"]).astype(np.float64), g["read_t"], g["crs"], dst_shape, dst_t, dst_crs, resampling)
    v[~(ok > 1 - 1e-9)] = np.nan
    return v


def shift_fit(d, ref, dxg, dyg):
    """Least squares d = a + b E + c N - sE dz/dE - sN dz/dN (ref = DEM d is measured against).

    Returns the plane tilt and s = position of a feature in the other DEM minus its position in ref (ground metres).
    One 3-sigma (robust) rejection pass. A first-order shift model, a diagnostic only.
    """
    dzdn, dzde = np.gradient(ref, -dyg, dxg)
    rows, cols = np.mgrid[:d.shape[0], :d.shape[1]]
    E, N = (cols - d.shape[1] / 2) * dxg / 1000, -(rows - d.shape[0] / 2) * dyg / 1000
    ok = np.isfinite(d) & np.isfinite(dzde) & np.isfinite(dzdn)
    A = np.stack([np.ones(ok.sum()), E[ok], N[ok], -dzde[ok], -dzdn[ok]], 1)
    y = d[ok]
    keep = np.ones(y.size, bool)
    for _ in range(2):
        coef = np.linalg.lstsq(A[keep], y[keep], rcond=None)[0]
        r = y - A @ coef
        mad = np.median(np.abs(r[keep] - np.median(r[keep])))
        keep = np.abs(r - np.median(r[keep])) <= 3 * 1.4826 * mad
    r0 = y[keep] - np.median(y[keep])
    return {"offset_m": round(float(coef[0]), 3), "tilt_east_m_per_km": round(float(coef[1]), 3), "tilt_north_m_per_km": round(float(coef[2]), 3),
            "shift_east_m": round(float(coef[3]), 1), "shift_north_m": round(float(coef[4]), 1),
            "robust_sigma_before_m": round(float(1.4826 * np.median(np.abs(r0))), 3),
            "robust_sigma_after_m": round(float(1.4826 * np.median(np.abs(r[keep] - np.median(r[keep])))), 3), "cells_used": int(keep.sum())}


def tiles(shape, r0=0, r1=None, c0=0, c1=None):
    r1, c1 = r1 or shape[0], c1 or shape[1]
    rs, cs = np.linspace(r0, r1, TILES[0] + 1).astype(int), np.linspace(c0, c1, TILES[1] + 1).astype(int)
    return {f"r{i}c{j}": (rs[i], rs[i + 1], cs[j], cs[j + 1]) for i in range(TILES[0]) for j in range(TILES[1])}


def compare(d, ref, dxg, dyg):
    out = stats(d)
    out["tile_medians_m"] = {k: (round(float(np.nanmedian(t)), 2) if np.isfinite(t).any() else None)
                             for k, t in ((k, d[a:b, e:f]) for k, (a, b, e, f) in tiles(d.shape).items())}
    out["shift_fit"] = shift_fit(d, ref, dxg, dyg)
    out["tile_shift_fit"] = {}
    for k, (a, b, e, f) in tiles(d.shape).items():
        s = shift_fit(d[a:b, e:f], ref[a:b, e:f], dxg, dyg)
        out["tile_shift_fit"][k] = {x: s[x] for x in ("shift_east_m", "shift_north_m", "robust_sigma_before_m", "robust_sigma_after_m")}
    return out


def registration(g, ortho12, reg_t, reg_crs, px_e, px_n):
    """R3: hillshade of the DEM (native grid, ground spacing) warped to the 12 m ortho grid, NCC vs the ortho."""
    shape = ortho12.shape
    ok = warp_strict({**g, "z": np.where(np.isfinite(g["z"]), 0.0, np.nan)}, shape, reg_t, reg_crs)
    valid = np.isfinite(ok)

    def hs12(az, alt):
        hs = hillshade(g["z"], g["dx_g"], g["dy"], az, alt)
        return warp(hs, g["read_t"], g["crs"], shape, reg_t, reg_crs, Resampling.bilinear)

    o_hp = reg.highpass(ortho12, 2.0)
    S = reg.MAXS
    R0, R1, C0, C1 = S, shape[0] - S, S, shape[1] - S
    if not valid[R0 - S:R1 + S, C0 - S:C1 + S].all():
        return {"status": "UNRESOLVED", "reason": "DEM NoData inside the registration area; NCC not computed on gaps"}
    table = {}
    for alt in (30, 45, 60):
        for az in range(0, 360, 15):
            table[(az, alt)] = reg.ncc(o_hp[R0:R1, C0:C1], reg.highpass(hs12(az, alt), 0)[R0:R1, C0:C1])
    az, alt = max(table, key=table.get)
    h_hp = reg.highpass(hs12(az, alt), 0)
    synth = []
    for ty, tx in ((2.0, 3.0), (-2.6, 1.4)):
        p = reg.peak(reg.surface(ndimage.shift(h_hp, (ty, tx), order=1, mode="nearest"), h_hp, R0, R1, C0, C1))
        synth.append({"imposed_px": [tx, -ty], "recovered_px": [round(p["sx"], 3), round(-p["sy"], 3)], "ncc": round(p["ncc"], 3)})
    sign_ok = all(abs(s["recovered_px"][0] - s["imposed_px"][0]) <= LIMITS["r3_sign_tol_px"]
                  and abs(s["recovered_px"][1] - s["imposed_px"][1]) <= LIMITS["r3_sign_tol_px"] for s in synth)
    res = {}
    for k, (a, b, e, f) in {**tiles(shape, R0, R1, C0, C1), "whole": (R0, R1, C0, C1)}.items():
        p = reg.peak(reg.surface(o_hp, h_hp, a, b, e, f))
        E, N = reg.to_m(p, px_e, px_n)
        res[k] = {"shift_east_m": round(E, 1), "shift_north_m": round(N, 1), "shift_m": round(math.hypot(E, N), 1),
                  "ncc": round(p["ncc"], 3), "sharpness": round(p["sharp"], 3), "peak_on_search_edge": bool(p["edge"]),
                  "adequate": bool(p["ncc"] >= reg.NCC_OK and not p["edge"])}
    w, lim = res["whole"], LIMITS["r3_shift_m"]
    big = [k for k, p in res.items() if k != "whole" and p["adequate"] and p["shift_m"] > lim]
    if not sign_ok:
        status = "UNRESOLVED"
    elif (w["adequate"] and w["shift_m"] > lim) or len(big) >= 2:
        status = "FAIL"
    elif w["adequate"] and not big:
        status = "PASS"
    else:
        status = "UNRESOLVED"
    return {"status": status, "sun": {"azimuth_deg": az, "altitude_deg": alt, "ncc_zero_shift": round(table[(az, alt)], 3)},
            "grid_px_m": {"east_ground": round(px_e, 4), "north": px_n}, "search_radius_px": S,
            "synthetic_sign_check": {"pass": sign_ok, "cases": synth}, "tiles": res, "tiles_over_limit": big,
            "convention": "position of a feature in the CTX 6 m ortho minus its position in the DEM hillshade (east +, north +)"}


def ramp(d, lim=10.0):
    t = np.clip(np.nan_to_num(d / lim), -1, 1)
    rgb = np.stack([1 - np.maximum(-t, 0), 1 - np.abs(t), 1 - np.maximum(t, 0)], -1)
    rgb[~np.isfinite(d)] = 0.5
    return (rgb * 255).astype(np.uint8)


def analyze():
    c = load_cache()
    rver, rmeta = regional_basemap()
    g = {n: dem_grid(c, n) for n in CANDIDATES}
    out = {"schema": "ares-regional-dem-checks/1", "gates_doc": "analysis/regional_dem/GATES.md", "limits": LIMITS,
           "region_geo": c["region"], "regional_basemap_version": rver, "dems": {}}
    for n in CANDIDATES:
        out["dems"][n] = {"url": c[n + "_meta"]["url"], "header": c[n + "_meta"]["header"], **per_dem(g[n])}

    # common grid = TRN native 20 m extent window (same CRS as the regional image)
    t = g["trn_ctx_dtm_20m"]
    shape, crs = (t["ny"], t["nx"]), t["crs"]
    grid_t = Affine(t["dx"], 0, t["x0"], 0, -t["dy"], t["y0"])
    trn = t["z"][M:M + t["ny"], M:M + t["nx"]]
    jpl = warp_strict(g["ctx_dem_20m"], shape, grid_t, crs)
    hi = np.where(c["hirise_cov"] >= 1 - 1e-6, c["hirise_20m"].astype(np.float64), np.nan)
    dxg, dyg = t["dx_g"], t["dy"]
    out["common_grid"] = {"crs": crs, "x0": t["x0"], "y0": t["y0"], "dx_proj": t["dx"], "nx": t["nx"], "ny": t["ny"],
                          "jpl_resampling": "GDAL bilinear, cells touching JPL NoData dropped",
                          "hirise_resampling": "GDAL average of 1 m pixels per 20 m cell; only cells with 100 % HiRISE coverage kept"}
    out["r2_trn_minus_jpl"] = compare(trn - jpl, jpl, dxg, dyg)
    out["hirise"] = {"url": c["hirise_meta"]["url"], "header": c["hirise_meta"]["header"],
                     "full_coverage_share": round(float(np.isfinite(hi).mean()), 6),
                     "partial_coverage_cells": int(((c["hirise_cov"] > 0) & (c["hirise_cov"] < 1 - 1e-6)).sum()),
                     "hirise_minus_trn": compare(hi - trn, trn, dxg, dyg), "hirise_minus_jpl": compare(hi - jpl, jpl, dxg, dyg),
                     "sign": "positive = HiRISE higher; shift_fit = position in HiRISE minus position in the CTX DEM"}
    Image.fromarray(np.concatenate([ramp(trn - jpl), np.full((6, t["nx"], 3), 255, np.uint8), ramp(hi - trn),
                                    np.full((6, t["nx"], 3), 255, np.uint8), ramp(hi - jpl)])).save(OUT / "evidence_dem_differences.png")

    # R3 registration grid: 2 x 2 block mean of the 6 m ortho science window
    sw = rmeta["assets"]["science_6m.jpg"]
    o = c["ortho6"].astype(np.float64)
    o[o == 0] = np.nan
    o = o[:o.shape[0] // 2 * 2, :o.shape[1] // 2 * 2]
    ortho12 = block_mean(o, 2)
    assert np.isfinite(ortho12).all(), "ortho NoData inside the registration area"
    reg_t = Affine(REG_PX, 0, sw["x0"], 0, -REG_PX, sw["y0"])
    lat_c = t["lat_c"]
    px_e = REG_PX * math.cos(math.radians(lat_c))  # lat_ts 0 grid: ground metres per projected metre east-west
    for n in CANDIDATES:
        out["dems"][n]["r3_registration"] = registration(g[n], ortho12, reg_t, rmeta["crs_proj4"], px_e, REG_PX)

    # gates
    r2 = out["r2_trn_minus_jpl"]
    vref = {
        "ctx_dem_20m": "UNVERIFIED: the PDS4 label (M20_JezeroCrater_CTXDEM_20m.xml) states no vertical datum.",
        "trn_ctx_dtm_20m": ("UNVERIFIED: file name says 'MOLAtopography_DeltaGeoid'; the FGDC metadata (.xml) says elevations "
                            "'refer to the Mars 2020 IAU Sphere with a radius of 3396190m' and that the mosaic was shifted 183.3 m "
                            "vertically to align with HRSC. The two statements are not reconciled here."),
    }
    for n in CANDIDATES:
        d = out["dems"][n]
        r3 = d["r3_registration"]["status"]
        gates = {"R1_coverage": {"value": d["valid_share"], "pass": d["valid_share"] >= LIMITS["r1_valid_share"]},
                 "R2_dem_dem_mad": {"value_m": r2["mad_m"], "pass": r2["mad_m"] <= LIMITS["r2_mad_m"],
                                    "median_flag": abs(r2["median_m"]) > LIMITS["median_flag_m"]},
                 "R3_registration": {"status": r3, "pass": r3 in ("PASS", "UNRESOLVED")},
                 "R4_vertical_reference": {"label": vref[n], "pass": True}}
        d["gates"] = gates
        d["suitable_display_only"] = all(v["pass"] for v in gates.values())
    ok = [n for n in CANDIDATES if out["dems"][n]["suitable_display_only"]]
    native = [n for n in ok if out["dems"][n]["header"]["lat_ts"] in (0, 0.0, None) and out["dems"][n]["header"]["lon_0"] in (0, 0.0)]
    pick = (native or sorted(ok, key=lambda n: -out["dems"][n]["valid_share"]) or [None])[0]
    out["decision"] = {"chosen": pick, "suitable": ok,
                       "rule": "all of R1-R4; prefer native image CRS (no cross-projection resampling), then higher R1 share"}
    (OUT / "checks.json").write_bytes(json.dumps(out, indent=1).encode())
    print(json.dumps({n: {"valid": out["dems"][n]["valid_share"], "r3": out["dems"][n]["r3_registration"]["status"],
                          "whole": out["dems"][n]["r3_registration"].get("tiles", {}).get("whole")} for n in CANDIDATES}, indent=1))
    print("R2", json.dumps(r2), "\ndecision", out["decision"])


# ---------------------------------------------------------------- bundle
def aggregate(raw, nodata, k=K):
    """k x k block mean of native cells; a block with any NoData cell is NoData (never filled)."""
    return block_mean(nodata_to_nan(raw, nodata), k)


def build():
    checks = json.loads((OUT / "checks.json").read_bytes())
    name = checks["decision"]["chosen"]
    if name is None:
        raise SystemExit("No DEM passed the gates (analysis/regional_dem/checks.json); no bundle is built.")
    rver, rmeta = regional_basemap()
    region = rmeta["assets"]["science_6m.jpg"]["bounds_geo_requested"]
    assert region == checks["region_geo"] and rver == checks["regional_basemap_version"], "checks.json is stale"
    img_crs = CRS.from_proj4(rmeta["crs_proj4"])
    with rasterio.Env(**HTTP_ENV), rasterio.open("/vsicurl/" + DEMS[name]) as s:
        # shortcut: only the native-CRS case is implemented; a DEM in another CRS needs the GATES.md warp-average path.
        key = lambda c: {k: c.to_dict().get(k) for k in ("proj", "R", "lat_ts", "lat_0", "lon_0", "x_0", "y_0")}  # noqa: E731
        assert key(s.crs) == key(img_crs), (f"{name} is not in the regional image CRS; warp path not implemented", key(s.crs))
        p = s.crs.to_dict()
        R, lat_ts, lon_0 = p["R"], p.get("lat_ts", 0.0), p.get("lon_0", 0.0)
        c0, c1, r0, r1, x0, y0 = extent_window(s, region)
        nx, ny = math.ceil((c1 - c0) / K), math.ceil((r1 - r0) / K)
        w = Window(c0 - K, r0 - K, (nx + 2) * K, (ny + 2) * K)  # one bundle cell of halo for slope
        assert w.col_off >= 0 and w.row_off >= 0 and w.col_off + w.width <= s.width and w.row_off + w.height <= s.height
        raw, nodata, src_px = s.read(1, window=w), s.nodata, s.transform.a
        src_nodata_px = int(np.isnan(nodata_to_nan(raw[K:-K, K:-K], nodata)).sum())
    z = aggregate(raw, nodata)
    dx = dy = float(K * src_px)
    lat_c = math.degrees((y0 - ny * dy / 2) / R)
    dx_g = ground_dx(dx, lat_c, lat_ts)
    slope = horn_slope_deg(z, dx_g, dy)
    dem = z[1:-1, 1:-1].astype("<f4")  # stored precision; h_min/h_max are taken from these values
    v = validity(dem, slope)
    assert nx * ny <= LIMITS["vertex_budget"], nx * ny

    tmp = OUT / "_staging"
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    dem.tofile(tmp / "dem.f32.bin")
    v.tofile(tmp / "validity.u8.bin")
    Image.fromarray((hillshade(z, dx_g, dy)[1:-1, 1:-1] * 255).astype(np.uint8)).save(tmp / "hillshade.png")
    d, j, hi = checks["dems"][name], checks["dems"]["ctx_dem_20m"], checks["hirise"]
    gates = {"R1_valid_share": d["gates"]["R1_coverage"]["value"], "R2_trn_minus_jpl_mad_m": d["gates"]["R2_dem_dem_mad"]["value_m"],
             "R3_registration": d["gates"]["R3_registration"]["status"], "R4_vertical_reference": d["gates"]["R4_vertical_reference"]["label"].split(":")[0]}
    vref = d["gates"]["R4_vertical_reference"]["label"]
    sources = [
        {"id": name, "role": "ELEVATION SOURCE for display-only regional relief (not routing, not hazards)", "url": DEMS[name],
         "agency": "USGS Astrogeology / NASA", "mission": "Mars Reconnaissance Orbiter (MRO); aligned to MEX HRSC per FGDC metadata",
         "instrument": "Context Camera (CTX), stereo-derived (SOCET SET + Ames Stereo Pipeline)",
         "product_version": "JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0 (FGDC publication date 2020-07-24)",
         "citation": "Fergason, R.L., Galuszka, D.M., Hare, T.M., Mayer, D.P., Redding, B.L., Smith, E.S., 2020, Context Camera Digital "
                     "Terrain Model Mosaic for Mars 2020 Terrain Relative Navigation, USGS Astrogeology, https://doi.org/10.5066/P906QQT8",
         "crs": rmeta["crs_proj4"], "native_pixel_m": src_px, "vertical_reference": vref,
         "license": "USGS/NASA data, no license stated in the metadata; credit the citation above", "confidence": "medium",
         "limitations": ["20 m posting, shown at 40 m (2 x 2 block mean); features smaller than ~100 m are not represented",
                         "Mosaic of three CTX stereo DTMs; FGDC metadata: 3.8 m vertical registration between them, 9.6 m mean image displacement",
                         "Display only: no slope, hazard or route information is derived for the user from this bundle"]},
        {"id": "ctx_dem_20m", "role": "cross-check only (R2), not in the bundle", "url": DEMS["ctx_dem_20m"],
         "agency": "NASA / USGS Astrogeology (PDS)", "mission": "Mars Reconnaissance Orbiter (MRO)", "instrument": "Context Camera (CTX), stereo-derived",
         "product_version": "urn:nasa:pds:mars2020_ctx_basemap_2021:data:m20_ctxdem_mosaic, version_id 1.0",
         "citation": "Mangold et al., 2021, Science, https://doi.org/10.1126/science.abl4051",
         "crs": j["header"]["crs_proj4"], "native_pixel_m": j["header"]["transform"][0],
         "vertical_reference": checks["dems"]["ctx_dem_20m"]["gates"]["R4_vertical_reference"]["label"],
         "license": "NASA/USGS PDS data, no license stated in label; credit the citation above", "confidence": "medium",
         "limitations": ["Different projection (lat_ts 18.4663); warped bilinearly only for the comparison"]},
        {"id": "hirise_dtm_1m", "role": "cross-check only (overlap statistics), not in the bundle", "url": DEMS["hirise_dtm_1m"],
         "agency": "USGS Astrogeology / NASA", "mission": "Mars Reconnaissance Orbiter (MRO)", "instrument": "HiRISE, stereo-derived",
         "product_version": "JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40",
         "citation": "Fergason et al. 2020, USGS Astrogeology, https://doi.org/10.5066/P9REJ9JN", "crs": hi["header"]["crs_proj4"],
         "native_pixel_m": 1.0, "vertical_reference": "UNVERIFIED (DeltaGeoid per file name)",
         "license": "USGS/NASA data; credit the citation above", "confidence": "medium",
         "limitations": [f"Covers {hi['full_coverage_share'] * 100:.1f} % of the extent at 20 m with complete 1 m support"]},
        {"id": "ctx_ortho_6m_controlled", "role": "texture partner (regional basemap " + rver + "), not in this bundle", "url": ORTHO6,
         "agency": "USGS Astrogeology / NASA", "mission": "Mars Reconnaissance Orbiter (MRO)", "instrument": "Context Camera (CTX)",
         "product_version": "JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0", "citation": "USGS Astrogeology Mars 2020 TRN products",
         "crs": rmeta["crs_proj4"], "native_pixel_m": 6.0, "vertical_reference": "n/a (image)",
         "license": "USGS/NASA data; credit the citation above", "confidence": "high",
         "limitations": ["Same soc_008 product family as the TRN DTM: R3 registration is internal consistency, not absolute position"]},
    ]
    (tmp / "sources.json").write_bytes(json.dumps(sources, indent=1).encode())
    files = sorted(p.name for p in tmp.iterdir())
    manifest = [{"file": f, "sha256": hashlib.sha256((tmp / f).read_bytes()).hexdigest()} for f in files]
    mb = json.dumps(manifest, indent=1).encode()
    (tmp / "manifest.json").write_bytes(mb)
    version = hashlib.sha256(mb).hexdigest()[:12]

    k = math.cos(math.radians(lat_ts))
    lon = lambda x: math.degrees(x / (R * k)) + lon_0  # noqa: E731
    lat = lambda y: math.degrees(y / R)  # noqa: E731
    tex = rmeta["assets"]["science_6m.jpg"]
    meta = {
        "contract_version": "1.0.0", "dataset_version": version, "roi_id": "regional", "role": "display_only_regional_relief",
        "analysis_role": "DISPLAY ONLY regional relief. Not for routing, slopes, hazards or traversability. Not in web/public/data.",
        "source_ids": [name], "nx": nx, "ny": ny, "dx_proj": dx, "dy_proj": dy, "dx_ground_m": dx_g, "dy_ground_m": dy,
        "x0": float(x0), "y0": float(y0), "radius_m": float(R), "lat_ts_deg": float(lat_ts), "central_meridian_deg": float(lon_0),
        "crs_proj4": rmeta["crs_proj4"],
        "bounds_geo": {"lat_min": lat(y0 - ny * dy), "lat_max": lat(y0), "lon_min": lon(x0), "lon_max": lon(x0 + nx * dx)},
        "roi_request_geo": region,
        "source_window": {"col0": c0, "row0": r0, "source_pixel_m": src_px, "cells_per_axis": K, "source_nodata_px": src_nodata_px},
        "elevation_unit": "m", "vertical_reference": vref,
        "nodata_policy": "NaN in dem = no source data (any NoData among the 2 x 2 native cells), never filled or interpolated",
        "h_min": float(np.nanmin(dem)), "h_max": float(np.nanmax(dem)), "slope_method": "horn3x3",
        "validity_counts": {str(i): int((v == i).sum()) for i in range(4)},
        "semantic_resolution": {"dem_posting_m": dx, "image_gsd_m": float(tex["dx"]),
                                "note": "40 m posting (2 x 2 mean of a 20 m CTX stereo DTM); effective relief resolution is ~100 m. "
                                        "The 6 m texture does not imply 6 m terrain."},
        "texture": {"regional_basemap_version": rver, "asset": "science_6m.jpg", "x0": tex["x0"], "y0": tex["y0"], "dx": tex["dx"],
                    "dy": tex["dy"], "nx": tex["nx"], "ny": tex["ny"], "same_crs": True},
        "gates": {**gates, "doc": "analysis/regional_dem/GATES.md", "numbers": "analysis/regional_dem/checks.json"},
    }
    (tmp / "terrain.json").write_bytes(json.dumps(meta, indent=1).encode())
    out = OUT / version
    shutil.rmtree(out, ignore_errors=True)
    tmp.rename(out)
    for m in json.loads((out / "manifest.json").read_bytes()):
        assert hashlib.sha256((out / m["file"]).read_bytes()).hexdigest() == m["sha256"], m["file"]
    index = {"regional_dem": {"dataset_version": version, "path": f"analysis/regional_dem/{version}/", "role": "display_only_regional_relief",
                              "source_id": name, "manifest_sha256": hashlib.sha256(mb).hexdigest(),
                              "terrain_json_sha256": hashlib.sha256((out / "terrain.json").read_bytes()).hexdigest(),
                              "texture": f"analysis/regional/{rver}/science_6m.jpg"}}
    (OUT / "index.json").write_bytes(json.dumps(index, indent=1).encode())
    print(f"regional_dem {version}: {nx} x {ny} = {nx * ny} vertices, dx_ground {dx_g:.3f} m, NaN cells {int(np.isnan(dem).sum())}, "
          f"source NoData px {src_nodata_px}, h {meta['h_min']:.1f}..{meta['h_max']:.1f} m")
    return version


if __name__ == "__main__":
    {"fetch": fetch, "analyze": analyze, "build": build}[sys.argv[1]]()
