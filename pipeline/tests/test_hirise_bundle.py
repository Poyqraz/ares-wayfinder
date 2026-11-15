"""Offline checks of the committed T-HiRISE-1 display-only bundle (no network, no source cache needed)."""
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

DATA = Path(__file__).resolve().parents[2] / "web" / "public" / "data"


@pytest.fixture(scope="module")
def bundle():
    idx = json.loads((DATA / "hirise" / "index.json").read_bytes())["roi_a"]
    base = DATA / idx["path"].removeprefix("data/")
    mb = (base / "manifest.json").read_bytes()
    man = json.loads(mb)
    ctx = json.loads((DATA / "roi_a" / man["aligned_to_ctx_bundle"]["dataset_version"] / "terrain.json").read_bytes())
    return idx, base, mb, man, ctx


def grid(base, g, dtype):
    return np.frombuffer((base / g["file"]).read_bytes(), dtype).reshape(g["ny"], g["nx"]).astype(np.float64)


def bm(a, f):
    h, w = a.shape
    return a.reshape(h // f, f, w // f, f).mean(axis=(1, 3))


def test_hashes_version_and_index(bundle):
    idx, base, mb, man, _ = bundle
    assert hashlib.sha256(mb).hexdigest() == idx["manifest_sha256"]
    assert hashlib.sha256(mb).hexdigest()[:12] == idx["dataset_version"] == base.name
    for f in man["files"]:
        b = (base / f["file"]).read_bytes()
        assert len(b) == f["bytes"] and hashlib.sha256(b).hexdigest() == f["sha256"], f["file"]
    assert {p.name for p in base.iterdir()} == {f["file"] for f in man["files"]} | {"manifest.json"}


def test_display_only_and_not_adjusted(bundle):
    idx, _, _, man, _ = bundle
    assert idx["role"] == "display_only" and "DISPLAY ONLY" in man["layer_role"]
    assert man["elevation"]["adjusted_to_ctx"] is False
    assert man["elevation"]["vertical_reference"].startswith("UNVERIFIED")
    assert man["registration"]["applied_correction_m"] == {"east": 0.0, "north": 0.0}
    assert {s["doi"] for s in man["sources"]} == {"10.5066/P9REJ9JN", "10.5066/P9QJDP48"}


def test_grid_aligned_to_ctx_extent(bundle):
    _, _, _, man, ctx = bundle
    e = man["extent_proj_m"]
    assert (e["x_min"], e["y_max"]) == (ctx["x0"], ctx["y0"])
    assert math.isclose(e["x_max"], ctx["x0"] + ctx["nx"] * ctx["dx_proj"]) and math.isclose(e["y_min"], ctx["y0"] - ctx["ny"] * ctx["dy_proj"])
    assert f"+lat_ts={ctx['lat_ts_deg']}" in man["crs"]
    g = man["grids"]
    assert (g["dtm_2m"]["nx"], g["dtm_2m"]["ny"]) == (ctx["nx"] * 10, ctx["ny"] * 10)
    assert (g["ortho_0p5m"]["nx"], g["ortho_0p5m"]["ny"]) == (ctx["nx"] * 40, ctx["ny"] * 40)


def test_fully_valid_and_fallback_is_block_mean(bundle):
    _, base, _, man, _ = bundle
    d2 = grid(base, man["grids"]["dtm_2m"], "<f4")
    d4 = grid(base, man["grids"]["dtm_4m"], "<f4")
    assert np.isfinite(d2).all() and np.isfinite(d4).all()
    assert np.abs(bm(d2, 2) - d4).max() < 1e-3  # float32 rounding only
    assert all(v["n_invalid"] == 0 for v in man["grids"].values())


def test_heights_are_hirise_not_ctx(bundle):
    """CTX - HiRISE keeps its measured offset: heights were not forced onto CTX (and not copied from it)."""
    _, base, _, man, ctx = bundle
    d2 = grid(base, man["grids"]["dtm_2m"], "<f4")
    cdem = np.fromfile(DATA / "roi_a" / ctx["dataset_version"] / "dem.f32.bin", "<f4").reshape(ctx["ny"], ctx["nx"])
    diff = cdem - bm(d2, 10)
    assert 1.2 < np.median(diff) < 2.2
    assert diff.std() > 1.0
    # sub-cell relief exists inside 20 m cells (a resampled 20 m surface would have almost none)
    sub = d2.reshape(ctx["ny"], 10, ctx["nx"], 10).std(axis=(1, 3))
    assert np.median(sub) > 0.1


def test_orientation_against_ctx(bundle):
    _, base, _, man, ctx = bundle
    t = np.asarray(Image.open(base / "ortho_0p5m.jpg").convert("L")).astype(np.float64)
    co = np.asarray(Image.open(DATA / "roi_a" / ctx["dataset_version"] / "ortho.jpg").convert("L")).astype(np.float64)
    h = bm(t, 10)

    def r(a, b):
        a = a - a.mean()
        b = b - b.mean()
        return (a * b).sum() / math.sqrt((a * a).sum() * (b * b).sum())

    as_is = r(h, co)
    assert as_is > 0.7
    assert as_is > r(h[::-1], co) + 0.4 and as_is > r(h[:, ::-1], co) + 0.4


def test_poi_cells_valid(bundle):
    _, base, _, man, ctx = bundle
    d2 = grid(base, man["grids"]["dtm_2m"], "<f4")
    R, k = ctx["radius_m"], math.cos(math.radians(ctx["lat_ts_deg"]))
    for p in json.loads((DATA / "roi_a" / ctx["dataset_version"] / "pois.json").read_bytes()):
        c = int((R * k * math.radians(p["geo"]["lon"]) - ctx["x0"]) // 2.0)
        r = int((ctx["y0"] - R * math.radians(p["geo"]["lat"])) // 2.0)
        assert np.isfinite(d2[r - 1:r + 2, c - 1:c + 2]).all(), p["id"]
