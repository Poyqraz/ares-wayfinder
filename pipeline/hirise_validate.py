"""Independent validation of the T-HiRISE-1 bundle. Read-only on the bundle; writes one report.

Independent of hirise_bundle.py: own map-projection formulas (incl. the orthographic inverse),
pixel-centre binning instead of GDAL averaging, flip tests for orientation, and a fresh read of the
source GeoTIFF headers (needs network; use --offline to skip that part).

Usage: uv run python hirise_validate.py [--offline]
Output: science/hirise_bundle_validation_roi_a.md (and stdout)
"""
import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parent.parent
DATA = REPO / "web" / "public" / "data"
CACHE = Path(__file__).resolve().parent / "cache" / "hirise_roi_a_src.npz"


def sha(b):
    return hashlib.sha256(b).hexdigest()


def load():
    idx = json.loads((DATA / "hirise" / "index.json").read_bytes())["roi_a"]
    base = DATA / idx["path"].removeprefix("data/")
    mb = (base / "manifest.json").read_bytes()
    return idx, base, mb, json.loads(mb)


def integrity(idx, base, mb, man):
    out: dict = {"manifest_sha256_matches_index": sha(mb) == idx["manifest_sha256"],
           "version_is_manifest_prefix": sha(mb)[:12] == idx["dataset_version"] == base.name}
    for f in man["files"]:
        b = (base / f["file"]).read_bytes()
        out[f["file"]] = (sha(b) == f["sha256"]) and len(b) == f["bytes"]
    extra = sorted({p.name for p in base.iterdir()} - {f["file"] for f in man["files"]} - {"manifest.json"})
    out["no_unlisted_files"] = not extra
    return out


def geometry(man):
    ctx = json.loads((DATA / "roi_a" / man["aligned_to_ctx_bundle"]["dataset_version"] / "terrain.json").read_bytes())
    e = man["extent_proj_m"]
    res: dict = {"extent_equals_ctx_bundle": (e["x_min"], e["y_max"], e["x_max"], e["y_min"]) ==
           (ctx["x0"], ctx["y0"], ctx["x0"] + ctx["nx"] * ctx["dx_proj"], ctx["y0"] - ctx["ny"] * ctx["dy_proj"]),
           "crs_lat_ts_equals_ctx": f"+lat_ts={ctx['lat_ts_deg']}" in man["crs"] and f"+R={ctx['radius_m']}" in man["crs"]}
    for g, v in man["grids"].items():
        res[f"{g}_dims_times_step_equal_extent"] = math.isclose(v["nx"] * v["dx_proj"], e["x_max"] - e["x_min"]) and math.isclose(v["ny"] * v["dy_proj"], e["y_max"] - e["y_min"])
    R, k = ctx["radius_m"], math.cos(math.radians(ctx["lat_ts_deg"]))
    res["corners_geo_deg"] = {"NW": [round(math.degrees(e["y_max"] / R), 6), round(math.degrees(e["x_min"] / (R * k)), 6)],
                              "SE": [round(math.degrees(e["y_min"] / R), 6), round(math.degrees(e["x_max"] / (R * k)), 6)]}
    return res, ctx


def arrays(base, man):
    g2, g4 = man["grids"]["dtm_2m"], man["grids"]["dtm_4m"]
    d2 = np.frombuffer((base / g2["file"]).read_bytes(), "<f4").reshape(g2["ny"], g2["nx"]).astype(np.float64)
    d4 = np.frombuffer((base / g4["file"]).read_bytes(), "<f4").reshape(g4["ny"], g4["nx"]).astype(np.float64)
    t05 = np.asarray(Image.open(base / "ortho_0p5m.jpg").convert("L")).astype(np.float64)
    t1 = np.asarray(Image.open(base / "ortho_1m.jpg").convert("L")).astype(np.float64)
    return d2, d4, t05, t1


def bm(a, f):
    h, w = a.shape
    return a[:h // f * f, :w // f * f].reshape(h // f, f, w // f, f).mean(axis=(1, 3))


def ortho_inverse(x, y, lat0, lon0, R):
    """Spherical orthographic inverse (Snyder 1987, eq. 20-14..20-16), written independently of PROJ."""
    rho = np.hypot(x, y)
    c = np.arcsin(np.clip(rho / R, -1, 1))
    p0, l0 = math.radians(lat0), math.radians(lon0)
    with np.errstate(invalid="ignore", divide="ignore"):
        lat = np.arcsin(np.cos(c) * math.sin(p0) + np.where(rho > 0, y * np.sin(c) * math.cos(p0) / rho, 0))
    lon = l0 + np.arctan2(x * np.sin(c), rho * math.cos(p0) * np.cos(c) - y * math.sin(p0) * np.sin(c))
    return lat, lon


def bin_to_grid(lat, lon, val, ctx, step, shape):
    R, k = ctx["radius_m"], math.cos(math.radians(ctx["lat_ts_deg"]))
    X = R * k * lon
    Y = R * lat
    col = np.floor((X - ctx["x0"]) / step).astype(np.int64)
    row = np.floor((ctx["y0"] - Y) / step).astype(np.int64)
    ok = (col >= 0) & (col < shape[1]) & (row >= 0) & (row < shape[0]) & np.isfinite(val)
    i = row[ok] * shape[1] + col[ok]
    return np.bincount(i, val[ok], shape[0] * shape[1]), np.bincount(i, None, shape[0] * shape[1])


def source_checks(src, ctx, man, d2, t05):
    R = ctx["radius_m"]
    # DTM: eqc lat_ts=0 -> lon = x/R, lat = y/R (pixel centres)
    z = src["dtm"].astype(np.float64)
    z[z < -1e30] = np.nan
    a = src["dtm_transform"]
    cc, rr = np.meshgrid(np.arange(z.shape[1]) + 0.5, np.arange(z.shape[0]) + 0.5)
    s, n = bin_to_grid((a[5] + rr * a[4]) / R, (a[2] + cc * a[0]) / R, z.ravel().reshape(z.shape), ctx, 2.0, d2.shape)
    ind = np.where(n > 0, s / np.maximum(n, 1), np.nan).reshape(d2.shape)
    diff = (d2 - ind)[np.isfinite(d2 - ind)]
    dtm = {"cells_compared": int(diff.size), "src_px_per_cell_min_max": [int(n.min()), int(n.max())],
           "median_abs_m": round(float(np.median(np.abs(diff))), 4), "p99_abs_m": round(float(np.percentile(np.abs(diff), 99)), 4),
           "max_abs_m": round(float(np.abs(diff).max()), 4)}
    # POI sample elevations: bundle 2 m cell vs independent bin mean of the 1 m source pixels in that cell
    pois = json.loads((DATA / "roi_a" / man["aligned_to_ctx_bundle"]["dataset_version"] / "pois.json").read_bytes())
    k = math.cos(math.radians(ctx["lat_ts_deg"]))
    samples = {}
    for p in pois:
        X = R * k * math.radians(p["geo"]["lon"]); Y = R * math.radians(p["geo"]["lat"])
        c, r = int((X - ctx["x0"]) // 2.0), int((ctx["y0"] - Y) // 2.0)
        sc = int((X / k - a[2]) // a[0]); sr = int((Y - a[5]) // a[4])  # source pixel holding the POI (x_src = R*lon)
        samples[p["id"]] = {"cell_2m": [r, c], "bundle_h": round(float(d2[r, c]), 3), "independent_bin_h": round(float(ind[r, c]), 3),
                            "source_pixel_h": round(float(z[sr, sc]), 3)}
    # Ortho: orthographic -> lat/lon by an independent inverse, binned at 0.5 m, compared with the decoded JPEG
    o = src["ortho"]
    b = src["ortho_transform"]
    crs = str(src["ortho_crs"])
    lat0 = float(crs.split("+lat_0=")[1].split()[0]); lon0 = float(crs.split("+lon_0=")[1].split()[0])
    S = np.zeros(t05.size); N = np.zeros(t05.size)
    for r0 in range(0, o.shape[0], 800):
        blk = o[r0:r0 + 800].astype(np.float64)
        blk[blk == 0] = np.nan
        cc, rr = np.meshgrid(np.arange(o.shape[1]) + 0.5, np.arange(r0, r0 + blk.shape[0]) + 0.5)
        la, lo = ortho_inverse(b[2] + cc * b[0], b[5] + rr * b[4], lat0, lon0, R)
        s_, n_ = bin_to_grid(la, lo, blk, ctx, 0.5, t05.shape)
        S += s_; N += n_
    oind = np.where(N > 0, S / np.maximum(N, 1), np.nan).reshape(t05.shape)
    m = np.isfinite(oind)
    dd = t05[m] - oind[m]
    ortho = {"cells_compared": int(m.sum()), "src_px_per_cell_min_max": [int(N.min()), int(N.max())],
             "median_abs_dn": round(float(np.median(np.abs(dd))), 2), "p99_abs_dn": round(float(np.percentile(np.abs(dd), 99)), 2),
             "pearson_r": round(float(np.corrcoef(t05[m], oind[m])[0, 1]), 5)}
    return dtm, samples, ortho


def orientation(ctx, man, d2, t05):
    base = DATA / "roi_a" / man["aligned_to_ctx_bundle"]["dataset_version"]
    co = np.asarray(Image.open(base / "ortho.jpg").convert("L")).astype(np.float64)
    cd = np.fromfile(base / "dem.f32.bin", "<f4").reshape(ctx["ny"], ctx["nx"]).astype(np.float64)
    h5 = bm(t05, 10)
    h20 = bm(d2, 10)

    def r(a, b):
        a = a - a.mean(); b = b - b.mean(); return round(float((a * b).sum() / math.sqrt((a * a).sum() * (b * b).sum())), 3)

    def detrend(z):
        yy, xx = np.mgrid[:z.shape[0], :z.shape[1]]
        A = np.c_[np.ones(z.size), xx.ravel(), yy.ravel()]
        coef = np.linalg.lstsq(A, z.ravel(), rcond=None)[0]
        return z - (A @ coef).reshape(z.shape)
    cdd = detrend(cd)
    return {"ortho_corr_with_ctx_ortho": {"as_is": r(h5, co), "flip_north_south": r(h5[::-1], co), "flip_east_west": r(h5[:, ::-1], co)},
            "dtm_corr_with_ctx_dem_detrended": {"as_is": r(detrend(h20), cdd), "flip_north_south": r(detrend(h20[::-1]), cdd), "flip_east_west": r(detrend(h20[:, ::-1]), cdd)}}


def provenance_online(man):
    import rasterio
    out = {}
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
        for s in man["sources"]:
            with rasterio.open("/vsicurl/" + s["url"]) as d:
                out[s["role"]] = {"size_matches": [d.width, d.height] == s["source_size_px"],
                                  "transform_matches": [float(v) for v in tuple(d.transform)[:6]] == s["source_transform"],
                                  "crs_matches": d.crs.to_proj4() == s["source_crs"], "nodata_matches": float(d.nodata) == s["source_nodata"]}
    return out


def main(offline):
    idx, base, mb, man = load()
    res = {"bundle": idx["path"], "integrity": integrity(idx, base, mb, man)}
    res["geometry"], ctx = geometry(man)
    d2, d4, t05, t1 = arrays(base, man)
    res["derived_levels"] = {"dtm_4m_equals_2x2_mean_of_dtm_2m_max_abs_m": float(np.nanmax(np.abs(bm(d2, 2) - d4))),
                             "ortho_1m_vs_2x2_mean_of_decoded_0p5m_median_abs_dn": round(float(np.median(np.abs(bm(t05, 2) - t1))), 2)}
    res["validity"] = {"dtm_2m_nan": int(np.isnan(d2).sum()), "dtm_4m_nan": int(np.isnan(d4).sum()), "ortho_0p5m_zero_dn": int((t05 == 0).sum())}
    if CACHE.exists():
        src = dict(np.load(CACHE, allow_pickle=False))
        res["dtm_vs_source_independent_binning"], res["poi_sample_elevations"], res["ortho_vs_source_independent_orthographic_inverse"] = source_checks(src, ctx, man, d2, t05)
    else:
        res["source_checks"] = "SKIPPED: pipeline/cache/hirise_roi_a_src.npz missing (run hirise_bundle.py once)"
    res["orientation"] = orientation(ctx, man, d2, t05)
    res["source_headers_online"] = "SKIPPED (--offline)" if offline else provenance_online(man)
    res["package"] = {"bytes_total": sum(f["bytes"] for f in man["files"]) + len(mb),
                      "files": {f["file"]: f["bytes"] for f in man["files"]}}
    txt = json.dumps(res, indent=1)
    (REPO / "science" / "hirise_bundle_validation_roi_a.md").write_bytes(
        ("# T-HiRISE-1 bundle validation (generated by pipeline/hirise_validate.py)\n\n"
         "Independent checks: own projection formulas, pixel-centre binning, orthographic inverse, flip tests, fresh source headers.\n\n"
         "```json\n" + txt + "\n```\n").encode())
    print(txt)


if __name__ == "__main__":
    main("--offline" in sys.argv)
