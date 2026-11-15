"""ORBITAL-scene fallback image: downsampled MRO CTX orthomosaic of Jezero (not MOLA, not a live view).

Streams the 5 m ortho in row chunks over HTTP (~10 MB in memory), takes exact 18x18 block means,
applies a p2-p98 linear stretch, and writes a JPEG plus a provenance sidecar.

Usage: uv run python context_overview.py
Output: web/public/data/context/ctx_overview.jpg, ctx_overview.json
"""
import datetime
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.windows import Window

from t03_validate import ORTHO_URL, ROIS

K = 18  # source pixels per preview pixel along each axis (~90 m preview pixels)
CHUNK = K * 32  # source rows per HTTP read
LID = "urn:nasa:pds:mars2020_ctx_basemap_2021:data:m20_ctxortho_mosaic"
REPO = Path(__file__).resolve().parent.parent
ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_CHUNK_SIZE=4194304)


def main():
    out_dir = REPO / "web" / "public" / "data" / "context"
    out_dir.mkdir(parents=True, exist_ok=True)
    with rasterio.Env(**ENV), rasterio.open("/vsicurl/" + ORTHO_URL) as src:
        t, W, H = src.transform, src.width, src.height
        assert t.b == 0 and t.d == 0 and t.e < 0, "expected a north-up grid without rotation"
        pw, ph = W // K, H // K  # trailing source columns/rows that do not fill a block are omitted
        acc = np.empty((ph, pw), dtype=np.float64)
        for r0 in range(0, ph * K, CHUNK):
            n = min(CHUNK, ph * K - r0)
            a = src.read(1, window=Window(0, r0, pw * K, n)).astype(np.float64)
            acc[r0 // K : (r0 + n) // K] = a.reshape(n // K, K, pw, K).mean(axis=(1, 3))
            print(f"rows {r0 + n}/{ph * K}", flush=True)
        # self-check: recompute one block independently from a direct 18x18 read
        br, bc = ph // 2, pw // 2
        block = src.read(1, window=Window(bc * K, br * K, K, K)).astype(np.float64)
        assert abs(block.mean() - acc[br, bc]) < 1e-9, "block mean mismatch"
        p = src.crs.to_dict()
        R, lat_ts = p.get("R") or p.get("a"), p.get("lat_ts", 0.0)
        crs_text = src.crs.to_proj4()

    lo, hi = np.percentile(acc, [2, 98])
    img = np.clip((acc - lo) / (hi - lo) * 255, 0, 255).astype(np.uint8)
    jpg = out_dir / "ctx_overview.jpg"
    Image.fromarray(img, mode="L").save(jpg, quality=85, optimize=True)
    jpg_bytes = jpg.read_bytes()
    assert Image.open(jpg).size == (pw, ph)

    x0, y0 = t.c, t.f
    x1, y1 = x0 + pw * K * t.a, y0 + ph * K * t.e
    k = math.cos(math.radians(lat_ts))
    lon = lambda x: math.degrees(x / (R * k))  # noqa: E731
    lat = lambda y: math.degrees(y / R)  # noqa: E731
    ext_geo = {"lat_min": lat(y1), "lat_max": lat(y0), "lon_min": lon(x0), "lon_max": lon(x1)}
    for roi, box in ROIS.items():  # the demo ROIs must lie inside the preview
        assert ext_geo["lat_min"] < box["lat"][0] and box["lat"][1] < ext_geo["lat_max"], roi
        assert ext_geo["lon_min"] < box["lon"][0] and box["lon"][1] < ext_geo["lon_max"], roi

    meta = {
        "title": "MRO CTX orbital overview of Jezero crater (downsampled)",
        "is_not": ["MOLA imagery", "a live or current view", "an astronaut viewpoint"],
        "mission": "Mars Reconnaissance Orbiter (MRO)",
        "instrument": "Context Camera (CTX)",
        "product_id": LID,
        "product_version": "1.0",
        "product_title": "Mars 2020 Science Investigation CTX Orthoimage Mosaic",
        "citation": "Mangold et al., 2021, Perseverance rover reveals an ancient delta-lake system and flood deposits at Jezero crater, Mars, Science. https://doi.org/10.1126/science.abl4051",
        "source_url": ORTHO_URL,
        "source_filename": ORTHO_URL.rsplit("/", 1)[1],
        "source_size_px": [W, H],
        "source_pixel_m": [t.a, -t.e],
        "preview_size_px": [pw, ph],
        "preview_pixel_m": [t.a * K, -t.e * K],
        "crs": crs_text,
        "orientation": "north up, row 0 = north edge, column 0 = west edge",
        "extent_proj_m": {"x_min": x0, "x_max": x1, "y_min": y1, "y_max": y0},
        "extent_geo_deg": ext_geo | {"latitude": "planetocentric", "longitude": "east-positive"},
        "processing": (
            f"Exact {K}x{K} block mean over source columns 0..{pw * K - 1} and rows 0..{ph * K - 1} "
            f"(trailing {W - pw * K} columns and {H - ph * K} rows omitted), streamed in {CHUNK}-row chunks; "
            f"no NoData tag in source, so all pixel values (including edge fill, if any) are averaged; "
            f"linear stretch from block-mean p2={lo:.2f} to p98={hi:.2f} -> 0..255; JPEG quality 85, 8-bit grayscale."
        ),
        "scale_note": "Ground east-west scale varies by about +/-0.5% across the mosaic (latitude of true scale 18.4663 deg).",
        "generated_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "generator": "pipeline/context_overview.py",
        "jpg_bytes": len(jpg_bytes),
        "jpg_sha256": hashlib.sha256(jpg_bytes).hexdigest(),
    }
    (out_dir / "ctx_overview.json").write_bytes(json.dumps(meta, indent=1).encode())  # bytes: no CRLF
    print(json.dumps({k: meta[k] for k in ("preview_size_px", "jpg_bytes", "jpg_sha256", "extent_geo_deg")}, indent=1))


if __name__ == "__main__":
    main()
