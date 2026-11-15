"""M0-A prototype ANALYSIS bundle: HiRISE DTM 1 m -> 2 m grid (G5 decision 2026-11-14), separate from ROI-A.

Grid: the USGS HiRISE DTM's own projection (eqc, lat_ts 0, lon_0 0, R 3 396 190 m), 2 m projected posting,
each cell = mean of the 2 x 2 source pixels it covers (any NoData pixel -> NoData; nothing filled).
Slope: Horn 3x3 on ground spacing (roi.ground_dx applied once), with a 1-cell halo read from the source.
Ortho texture: HiRISE 25 cm ortho (orthographic CRS) warped with GDAL average to a 1 m grid on the same
footprint, display only. Output goes to analysis/m0a/bundle/<version>/ and analysis/m0a/bundle/index.json,
never to web/public/data (the live ROI-A index is not touched).

Usage (from pipeline/): uv run python m0a_bundle.py [--offline]   (--offline rebuilds from pipeline/cache)
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
from rasterio.warp import Resampling, reproject, transform_bounds
from rasterio.warp import transform as wtransform
from rasterio.windows import Window

import m0a_area as area
from m0a_validate import DEMS, ENV, ORTHO, endpoints
from roi import NODATA_SOURCE, ground_dx, horn_slope_deg, validity, window_from_proj_bounds
from t03_validate import hillshade, stretch

REPO = Path(__file__).resolve().parent.parent
OUT = area.ANALYSIS / "bundle"
CACHE = Path(__file__).parent / "cache" / f"{area.AREA}_hirise.npz"
K = 2  # source pixels per analysis cell
CONTRACT_VERSION = "1.0.0"


def block_mean(a, k):
    h, w = a.shape
    assert h % k == 0 and w % k == 0, a.shape
    return a.reshape(h // k, k, w // k, k).mean(axis=(1, 3))  # NaN in a block -> NaN cell


def gates():
    """Gate status written into terrain.json. The frozen M0-A text is kept; the wider grid reports what its own runs produced."""
    if not area.WIDE:
        return {"G1_G2": "PASS (df13f41)", "G3": "PASS (df13f41)", "G4": "conditionally approved for prototype analysis 2026-11-14",
                "G5": "HiRISE-derived 2 m analysis grid selected 2026-11-14"}
    val = area.ANALYSIS / "validation"
    g12, g34 = json.loads((val / "g1_g2.json").read_bytes()), json.loads((val / "g3_g4.json").read_bytes())
    out = {"G1_G2": f"{g12['g1_g2']} (automated, {g12['generated_utc'][:10]})", "G3": f"{g34['g3']['gate']} (automated, {g34['generated_utc'][:10]})",
           "G4": f"automated numbers {g34['g4']['provisional']}; owner sign-off PENDING for the wider box",
           "G5": "same grid definition as M0-A (HiRISE-derived 2 m); owner confirmation PENDING for the wider box"}
    signed = val / "signoff.json"  # the two human gates: written only from an explicit decision by the owner
    if signed.exists():
        so = json.loads(signed.read_bytes())
        out["G4"] = f"automated numbers {g34['g4']['provisional']}; {so['G4']}, {so['by']}, {so['date']}"
        out["G5"] = f"{so['G5']}, {so['by']}, {so['date']}"
    return out


def same_cells_as_frozen(src, dem, slope, v):
    """The wider grid must contain the frozen M0-A grid cell for cell. Compared here, bit for bit, and recorded."""
    folder, f = area.frozen_m0a()
    c = (f["source_window"]["col0"] - src["col0"]) // K
    r = (f["source_window"]["row0"] - src["row0"]) // K
    fnx, fny = f["nx"], f["ny"]
    old_dem = np.fromfile(folder / "dem.f32.bin", dtype="<f4").reshape(fny, fnx)
    old_slope = np.fromfile(folder / "slope_deg.f32.bin", dtype="<f4").reshape(fny, fnx)
    old_v = np.fromfile(folder / "validity.u8.bin", dtype=np.uint8).reshape(fny, fnx)
    sub = (slice(r, r + fny), slice(c, c + fnx))
    same = {"dem": bool(np.array_equal(dem[sub].astype("<f4"), old_dem, equal_nan=True)),
            "slope": bool(np.array_equal(slope[sub].astype("<f4"), old_slope, equal_nan=True)), "validity": bool(np.array_equal(v[sub], old_v))}
    assert all(same.values()), same
    return {"dataset_version": f["dataset_version"], "row_offset": int(r), "col_offset": int(c), "cells": int(fnx * fny), "identical": same}


def fetch(box):
    """Read the 1 m DTM window (with a K-pixel halo) and the ortho, return arrays + grid facts."""
    with rasterio.Env(**ENV):
        with rasterio.open("/vsicurl/" + DEMS["hirise_dtm_1m"]) as hi:
            p = hi.crs.to_dict()
            assert p.get("proj") == "eqc" and hi.tags().get("AREA_OR_POINT") == "Area", (p, hi.tags())
            R, lat_ts, lon_0 = p["R"], p.get("lat_ts", 0.0), p.get("lon_0", 0.0)
            geo = CRS.from_proj4(f"+proj=longlat +R={R} +no_defs")
            xs, ys = wtransform(geo, hi.crs, [box["lon_min"], box["lon_max"]], [box["lat_min"], box["lat_max"]])
            c0, c1, r0, r1, x0, y0 = window_from_proj_bounds(hi.transform, min(xs), max(xs), min(ys), max(ys))
            if area.WIDE:  # same north and east edges and the same 2 m lattice as the frozen grid: its cells stay its cells
                f = area.frozen_m0a()[1]
                fc0, fr0 = f["source_window"]["col0"], f["source_window"]["row0"]
                assert r0 == fr0 and c0 <= fc0 and c1 <= fc0 + f["nx"] * K, (c0, c1, r0, fc0, fr0)
                c0 -= (fc0 - c0) % K
                c1 = fc0 + f["nx"] * K
                x0 = hi.transform.c + c0 * hi.transform.a
            nx, ny = math.ceil((c1 - c0) / K), math.ceil((r1 - r0) / K)
            raw = hi.read(1, window=Window(c0 - K, r0 - K, (nx + 2) * K, (ny + 2) * K), boundless=True, fill_value=np.nan)
            nodata = hi.nodata
            dtm_crs = hi.crs.to_proj4()
            res = hi.transform.a
        with rasterio.open("/vsicurl/" + ORTHO[1]) as o:
            w = o.window(*transform_bounds(dtm_crs, o.crs, x0 - 5, y0 - ny * K * res - 5, x0 + nx * K * res + 5, y0 + 5, densify_pts=64))
            w = w.round_offsets().round_lengths()
            osrc = o.read(1, window=w)
            o_t, o_crs, o_nodata = list(o.window_transform(w))[:6], o.crs.to_proj4(), o.nodata
    return dict(raw=raw.astype(np.float32), nodata=np.float32(nodata), x0=x0, y0=y0, nx=nx, ny=ny, res=res, R=R, lat_ts=lat_ts,
                lon_0=lon_0, dtm_crs=dtm_crs, col0=c0, row0=r0, ortho=osrc, ortho_t=o_t, ortho_crs=o_crs, ortho_nodata=o_nodata)


def build(src, box, ends, catalog_version):
    raw = src["raw"].astype(np.float64)
    raw[~np.isfinite(raw) | (raw < -1e30) | (raw == np.float64(src["nodata"]))] = np.nan
    z = block_mean(raw, K)  # (ny + 2, nx + 2): one-cell halo
    nx, ny, x0, y0, R = src["nx"], src["ny"], src["x0"], src["y0"], src["R"]
    dx = dy = float(K * src["res"])
    lat_c = math.degrees((y0 - ny * dy / 2) / R)
    dx_g = ground_dx(dx, lat_c, src["lat_ts"])
    if area.WIDE:  # one metric for both grids: the frozen grid's ground spacing (cos latitude differs by 4e-6 across this box)
        dx_g = area.frozen_m0a()[1]["dx_ground_m"]
    slope = horn_slope_deg(z, dx_g, dy)
    dem = z[1:-1, 1:-1]
    v = validity(dem, slope)
    superset = same_cells_as_frozen(src, dem, slope, v) if area.WIDE else None

    ortho = np.full((ny * K, nx * K), np.nan, dtype=np.float32)
    o = src["ortho"].astype(np.float32)
    o[o == (src["ortho_nodata"] if src["ortho_nodata"] is not None else 0)] = np.nan
    reproject(o, ortho, src_transform=Affine(*src["ortho_t"]), src_crs=src["ortho_crs"],
              dst_transform=Affine(src["res"], 0, x0, 0, -src["res"], y0), dst_crs=src["dtm_crs"],
              resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan)

    tmp = OUT / "_staging"
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    dem.astype("<f4").tofile(tmp / "dem.f32.bin")
    slope.astype("<f4").tofile(tmp / "slope_deg.f32.bin")
    v.tofile(tmp / "validity.u8.bin")
    Image.fromarray(np.nan_to_num(stretch(ortho)).astype(np.uint8)).save(tmp / "ortho_1m.jpg", quality=90)
    Image.fromarray((hillshade(dem, dx_g, dy) * 255).astype(np.uint8)).save(tmp / "hillshade.png")

    def to_cell(lat, lon):
        E = R * math.radians(lon - src["lon_0"]) * math.cos(math.radians(src["lat_ts"]))
        N = R * math.radians(lat)
        col, row = math.floor((E - x0) / dx), math.floor((y0 - N) / dy)
        cE, cN = x0 + (col + 0.5) * dx, y0 - (row + 0.5) * dy
        return {"E": E, "N": N, "row": row, "col": col, "cell_center_E": cE, "cell_center_N": cN,
                "snap_distance_ground_m": round(math.hypot((cE - E) * dx_g / dx, cN - N), 4),
                "validity": int(v[row, col]) if 0 <= row < ny and 0 <= col < nx else None}

    eps = {k: {**e, "position_kind": "rover position (not a tube, core or rock point)", "snap_rule": "cell containing the point (PixelIsArea, floor)",
               **to_cell(e["lat"], e["lon"])} for k, e in ends.items()}
    (tmp / "endpoints.json").write_bytes(json.dumps({"catalog_version": catalog_version, "endpoints": eps}, indent=1).encode())
    sources = [
        {"id": "hirise_dtm_1m", "role": "ANALYSIS input for the M0-A prototype only (G5); in legacy ROI-A HiRISE stays display-only",
         "url": DEMS["hirise_dtm_1m"], "product": "USGS Mars 2020 TRN HiRISE DTM mosaic JEZ_hirise_soc_006 (MOLA topography, DeltaGeoid, blend40)",
         "agency": "USGS Astrogeology / NASA", "mission": "MRO", "instrument": "HiRISE", "crs": src["dtm_crs"], "native_pixel_m": src["res"],
         "processing": "2 x 2 block mean to 2 m; Horn slope on ground spacing; no fill, no smoothing", "vertical_reference": "UNVERIFIED (DeltaGeoid per file name)"},
        {"id": "hirise_ortho_25cm", "role": "display texture only", "url": ORTHO[1],
         "product": "USGS Mars 2020 TRN HiRISE orthomosaic JEZ_hirise_soc_007 (25 cm, blend120)", "agency": "USGS Astrogeology / NASA",
         "mission": "MRO", "instrument": "HiRISE", "crs": src["ortho_crs"], "native_pixel_m": 0.25,
         "processing": "warped from orthographic to the DTM grid at 1 m with GDAL average; 2-98 % stretch for display"},
        {"id": "ares1_catalog", "role": "endpoint positions (rover positions)", "url": None,
         "product": f"ARES-1 science catalog {catalog_version} (PDS Three Forks tables, PDS Initial Reports, NASA MMGIS)"},
    ]
    (tmp / "sources.json").write_bytes(json.dumps(sources, indent=1).encode())

    files = sorted(p.name for p in tmp.iterdir())
    manifest = [{"file": f, "sha256": hashlib.sha256((tmp / f).read_bytes()).hexdigest()} for f in files]
    manifest_bytes = json.dumps(manifest, indent=1).encode()
    (tmp / "manifest.json").write_bytes(manifest_bytes)
    version = hashlib.sha256(manifest_bytes).hexdigest()[:12]

    k = math.cos(math.radians(src["lat_ts"]))
    lon = lambda x: math.degrees(x / (R * k)) + src["lon_0"]  # noqa: E731
    lat = lambda y: math.degrees(y / R)  # noqa: E731
    meta = {
        "contract_version": CONTRACT_VERSION, "dataset_version": version, "roi_id": area.AREA,
        "analysis_role": ("PROTOTYPE ANALYSIS grid for M0-A-B (HiRISE-derived 2 m): the M0-A grid widened west and south to hold Amalik. Not the ROI-A dataset."
                          if area.WIDE else "PROTOTYPE ANALYSIS grid for M0-A (HiRISE-derived 2 m). Not the ROI-A dataset; not in web/public/data."),
        "source_ids": ["hirise_dtm_1m", "hirise_ortho_25cm"],
        "nx": nx, "ny": ny, "dx_proj": dx, "dy_proj": dy, "dx_ground_m": dx_g, "dy_ground_m": dy,
        "x0": float(x0), "y0": float(y0), "radius_m": float(R), "lat_ts_deg": float(src["lat_ts"]), "central_meridian_deg": float(src["lon_0"]),
        "bounds_geo": {"lat_min": lat(y0 - ny * dy), "lat_max": lat(y0), "lon_min": lon(x0), "lon_max": lon(x0 + nx * dx)},
        "roi_request_geo": box, "source_window": {"col0": src["col0"], "row0": src["row0"], "source_pixel_m": src["res"], "cells_per_axis": K},
        "elevation_unit": "m",
        "vertical_reference": "UNVERIFIED: USGS HiRISE DTM tied to MOLA ('DeltaGeoid' in the file name); stereo pairs C/W/DL differ by up to 2.4 m (constant offsets); this box is pair C only",
        "nodata_policy": "NaN in dem = no source data (any NaN in a 2x2 block), never filled; validity 1 = not routable",
        "h_min": float(np.nanmin(dem)), "h_max": float(np.nanmax(dem)), "slope_method": "horn3x3",
        "semantic_resolution": {"dem_posting_m": dx, "image_gsd_m": float(src["res"]),
                                "note": "2 m posting of a 1 m stereo DTM; effective terrain resolution is coarser (several metres). Rocks below that are not represented. Ortho is display only."},
        "gates": gates(),
    }
    if superset:
        meta["superset_of"] = superset
    (tmp / "terrain.json").write_bytes(json.dumps(meta, indent=1).encode())
    out = OUT / version
    shutil.rmtree(out, ignore_errors=True)
    tmp.rename(out)
    assert (out / "dem.f32.bin").stat().st_size == nx * ny * 4 and (out / "validity.u8.bin").stat().st_size == nx * ny
    for m in json.loads((out / "manifest.json").read_bytes()):
        assert hashlib.sha256((out / m["file"]).read_bytes()).hexdigest() == m["sha256"], m["file"]
    index = {area.AREA: {"dataset_version": version, "path": f"analysis/{area.AREA}/bundle/{version}/", "role": "prototype_analysis",
                     "terrain_json_sha256": hashlib.sha256((out / "terrain.json").read_bytes()).hexdigest()}}
    (OUT / "index.json").write_bytes(json.dumps(index, indent=1).encode())
    print(f"{area.AREA} bundle {version}: {nx} x {ny} cells, valid {(v != NODATA_SOURCE).mean():.4f}, endpoints "
          + ", ".join(f"{k} r{e['row']} c{e['col']} v{e['validity']} snap {e['snap_distance_ground_m']} m" for k, e in eps.items()))
    return version


def main():
    catalog_version, ends = endpoints()
    box = area.box()
    if "--offline" in sys.argv:
        c = np.load(CACHE, allow_pickle=False)
        src = {k: (c[k].item() if c[k].ndim == 0 else c[k]) for k in c.files}
        src["ortho_t"] = [float(t) for t in src["ortho_t"]]
        src["ortho_nodata"] = None if np.isnan(src["ortho_nodata"]) else src["ortho_nodata"]
    else:
        src = fetch(box)
        CACHE.parent.mkdir(exist_ok=True)
        np.savez_compressed(CACHE, **{k: (np.nan if v is None else v) for k, v in src.items()})
    build(src, box, ends, catalog_version)


if __name__ == "__main__":
    main()
