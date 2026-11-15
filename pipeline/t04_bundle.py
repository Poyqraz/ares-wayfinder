"""T04: write the versioned terrain bundle (contracts/CONTRACT.md §2) from the T03 cache.

Usage: uv run python t04_bundle.py [roi_a]
Output: web/public/data/<roi>/<dataset_version>/ and web/public/data/index.json
"""
import hashlib
import json
import math
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import zoom

from poi_evidence import bundle_problems
from t03_validate import ROIS, hillshade, stretch

REPO = Path(__file__).resolve().parent.parent
CONTRACT_VERSION = "1.0.0"


def main(roi_id):
    c = np.load(Path(__file__).parent / "cache" / f"{roi_id}.npz")
    x0, y0, dx, dy, dx_g, dy_g, R, lat_ts, col0, row0 = c["meta"]
    dem = c["dem"].astype(np.float32)
    slope = c["slope"].astype(np.float32)
    validity = c["validity"].astype(np.uint8)
    ny, nx = dem.shape
    assert slope.shape == validity.shape == dem.shape and c["ortho_5m"].shape == (ny * 4, nx * 4)
    problems = bundle_problems((REPO / "science" / "pois.json").read_bytes())  # CR-004 gate: never hash a bad record
    if problems:
        raise SystemExit("refusing to bundle science/pois.json:\n  " + "\n  ".join(problems))

    tmp = REPO / "web" / "public" / "data" / roi_id / "_staging"
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    dem.astype("<f4").tofile(tmp / "dem.f32.bin")
    slope.astype("<f4").tofile(tmp / "slope_deg.f32.bin")
    validity.tofile(tmp / "validity.u8.bin")
    Image.fromarray(np.nan_to_num(stretch(c["ortho_5m"])).astype(np.uint8)).save(tmp / "ortho.jpg", quality=90)
    hs = zoom(hillshade(c["dem"], dx_g, dy_g), 4, order=1)
    Image.fromarray((hs * 255).astype(np.uint8)).save(tmp / "hillshade.png")
    shutil.copy(REPO / "science" / "pois.json", tmp / "pois.json")
    shutil.copy(REPO / "science" / "sources.json", tmp / "sources.json")

    files = sorted(p.name for p in tmp.iterdir())
    manifest = [{"file": f, "sha256": hashlib.sha256((tmp / f).read_bytes()).hexdigest()} for f in files]
    manifest_bytes = json.dumps(manifest, indent=1).encode()
    (tmp / "manifest.json").write_bytes(manifest_bytes)
    version = hashlib.sha256(manifest_bytes).hexdigest()[:12]

    k = math.cos(math.radians(lat_ts))
    lon = lambda x: math.degrees(x / (R * k))  # noqa: E731
    lat = lambda y: math.degrees(y / R)  # noqa: E731
    meta = {
        "contract_version": CONTRACT_VERSION,
        "dataset_version": version,
        "roi_id": roi_id,
        "source_ids": ["ctx_dem_20m", "ctx_ortho_5m"],
        "nx": nx, "ny": ny,
        "dx_proj": float(dx), "dy_proj": float(dy),
        "dx_ground_m": float(dx_g), "dy_ground_m": float(dy_g),
        "x0": round(float(x0), 6), "y0": round(float(y0), 6),
        "radius_m": float(R), "lat_ts_deg": float(lat_ts), "central_meridian_deg": 0.0,
        "bounds_geo": {
            "lat_min": lat(y0 - ny * dy), "lat_max": lat(y0),
            "lon_min": lon(x0), "lon_max": lon(x0 + nx * dx),
        },
        "roi_request_geo": ROIS[roi_id],
        "source_window": {"col0": int(col0), "row0": int(row0)},
        "elevation_unit": "m",
        "vertical_reference": "UNVERIFIED: not stated in DEM label; agrees within ~1 m with MOLA-referenced TRN DTM at 4 points",
        "nodata_policy": "NaN in dem = no source data, never filled; validity 1 = not routable",
        "h_min": float(np.nanmin(dem)), "h_max": float(np.nanmax(dem)),
        "slope_method": "horn3x3",
        "semantic_resolution": {
            "dem_posting_m": float(dx), "image_gsd_m": 5.0,
            "note": "Ortho is display only; 5 m image does not imply 5 m terrain or hazard information.",
        },
    }
    # write_bytes, not write_text: hashed files must not get Windows CRLF
    (tmp / "terrain.json").write_bytes(json.dumps(meta, indent=1).encode())

    out = tmp.parent / version
    shutil.rmtree(out, ignore_errors=True)
    tmp.rename(out)

    # self-check: sizes and hashes as written
    assert (out / "dem.f32.bin").stat().st_size == nx * ny * 4
    assert (out / "validity.u8.bin").stat().st_size == nx * ny
    for m in json.loads((out / "manifest.json").read_text()):
        assert hashlib.sha256((out / m["file"]).read_bytes()).hexdigest() == m["sha256"], m["file"]
    assert hashlib.sha256((out / "manifest.json").read_bytes()).hexdigest()[:12] == version

    index_path = REPO / "web" / "public" / "data" / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {}
    # terrain.json carries dataset_version (derived from the manifest), so its hash lives here
    index[roi_id] = {
        "dataset_version": version,
        "path": f"data/{roi_id}/{version}/",
        "terrain_json_sha256": hashlib.sha256((out / "terrain.json").read_bytes()).hexdigest(),
    }
    index_path.write_bytes(json.dumps(index, indent=1).encode())
    print(f"bundle {roi_id} {version}: {sum(p.stat().st_size for p in out.iterdir())} bytes")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "roi_a")
