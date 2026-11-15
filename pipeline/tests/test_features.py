import csv
import hashlib
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
IDX = json.loads((REPO / "analysis" / "features" / "index.json").read_bytes())["terrain_features"]
BASE = REPO / IDX["path"]
LAYER = json.loads((BASE / "terrain_features.json").read_bytes())
QA = json.loads((BASE / "F01" / "F01_qa.json").read_bytes())
FEAT = {f["feature_id"]: f for f in LAYER["features"]}


def test_bundle_integrity_and_version():
    manifest = json.loads((BASE / "manifest.json").read_bytes())
    for m in manifest:
        assert hashlib.sha256((BASE / m["file"]).read_bytes()).hexdigest() == m["sha256"], m["file"]
    assert hashlib.sha256((BASE / "manifest.json").read_bytes()).hexdigest()[:12] == IDX["version"]


def test_sources_are_the_explicitly_selected_products_with_real_pixels():
    s = QA["sources"]
    assert s["HIRISE-2020"]["url"].endswith("JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif")  # not soc_007
    assert s["DEM-2020"]["url"].endswith("JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif")
    assert s["CTX-2020"]["url"].endswith("JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif")
    for k in ("CTX-2020", "DEM-2020", "HIRISE-2020"):
        assert "+proj=eqc" in s[k]["header"]["crs"] and "+lat_ts=0" in s[k]["header"]["crs"]
        assert s[k]["window_nodata_share"] == 0.0
        assert len(s[k]["window_sha256"]) == 64


def test_ids_are_separate_from_missions_and_anchors_are_not_feature_centres():
    assert set(FEAT) == {"F01", "F02", "F03"} and not set(FEAT) & {"M0", "A", "B"}
    assert all(f["anchor"]["is_feature_centre"] is False and f["anchor"]["source_type"] == "rover_waypoint" for f in FEAT.values())
    assert QA["anchors_verified_in_mmgis"] == {"F01": True, "F02": True, "F03": True}
    assert all(f["validated_for_human_eva"] is False and f["used_in_routing"] is False for f in FEAT.values())


def test_pending_features_carry_no_invented_numbers():
    for fid in ("F02", "F03"):
        f = FEAT[fid]
        assert f["geometry"] is None and f["transect"] is None and f["three_raster_validation"] == "PENDING"
        assert all(v is None for v in f["measurements"].values())
    assert FEAT["F02"]["published_reference"]["approx_diameter_m"] == 900 and FEAT["F02"]["published_reference"]["uncertainty_m"] is None


def test_f01_geometry_profile_and_measurements_are_consistent():
    geom = json.loads((BASE / "F01" / "F01_geometry.json").read_bytes())
    lines = {f["id"]: f for f in geom["features"]}
    assert len(lines["F01-crest"]["line"]) >= 5 and len(lines["F01-foot"]["line"]) >= 5
    w = QA["window"]
    rows = list(csv.DictReader((BASE / "F01" / "F01_profile.csv").read_text().splitlines()))
    assert len(rows) == 401 and all(r["h_mosaic_m"] not in ("nan", "") for r in rows)
    n = QA["measurements"]["nominal"]
    assert n["crest_elev_m"] > n["foot_elev_m"] and n["horizontal_span_m"] > 0
    assert abs(n["delta_z_m"] - (n["crest_elev_m"] - n["foot_elev_m"])) < 1e-6
    u = QA["uncertainty"]
    lo, hi = u["independent_stereo_dem_range"]["delta_z_m"]
    assert lo - 0.5 <= n["delta_z_m"] <= hi + 0.5
    assert 0 < n["local_slope_p95_deg"] < 90 and w["nx"] > 300 and w["ny"] > 300


def test_qa_status_never_self_certifies():
    st = QA["status"]
    assert st["three_raster_validation"] == "AUTOMATED_MEASUREMENT_PENDING_REVIEW"
    assert st["qa_status"] == "LITERATURE_CONFIRMED" and st["reviewer"] is None
    for r in QA["registration"].values():
        assert r["peak_on_search_edge"] is False
