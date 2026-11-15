"""T-HiRISE-1: display-only HiRISE terrain + ortho bundle for ROI-A (not a routing input).

Reads the official USGS Mars 2020 TRN HiRISE DTM (1 m, eqc lat_ts=0) and SOC_007 orthomosaic
(0.25 m, orthographic) over ROI-A, warps them by area averaging onto the CTX bundle's projected grid
(eqc lat_ts=18.4663, same x0/y0 as the CTX ROI-A bundle) and writes a separate hashed bundle.
No upsampling, no NoData filling, no height adjustment to CTX, no horizontal correction applied.

Usage: uv run python hirise_bundle.py            (network on first run; source windows cached)
Output: web/public/data/hirise/roi_a/<version>/ and web/public/data/hirise/index.json
"""
import datetime
import hashlib
import io
import json
import math
import shutil
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from PIL import Image
from rasterio.warp import Resampling, reproject, transform_bounds
from rasterio.windows import Window, from_bounds
from scipy.ndimage import uniform_filter

REPO = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / "cache" / "hirise_roi_a_src.npz"
CTX_DIR = REPO / "web" / "public" / json.loads((REPO / "web" / "public" / "data" / "index.json").read_bytes())["roi_a"]["path"]  # current CTX bundle (read-only)
OUT_ROOT = REPO / "web" / "public" / "data" / "hirise"
BASE = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/"
SRC = {
    "dtm": {
        "file": "JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif",
        "doi": "10.5066/P9REJ9JN",
        "title": "High-Resolution Imaging Science Experiment Digital Terrain Model Mosaic for Mars 2020 Terrain Relative Navigation",
    },
    "ortho": {
        "file": "JEZ_hirise_soc_007_orthoMosaic_25cm_Ortho_blend120.tif",
        "doi": "10.5066/P9QJDP48",
        "title": "High-Resolution Imaging Science Experiment Orthorectified image Mosaic for Mars 2020 Surface Operations",
    },
}
AUTHORS = "Fergason, R. L., Galuszka, D., Hare, T., Mayer, D., Redding, B., Smith, E."
ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
           GDAL_HTTP_MULTIRANGE="YES", CPL_VSIL_CURL_CHUNK_SIZE=4194304)
MARGIN_M = 40.0  # source read margin around ROI-A so every target cell is fully covered
DTM_STEP, TEX_STEP = 2.0, 0.5  # projected metres in the CTX projection


def sha(b):
    return hashlib.sha256(b).hexdigest()


def ctx_grid():
    t = json.loads((CTX_DIR / "terrain.json").read_bytes())
    crs = f"+proj=eqc +lat_ts={t['lat_ts_deg']} +lat_0=0 +lon_0={t['central_meridian_deg']} +x_0=0 +y_0=0 +R={t['radius_m']} +units=m +no_defs"
    return t, crs


def fetch(t, ctx_crs):
    """Read the source windows (actual pixels) once; cache them with their transforms and header facts."""
    if CACHE.exists():
        return dict(np.load(CACHE, allow_pickle=False))
    x0, y0 = t["x0"], t["y0"]
    x1, y1 = x0 + t["nx"] * t["dx_proj"], y0 - t["ny"] * t["dy_proj"]
    box = (x0 - MARGIN_M, y1 - MARGIN_M, x1 + MARGIN_M, y0 + MARGIN_M)
    out = {}
    with rasterio.Env(**ENV):
        for key in ("dtm", "ortho"):
            with rasterio.open("/vsicurl/" + BASE + SRC[key]["file"]) as s:
                b = transform_bounds(ctx_crs, s.crs, *box, densify_pts=64)
                w = from_bounds(*b, s.transform)
                c0, r0 = math.floor(w.col_off), math.floor(w.row_off)
                win = Window(c0, r0, math.ceil(w.col_off + w.width) - c0, math.ceil(w.row_off + w.height) - r0)
                assert win.col_off >= 0 and win.row_off >= 0 and win.col_off + win.width <= s.width and win.row_off + win.height <= s.height
                out[key] = s.read(1, window=win)
                out[key + "_transform"] = np.array(tuple(s.window_transform(win))[:6])
                out[key + "_window"] = np.array([win.col_off, win.row_off, win.width, win.height])
                out[key + "_crs"] = np.array(s.crs.to_proj4())
                out[key + "_nodata"] = np.array(s.nodata)
                out[key + "_size"] = np.array([s.width, s.height])
                out[key + "_src_transform"] = np.array(tuple(s.transform)[:6])
                out[key + "_dtype"] = np.array(s.dtypes[0])
                out[key + "_block"] = np.array(s.block_shapes[0])
    CACHE.parent.mkdir(exist_ok=True)
    np.savez(CACHE, **out)
    return out


def warp_avg(src, src_t, src_crs, src_nodata, dst_t, dst_crs, shape):
    """Area-average warp plus a coverage mask: a cell is valid only if no source NoData contributes."""
    valid = (src != src_nodata) & np.isfinite(src) if src.dtype.kind == "f" else src != src_nodata
    data = np.where(valid, src, 0).astype(np.float64)
    out = np.zeros(shape, np.float64)
    cov = np.zeros(shape, np.float64)
    kw = dict(src_transform=Affine(*src_t), src_crs=src_crs, dst_transform=dst_t, dst_crs=dst_crs, resampling=Resampling.average)
    reproject(np.where(valid, data, np.nan), out, src_nodata=np.nan, dst_nodata=np.nan, **kw)
    reproject(valid.astype(np.float64), cov, **kw)  # fraction of contributing source area that is valid
    good = np.isfinite(out) & (cov > 1 - 1e-9)
    return np.where(good, out, np.nan), cov


def block_mean(a, f):
    h, w = a.shape
    assert h % f == 0 and w % f == 0
    return a.reshape(h // f, f, w // f, f).mean(axis=(1, 3))


def hp(x, k):
    return x - uniform_filter(x, k)


def ncc(a, b):
    a = a - a.mean()
    b = b - b.mean()
    return float((a * b).sum() / math.sqrt((a * a).sum() * (b * b).sum()))


def registration(tex05, ctx_ortho):
    """HiRISE 0.5 m texture averaged to the CTX ortho grid (5 m) vs the CTX bundle ortho; offset only measured."""
    f = tex05.shape[0] // ctx_ortho.shape[0]
    assert tex05.shape == (ctx_ortho.shape[0] * f, ctx_ortho.shape[1] * f)
    hi = block_mean(tex05, f)
    A, B = hp(ctx_ortho.astype(np.float64), 15), hp(hi, 15)
    H, W = A.shape
    S, m = 6, 10
    g = np.zeros((2 * S + 1, 2 * S + 1))
    for sy in range(-S, S + 1):
        for sx in range(-S, S + 1):
            g[sy + S, sx + S] = ncc(B[m + sy:H - m + sy, m + sx:W - m + sx], A[m:H - m, m:W - m])
    iy, ix = np.unravel_index(np.argmax(g), g.shape)

    def sub(a, b, c):
        d = a - 2 * b + c
        return 0.0 if d == 0 else 0.5 * (a - c) / d

    fx = ix - S + (sub(g[iy, ix - 1], g[iy, ix], g[iy, ix + 1]) if 0 < ix < 2 * S else 0.0)
    fy = iy - S + (sub(g[iy - 1, ix], g[iy, ix], g[iy + 1, ix]) if 0 < iy < 2 * S else 0.0)
    px = TEX_STEP * f
    mask = np.ones_like(g, bool)
    mask[max(int(iy) - 1, 0):int(iy) + 2, max(int(ix) - 1, 0):int(ix) + 2] = False
    # +fx: HiRISE content sits fx px further EAST than CTX; +fy: further SOUTH
    return {
        "method": "high-pass (15 px box) NCC shift search, HiRISE 0.5 m texture block-averaged to the 5 m CTX bundle ortho grid, sub-pixel parabola",
        "reference": f"CTX bundle ortho.jpg ({CTX_DIR.name}), itself not quantitatively registered to the CTX DEM (G1/S-4 open)",
        "offset_hirise_minus_ctx_m": {"east": round(-fx * px, 2), "north": round(fy * px, 2)},
        "ncc_peak": round(float(g[iy, ix]), 3),
        "ncc_zero_shift": round(float(g[S, S]), 3),
        "ncc_runner_up_outside_1px": round(float(g[mask].max()), 3),
        "ncc_grid_median": round(float(np.median(g)), 3),
        "estimated_uncertainty_m": 2.5,
        "uncertainty_basis": "half a 5 m CTX ortho pixel for the sub-pixel peak; USGS: 94.1% of HiRISE-vs-CTX LVS features within 6 m",
        "applied_correction_m": {"east": 0.0, "north": 0.0},
        "why_not_applied": "offset is below one 20 m CTX analysis cell and within published uncertainty; the CTX reference is itself not validated (S-4), so HiRISE is not forced onto it",
    }


def line_artifacts(dtm_1m):
    """Coherent east-west row steps in the 1 m source (>= 100 m segments): disclosed, never edited."""
    z = dtm_1m.astype(np.float64)
    d1 = np.diff(z, axis=0)
    rows, steps = set(), []
    for c0 in range(0, z.shape[1] - 100 + 1, 100):
        seg = np.nanmedian(d1[:, c0:c0 + 100], axis=1)
        base = seg - np.convolve(seg, np.ones(15) / 15, mode="same")
        sig = 1.4826 * np.nanmedian(np.abs(base - np.nanmedian(base)))
        out = np.where(np.abs(base) > max(6 * sig, 0.05))[0]
        rows.update(int(r) for r in out)
        steps += np.abs(base[out]).tolist()
    lines = []
    for r in sorted(rows):
        if not lines or r - lines[-1] > 3:
            lines.append(r)
    return {"count": len(lines), "step_m_median": round(float(np.median(steps)), 3) if steps else 0.0,
            "step_m_max": round(float(np.max(steps)), 3) if steps else 0.0}


def jpeg(a, q=90):
    b = io.BytesIO()
    Image.fromarray(a).save(b, "JPEG", quality=q, optimize=True)
    return b.getvalue()


def main():
    t, ctx_crs = ctx_grid()
    src = fetch(t, ctx_crs)
    x0, y0, nx, ny, d = t["x0"], t["y0"], t["nx"], t["ny"], t["dx_proj"]
    W_m, H_m = nx * d, ny * d
    dshape = (round(H_m / DTM_STEP), round(W_m / DTM_STEP))
    tshape = (round(H_m / TEX_STEP), round(W_m / TEX_STEP))
    dt = Affine(DTM_STEP, 0, x0, 0, -DTM_STEP, y0)
    tt = Affine(TEX_STEP, 0, x0, 0, -TEX_STEP, y0)

    dtm_src = src["dtm"].astype(np.float64)
    nod = float(src["dtm_nodata"])
    dtm_src_valid = dtm_src > -1e30  # ISIS NULL is -3.4028226550889045e+38
    dtm2, _ = warp_avg(np.where(dtm_src_valid, dtm_src, nod), src["dtm_transform"], str(src["dtm_crs"]), nod, dt, ctx_crs, dshape)
    dtm4 = block_mean(dtm2, 2)  # NaN propagates: a 4 m cell is valid only if all four 2 m cells are
    tex, _ = warp_avg(src["ortho"], src["ortho_transform"], str(src["ortho_crs"]), 0, tt, ctx_crs, tshape)
    tex05 = np.where(np.isfinite(tex), np.clip(np.round(tex), 1, 255), 0).astype(np.uint8)  # 0 = NoData, as in the source
    tex1 = np.where(np.isfinite(block_mean(tex, 2)), np.clip(np.round(block_mean(np.nan_to_num(tex), 2)), 1, 255), 0).astype(np.uint8)

    ctx_dem = np.fromfile(CTX_DIR / "dem.f32.bin", dtype="<f4").reshape(ny, nx).astype(np.float64)
    hi20 = block_mean(dtm2, round(d / DTM_STEP))
    diff = (ctx_dem - hi20)[np.isfinite(ctx_dem - hi20)]
    ctx_ortho = np.asarray(Image.open(CTX_DIR / "ortho.jpg").convert("L"))
    assert (tex05 > 0).all(), "registration assumes a fully valid texture"
    reg = registration(tex05.astype(np.float64), ctx_ortho)
    # line artifacts counted on the 1 m source pixels inside ROI-A only (margin excluded)
    sb = transform_bounds(ctx_crs, str(src["dtm_crs"]), x0, y0 - H_m, x0 + W_m, y0, densify_pts=64)
    (ca, ra), (cb, rb) = ~Affine(*src["dtm_transform"]) * (sb[0], sb[3]), ~Affine(*src["dtm_transform"]) * (sb[2], sb[1])
    roi_src = np.where(dtm_src_valid, dtm_src, np.nan)[math.floor(ra):math.ceil(rb), math.floor(ca):math.ceil(cb)]
    lines = line_artifacts(roi_src) | {"evaluated_on_source_px": list(roi_src.shape)}

    files = {
        "dtm_2m.f32.bin": dtm2.astype("<f4").tobytes(),
        "dtm_4m.f32.bin": dtm4.astype("<f4").tobytes(),
        "ortho_0p5m.jpg": jpeg(tex05),
        "ortho_1m.jpg": jpeg(tex1),
    }
    k = math.cos(math.radians(t["lat_ts_deg"]))
    latc = math.radians((t["bounds_geo"]["lat_min"] + t["bounds_geo"]["lat_max"]) / 2)
    ground_x = math.cos(latc) / k  # ground metres per projected metre in x (eqc lat_ts=18.4663)

    def grid(shape, step, n_invalid):
        return {"nx": shape[1], "ny": shape[0], "dx_proj": step, "dy_proj": step,
                "dx_ground_m": round(step * ground_x, 6), "dy_ground_m": step, "x0": x0, "y0": y0,
                "n_invalid": int(n_invalid), "valid_fraction": round(1 - n_invalid / (shape[0] * shape[1]), 6)}

    manifest = {
        "schema": "ares-hirise-display-layer 0.1 (proposed in CR-003; not part of contract v1.0.0)",
        "layer_role": "DISPLAY ONLY. Not a routing input. Routes, lengths, profiles and model costs stay on the CTX 20 m grid.",
        "roi_id": "roi_a",
        "aligned_to_ctx_bundle": {"roi_id": "roi_a", "dataset_version": t["dataset_version"]},
        "crs": ctx_crs,
        "crs_note": "Same projection as the CTX bundle: equirectangular, lat_ts 18.4663, sphere R 3396190 m; planetocentric latitude, east-positive longitude; row 0 = north edge; x0/y0 = upper-left pixel corner.",
        "extent_proj_m": {"x_min": x0, "x_max": x0 + W_m, "y_min": y0 - H_m, "y_max": y0},
        "bounds_geo": t["bounds_geo"],
        "grids": {
            "dtm_2m": grid(dshape, DTM_STEP, np.isnan(dtm2).sum()) | {"file": "dtm_2m.f32.bin", "encoding": "float32 little-endian, row-major, north row first, NaN = invalid",
                                                                      "h_min": round(float(np.nanmin(dtm2)), 3), "h_max": round(float(np.nanmax(dtm2)), 3)},
            "dtm_4m": grid((dshape[0] // 2, dshape[1] // 2), 2 * DTM_STEP, np.isnan(dtm4).sum()) | {"file": "dtm_4m.f32.bin", "encoding": "float32 little-endian, row-major, north row first, NaN = invalid", "derived_from": "2x2 block mean of dtm_2m"},
            "ortho_0p5m": grid(tshape, TEX_STEP, (tex05 == 0).sum()) | {"file": "ortho_0p5m.jpg", "encoding": "8-bit grayscale JPEG q90, source DN averaged, no stretch. Invalid cells are counted in n_invalid (stored as DN 0 before JPEG); lossy JPEG can also decode very dark valid pixels to DN 0, so use n_invalid, not DN 0, as the NoData record"},
            "ortho_1m": grid((tshape[0] // 2, tshape[1] // 2), 2 * TEX_STEP, (tex1 == 0).sum()) | {"file": "ortho_1m.jpg", "encoding": "8-bit grayscale JPEG q90, 2x2 block mean of the 0.5 m texture before JPEG; same NoData rule as ortho_0p5m", "derived_from": "ortho_0p5m (pre-JPEG)"},
        },
        "elevation": {
            "unit": "m",
            "vertical_reference": "UNVERIFIED: source file names say MOLAtopography_DeltaGeoid; heights were tied to the USGS CTX LVS DTM via ground control; the metadata names no datum",
            "adjusted_to_ctx": False,
            "ctx_minus_hirise_at_20m_m": {"median": round(float(np.median(diff)), 3), "mean": round(float(diff.mean()), 3), "std": round(float(diff.std()), 3),
                                         "p01": round(float(np.percentile(diff, 1)), 3), "p99": round(float(np.percentile(diff, 99)), 3),
                                         "max_abs": round(float(np.abs(diff).max()), 3), "cells": int(diff.size),
                                         "method": "dtm_2m 10x10 block mean vs CTX bundle dem.f32.bin on the identical 20 m grid"},
            "line_artifacts_1m_source": lines | {
                "description": "coherent east-west row steps over >= 100 m segments in the 1 m source DTM; processing/mosaic artifacts, not geology; left unedited and disclosed"},
            "effective_resolution_note": "1 m post spacing; effective topographic resolution of stereo DTMs is coarser (often quoted ~3x post spacing). Not verified here.",
        },
        "registration": reg,
        "sources": [
            {"role": key, "product_file": SRC[key]["file"], "url": BASE + SRC[key]["file"], "doi": SRC[key]["doi"], "title": SRC[key]["title"],
             "publisher": "U.S. Geological Survey, Astrogeology Science Center", "authors": AUTHORS, "published": "2020-07-24",
             "mission": "Mars Reconnaissance Orbiter", "instrument": "HiRISE",
             "source_crs": str(src[key + "_crs"]), "source_transform": [float(v) for v in src[key + "_src_transform"]],
             "source_size_px": [int(v) for v in src[key + "_size"]], "source_dtype": str(src[key + "_dtype"]),
             "source_nodata": float(src[key + "_nodata"]), "source_block": [int(v) for v in src[key + "_block"]],
             "read_window_col_row_w_h": [int(v) for v in src[key + "_window"]],
             "read_window_nodata_pixels": int((~dtm_src_valid).sum()) if key == "dtm" else int((src["ortho"] == 0).sum()),
             "license": "USGS product, U.S. public domain (FGDC accconst/useconst: None); cite the DOI",
             } for key in ("dtm", "ortho")
        ],
        "citations": [
            f"{AUTHORS} (2020). {SRC['dtm']['title']}. USGS Astrogeology Science Center. https://doi.org/{SRC['dtm']['doi']}",
            f"{AUTHORS} (2020). {SRC['ortho']['title']}. USGS Astrogeology Science Center. https://doi.org/{SRC['ortho']['doi']}",
            "McEwen, A. S. et al. (2007). Mars Reconnaissance Orbiter's High Resolution Imaging Science Experiment (HiRISE). J. Geophys. Res. 112, E05S04. https://doi.org/10.1029/2005JE002605",
        ],
        "credit": "HiRISE images: NASA/JPL-Caltech/University of Arizona. DTM and orthomosaic: USGS Astrogeology. Historical orbital data (2006-2017 acquisitions), before the 2021 landing: no lander, rover or tracks are visible.",
        "processing": [
            "1. Read the actual source pixels over ROI-A plus a 40 m margin via HTTP range requests (windows recorded above).",
            "2. DTM: ISIS NULL (< -1e30) -> invalid. Warp from eqc lat_ts=0 to the CTX eqc lat_ts=18.4663 grid at 2 m with GDAL average resampling (area-weighted mean; ~4.2 source pixels per cell, no upsampling).",
            "3. Coverage mask warped the same way; a cell with any NoData contribution is set invalid (NaN). No filling or interpolation through NoData.",
            "4. dtm_4m = 2x2 block mean of dtm_2m (fallback).",
            "5. Ortho SOC_007: warp from orthographic (lat_0 18.4663, lon_0 77.4298) to the same grid at 0.5 m with GDAL average (4 source pixels per cell); DN rounded, no contrast stretch; 0 kept as NoData. ortho_1m = 2x2 block mean before JPEG.",
            "6. No vertical shift and no horizontal correction applied; offsets vs CTX measured and recorded only.",
        ],
        "limitations": [
            "Display only: not used for routing, route length, elevation profile or model cost.",
            "Vertical datum UNVERIFIED; heights differ from the CTX bundle (see ctx_minus_hirise_at_20m_m).",
            "No per-pixel DTM confidence layer is published; only aggregate accuracies in the USGS metadata.",
            f"{lines['count']} east-west line artifacts (see line_artifacts_1m_source) are visible in shaded relief and at vertical exaggeration.",
            "A route drawn on this surface is a visualization; it is not validated for human walking.",
            "G1/S-4, S2 (POI coordinates), S6 (cost curve) and the vertical datum remain open.",
        ],
        "generator": "pipeline/hirise_bundle.py",
        "files": [{"file": f, "bytes": len(b), "sha256": sha(b)} for f, b in sorted(files.items())],
    }
    mbytes = json.dumps(manifest, indent=1).encode()  # bytes: no CRLF
    version = sha(mbytes)[:12]

    out = OUT_ROOT / "roi_a" / version
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    for f, b in files.items():
        (out / f).write_bytes(b)
    (out / "manifest.json").write_bytes(mbytes)
    for m in json.loads((out / "manifest.json").read_bytes())["files"]:
        assert sha((out / m["file"]).read_bytes()) == m["sha256"], m["file"]
    assert sha((out / "manifest.json").read_bytes())[:12] == version
    index = {"roi_a": {"dataset_version": version, "path": f"data/hirise/roi_a/{version}/", "manifest_sha256": sha(mbytes),
                       "aligned_to_ctx_dataset_version": t["dataset_version"], "role": "display_only"}}
    (OUT_ROOT / "index.json").write_bytes(json.dumps(index, indent=1).encode())
    print(json.dumps({"version": version, "dtm_2m": dshape, "ortho_0p5m": tshape, "files": manifest["files"],
                      "ctx_minus_hirise": manifest["elevation"]["ctx_minus_hirise_at_20m_m"], "registration": reg,
                      "line_artifacts": manifest["elevation"]["line_artifacts_1m_source"],
                      "invalid": {g: v["n_invalid"] for g, v in manifest["grids"].items()},
                      "generated_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")}, indent=1))


if __name__ == "__main__":
    main()
