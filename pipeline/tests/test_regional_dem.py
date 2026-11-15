"""Offline checks of the committed display-only regional relief bundle (analysis/regional_dem/, no network)."""
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from regional_dem import LIMITS, aggregate
from roi import NODATA_SOURCE, VALID, VALID_SLOPE_UNDEFINED

REPO = Path(__file__).resolve().parents[2]
RD = REPO / "analysis" / "regional_dem"


@pytest.fixture(scope="module")
def b():
    idx = json.loads((RD / "index.json").read_bytes())["regional_dem"]
    base = REPO / idx["path"]
    rv = json.loads((REPO / "analysis" / "regional" / "index.json").read_bytes())["regional"]
    meta = json.loads((base / "terrain.json").read_bytes())
    dem = np.fromfile(base / "dem.f32.bin", "<f4").reshape(meta["ny"], meta["nx"])
    v = np.fromfile(base / "validity.u8.bin", np.uint8).reshape(meta["ny"], meta["nx"])
    return {"idx": idx, "base": base, "meta": meta, "dem": dem, "v": v,
            "regional": json.loads((REPO / rv["path"] / "regional.json").read_bytes()),
            "checks": json.loads((RD / "checks.json").read_bytes())}


def test_hashes_version_and_index(b):
    base, idx = b["base"], b["idx"]
    mb = (base / "manifest.json").read_bytes()
    assert hashlib.sha256(mb).hexdigest() == idx["manifest_sha256"]
    assert hashlib.sha256(mb).hexdigest()[:12] == idx["dataset_version"] == base.name == b["meta"]["dataset_version"]
    man = json.loads(mb)
    assert [m["file"] for m in man] == sorted(m["file"] for m in man)
    for m in man:
        assert hashlib.sha256((base / m["file"]).read_bytes()).hexdigest() == m["sha256"], m["file"]
    # terrain.json carries the version, so (contract §2 convention) it is pinned by index.json instead of the manifest
    assert hashlib.sha256((base / "terrain.json").read_bytes()).hexdigest() == idx["terrain_json_sha256"]
    assert {p.name for p in base.iterdir()} == {m["file"] for m in man} | {"manifest.json", "terrain.json"}
    assert {m["file"] for m in man} == {"dem.f32.bin", "validity.u8.bin", "hillshade.png", "sources.json"}


def test_role_and_labels(b):
    m = b["meta"]
    assert m["roi_id"] == "regional" and m["role"] == "display_only_regional_relief" == b["idx"]["role"]
    assert m["contract_version"] == "1.0.0" and m["elevation_unit"] == "m" and m["slope_method"] == "horn3x3"
    assert m["vertical_reference"].startswith("UNVERIFIED")
    assert m["gates"]["R3_registration"] in ("PASS", "UNRESOLVED")
    assert b["checks"]["decision"]["chosen"] in m["source_ids"]
    srcs = json.loads((b["base"] / "sources.json").read_bytes())
    assert set(m["source_ids"]) <= {s["id"] for s in srcs}
    assert not any(k in json.dumps(m) for k in ("generated_utc", "timestamp"))


def test_grid_crs_matches_regional_image(b):
    m, r = b["meta"], b["regional"]
    p = dict(kv.split("=") for kv in r["crs_proj4"].split() if "=" in kv)
    assert p["+proj"] == "eqc" and float(p["+R"]) == m["radius_m"] and float(p["+lat_ts"]) == m["lat_ts_deg"] == 0.0
    assert float(p["+lon_0"]) == m["central_meridian_deg"] == 0.0 and m["crs_proj4"] == r["crs_proj4"]
    assert m["dx_proj"] == m["dy_proj"] == m["dy_ground_m"] == 2 * m["source_window"]["source_pixel_m"] == 40.0
    lat_c = math.degrees((m["y0"] - m["ny"] * m["dy_proj"] / 2) / m["radius_m"])
    assert math.isclose(m["dx_ground_m"], m["dx_proj"] * math.cos(math.radians(lat_c)), rel_tol=1e-12)
    # the grid covers the regional science extent, and the 6 m texture to within one 40 m cell on every side
    t, R = m["texture"], m["radius_m"]
    reg = r["assets"]["science_6m.jpg"]
    assert (t["x0"], t["y0"], t["nx"], t["ny"]) == (reg["x0"], reg["y0"], reg["nx"], reg["ny"])
    box = m["roi_request_geo"]
    assert box == reg["bounds_geo_requested"]
    xmin, xmax = (R * math.radians(box[k]) for k in ("lon_min", "lon_max"))
    ymin, ymax = (R * math.radians(box[k]) for k in ("lat_min", "lat_max"))
    gx1, gy1 = m["x0"] + m["nx"] * m["dx_proj"], m["y0"] - m["ny"] * m["dy_proj"]
    assert m["x0"] <= xmin and gx1 >= xmax and m["y0"] >= ymax and gy1 <= ymin
    tx1, ty1 = t["x0"] + t["nx"] * t["dx"], t["y0"] - t["ny"] * t["dy"]
    for a, c in ((m["x0"], t["x0"]), (gx1, tx1), (m["y0"], t["y0"]), (gy1, ty1)):
        assert abs(a - c) < m["dx_proj"]
    # x0/y0 are corners of the native 20 m source lattice (aggregation only, no resampling)
    src = b["checks"]["dems"][b["checks"]["decision"]["chosen"]]["header"]["transform"]
    for o, s0, d in ((m["x0"], src[2], src[0]), (m["y0"], src[5], -src[4])):
        k = (o - s0) / d
        assert abs(k - round(k)) < 1e-6


def test_nodata_never_filled_and_validity(b):
    m, dem, v = b["meta"], b["dem"], b["v"]
    assert set(np.unique(v)) <= {VALID, NODATA_SOURCE, VALID_SLOPE_UNDEFINED}  # rectangle: no OUTSIDE_ROI
    assert (np.isnan(dem) == (v == NODATA_SOURCE)).all()
    assert {str(i): int((v == i).sum()) for i in range(4)} == m["validity_counts"]
    n_src = m["source_window"]["source_nodata_px"]
    assert np.isnan(dem).sum() >= math.ceil(n_src / 4)  # each NoData source cell poisons at least its own block
    if n_src == 0:
        assert np.isfinite(dem).all()
    assert math.isclose(float(np.nanmin(dem)), m["h_min"]) and math.isclose(float(np.nanmax(dem)), m["h_max"])


def test_aggregate_propagates_nodata():
    raw = np.arange(16, dtype=np.float32).reshape(4, 4)
    raw[0, 1] = -3.4028226550889045e+38
    raw[3, 3] = np.nan
    z = aggregate(raw, -3.4028226550889045e+38)
    assert np.isnan(z[0, 0]) and np.isnan(z[1, 1]) and z[0, 1] == raw[0:2, 2:4].mean() and z[1, 0] == raw[2:4, 0:2].mean()


def test_vertex_budget_and_hillshade(b):
    m = b["meta"]
    assert m["nx"] * m["ny"] <= LIMITS["vertex_budget"]
    hs = Image.open(b["base"] / "hillshade.png")
    assert hs.mode == "L" and hs.size == (m["nx"], m["ny"])


def test_gates_recorded_before_and_consistent(b):
    c = b["checks"]
    d = c["dems"][c["decision"]["chosen"]]
    assert d["valid_share"] >= LIMITS["r1_valid_share"] and c["r2_trn_minus_jpl"]["mad_m"] <= LIMITS["r2_mad_m"]
    assert d["r3_registration"]["status"] in ("PASS", "UNRESOLVED") and d["suitable_display_only"]
    assert (RD / "GATES.md").exists()
