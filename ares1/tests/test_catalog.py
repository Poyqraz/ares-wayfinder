"""ARES-1 catalog: bundle integrity, deterministic rebuild and scientific invariants."""
import csv
import hashlib
import io
import json
from collections import Counter
from pathlib import Path

import pytest

import build_catalog

A1 = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def bundle():
    idx = json.loads((A1 / "bundle" / "index.json").read_bytes())["catalog"]
    base = A1.parent / idx["path"]
    mb = (base / "manifest.json").read_bytes()
    return idx, base, mb, json.loads(mb), json.loads((base / "catalog.json").read_bytes())


def test_bundle_integrity(bundle):
    idx, base, mb, man, _ = bundle
    assert hashlib.sha256(mb).hexdigest() == idx["manifest_sha256"]
    assert idx["version"] == idx["manifest_sha256"][:12] == base.name
    for f in man["files"]:
        b = (base / f["file"]).read_bytes()
        assert len(b) == f["bytes"] and hashlib.sha256(b).hexdigest() == f["sha256"]
    for s in man["source_register"]:
        if s["local_path"]:
            b = (A1.parent / s["local_path"]).read_bytes()
            assert hashlib.sha256(b).hexdigest() == s["sha256"], s["id"]


def test_rebuild_is_deterministic(bundle):
    base = bundle[1]
    rebuilt, *_ = build_catalog.build()
    assert json.dumps(rebuilt, indent=1, ensure_ascii=False).encode("utf-8") == (base / "catalog.json").read_bytes()


def test_all_consistency_checks_passed(bundle):
    cat = bundle[4]
    assert cat["consistency_checks"] and all(c["pass"] for c in cat["consistency_checks"])


def test_m0_ten_tubes_and_classes(bundle):
    cat = bundle[4]
    drops = cat["depot_drop_events"]
    assert len(drops) == 10 and len({d["sample_designation"] for d in drops}) == 10
    m0 = {d["sample_designation"] for d in drops}
    classes = Counter(s["classification"]["team_class"] for s in cat["samples"] if s["sample_designation"] in m0)
    assert classes == {"igneous_rock": 4, "sedimentary_rock": 3, "regolith": 1, "atmosphere": 1, "witness_control": 1}
    assert [d["drop_sol"] for d in drops] == [653, 655, 661, 666, 668, 672, 675, 680, 682, 690]


def test_tube_centres_are_never_invented(bundle):
    cat = bundle[4]
    text = (A1 / "sources/raw/pds_three_forks/sample_tube_locations.csv").read_text()
    pds = {r["Sample Designation"]: r for r in csv.DictReader(io.StringIO(text))}
    for d in cat["depot_drop_events"]:
        tc = d["tube_center"]
        assert tc["status"] == "NOT_AVAILABLE" and tc["lat_deg"] is None and tc["lon_deg_east"] is None and tc["uncertainty_m"] is None
        rp = d["rover_position"]
        assert "ROVER position" in rp["semantics"] and "NOT the tube" in rp["semantics"]
        row = pds[d["sample_designation"]]
        assert (rp["lat_deg"], rp["lon_deg_east"]) == (float(row["Rover Latitude"]), float(row["Rover Longitude"]))
    assert "tube_center_lat" not in json.dumps(cat)


def test_a_two_outcrops_four_cores(bundle):
    cat = bundle[4]
    oc = {o["name"]: o for o in cat["outcrops"]}
    assert set(oc) == {"Skinner Ridge", "Wildcat Ridge"}
    names = {s["id"]: s["sample_name"] for s in cat["samples"]}
    assert sorted(names[c] for c in oc["Skinner Ridge"]["cores"]) == ["Skyland", "Swift Run"]
    assert sorted(names[c] for c in oc["Wildcat Ridge"]["cores"]) == ["Bearwallow", "Hazeltop"]
    m0 = {d["sample"] for d in cat["depot_drop_events"]}
    assert sorted(names[c] for o in oc.values() for c in o["cores"] if c in m0) == ["Bearwallow", "Skyland"]
    assert cat["reference_distances_m"]["skinner_ridge-wildcat_ridge_sampling_positions"] > 5
    assert all(o["spatial"]["precision"] == "pds_rover_position_at_sampling" for o in oc.values())


def test_b_entities_and_claims(bundle):
    cat = bundle[4]
    rock = next(r for r in cat["rocks"] if r["id"] == "rock:cheyava_falls")
    sc = next(s for s in cat["samples"] if s["sample_name"] == "Sapphire Canyon")
    region = next(r for r in cat["regions"] if r["id"] == "region:bright_angel")
    assert (region["kind"], rock["kind"], sc["kind"]) == ("region", "rock", "sample") and sc["id"] in rock["cores"]
    assert sc["sample_designation"] not in {d["sample_designation"] for d in cat["depot_drop_events"]}
    assert (sc["nasa_public_sample_number"], sc["designation_tube_number"]) == (25, 28)
    team_text = (A1 / "sources/team/research_v1/B_Cheyava_Falls_bulgular.csv").read_text(encoding="utf-8-sig")
    team = list(csv.DictReader(io.StringIO(team_text)))
    claims = {c["id"]: c for c in cat["claims"]}
    assert len(claims) == 9
    for t in team:  # the supplied research is preserved verbatim
        c = claims[f"claim:{t['claim_id']}"]
        assert (c["claim"], c["confidence"], c["limitation"], c["primary_source_url"]) == (t["claim"], t["confidence"], t["limitation"], t["primary_source_url"])
    assert claims["claim:B-08"]["evidence_kind"] == "hypothesis" and claims["claim:B-08"]["confidence"] == "low"
    assert {c["evidence_kind"] for c in claims.values()} == {"identity", "observation", "interpretation", "hypothesis", "rationale"}
    flags = next(m for m in cat["missions"] if m["id"] == "B")["flags"]
    assert flags["life_detected"] is False and flags["biological_origin_confirmed"] is False


def test_meda_series_is_historical_and_complete(bundle):
    base, cat = bundle[1], bundle[4]
    s = cat["measurement_series"][0]
    assert s["data_kind"] == "observed_historical" and "forecast" in s["not_to_be_presented_as"]
    rows = list(csv.DictReader(io.StringIO((base / s["rows_file"]).read_text())))
    assert len(rows) == 7440 and {r["status"] for r in rows} == {"valid"}
    assert rows[0]["pressure_as_published"] == "796.82"  # original text, never re-formatted
    qa = json.loads((base / s["qa_file"]).read_bytes())
    assert qa["status_counts"]["valid"] == 7440 and qa["rover_location_context"]["confidence"] == "medium"


def test_reference_waypoints_are_regional_only(bundle):
    for w in bundle[4]["reference_waypoints"]:
        assert w["coordinate_status"] == "approximate_rover_waypoint"
        assert "not a sample or tube point" in w["position"]["semantics"]


def test_every_cited_source_is_registered(bundle):
    man, cat = bundle[3], bundle[4]
    ids = {s["id"] for s in man["source_register"]}
    used = set()

    def walk(x):
        if isinstance(x, dict):
            for k, v in x.items():
                if k in ("source", "primary_source", "team_source") and isinstance(v, str):
                    used.add(v)
                elif k == "sources" and isinstance(v, list):
                    used.update(i for i in v if isinstance(i, str))
                else:
                    walk(v)
        elif isinstance(x, list):
            for i in x:
                walk(i)

    walk(cat)
    assert used <= ids, sorted(used - ids)
