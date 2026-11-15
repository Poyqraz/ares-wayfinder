"""CR-004: optional POI evidence record — validation and display rules (offline)."""
import copy
import json
from pathlib import Path

from poi_evidence import LEGACY, bundle_problems, display_status, validate_evidence

REPO = Path(__file__).resolve().parents[2]
V2 = json.loads((REPO / "science" / "s2_release" / "pois.v2.proposed.json").read_bytes())
# Real legacy data: the POIs inside the preserved, immutable pre-S2 CTX bundle (v1.0.0, no evidence).
CURRENT = json.loads((REPO / "web" / "public" / "data" / "roi_a" / "fc22a0c8a91f" / "pois.json").read_bytes())
LIVE = (REPO / "science" / "pois.json").read_bytes()


def test_live_pois_is_either_the_legacy_file_or_the_approved_proposal():
    proposal = (REPO / "science" / "s2_release" / "pois.v2.proposed.json").read_bytes()
    legacy = (REPO / "web" / "public" / "data" / "roi_a" / "fc22a0c8a91f" / "pois.json").read_bytes()
    assert LIVE in (legacy, proposal)


def by_id(pois):
    return {p["id"]: p for p in pois}


def test_proposed_v2_is_valid_and_backward_compatible():
    for p in V2:
        assert validate_evidence(p) == [], p["id"]
        # v1.0.0 Poi fields are still present with the same types
        assert isinstance(p["id"], str) and isinstance(p["name"], str) and isinstance(p["claim"], str) and isinstance(p["source"], str)
        assert p["confidence"] in ("high", "medium", "low")
        assert isinstance(p["geo"]["lat"], float) and isinstance(p["geo"]["lon"], float)


def test_v2_statuses_are_the_approved_distinctions():
    s = {k: display_status(v) for k, v in by_id(V2).items()}
    for k in ("roubion", "rochette", "sid"):
        assert s[k]["coordinate"] == "VERIFIED" and s[k]["coordinate_label"] == "Coordinates: PDS rover position VERIFIED"
        assert s[k]["target_precision"] == "APPROXIMATE"
    assert s["landing"]["coordinate_label"] == "Coordinates: PDS landing-site position VERIFIED"
    assert s["landing"]["target_precision"] == "APPROXIMATE"  # 3.6 m between PLACES versions
    assert "not a validated astronaut habitat" in s["landing"]["role_label"]
    assert s["landing"]["elevation_label"] == "PDS landing-site elevation -2569.910 m (areoid, as printed in the source; not used for routing)"
    assert s["rochette"]["elevation_label"] == "PDS rover elevation -2574.553 m (areoid, as printed in the source; not used for routing)"
    for v in s.values():
        assert v["registration_label"] == "CTX DEM/image registration UNRESOLVED (S-4)"
        assert v["datum_label"] == "Vertical datum UNVERIFIED"
        assert v["notice"] is None
    assert all(p["evidence"]["role"]["validated_habitat"] is False for p in V2)


def test_v2_keeps_the_same_ctx_cells_and_pds_coordinates():
    cur, new = by_id(CURRENT), by_id(V2)
    assert set(cur) == set(new)
    for k in cur:  # working coordinates were 4-5 decimal roundings of the PDS values
        assert abs(cur[k]["geo"]["lat"] - new[k]["geo"]["lat"]) < 1e-5 and abs(cur[k]["geo"]["lon"] - new[k]["geo"]["lon"]) < 1e-5
        pr = new[k]["evidence"]["coordinate_source"]["printed"]
        assert (pr["lat"], pr["lon"]) == (new[k]["geo"]["lat"], new[k]["geo"]["lon"])


def test_legacy_poi_without_evidence_renders_unverified():
    for p in CURRENT:
        assert "evidence" not in p
        s = display_status(p)
        assert s == LEGACY | {"notice": None}


def test_confidence_never_implies_verified():
    p = copy.deepcopy(CURRENT[0])
    p["confidence"] = "high"
    assert display_status(p)["coordinate"] == "UNVERIFIED"


def test_invalid_or_inconsistent_evidence_falls_back_safely():
    p = copy.deepcopy(by_id(V2)["rochette"])
    p["evidence"]["target_location"]["precision"] = "PRECISE"
    s = display_status(p)
    assert s["coordinate"] == "UNVERIFIED" and s["notice"] and s["target_precision"] == "UNKNOWN"
    q = copy.deepcopy(by_id(V2)["landing"])
    q["evidence"]["role"]["validated_habitat"] = True
    assert validate_evidence(q) and display_status(q)["coordinate"] == "UNVERIFIED"
    r = copy.deepcopy(by_id(V2)["sid"])
    r["geo"]["lat"] += 1e-4  # ~6 m: geo no longer equals the cited source
    s = display_status(r)
    assert s["coordinate"] == "UNVERIFIED" and "does not match" in s["notice"]
    u = copy.deepcopy(by_id(V2)["roubion"])
    u["evidence"]["schema"] = "ares-poi-evidence/2"
    assert display_status(u)["notice"]


def test_t04_gate_accepts_current_and_proposed_and_rejects_bad_records():
    assert bundle_problems((REPO / "science" / "pois.json").read_bytes()) == []
    assert bundle_problems((REPO / "science" / "s2_release" / "pois.v2.proposed.json").read_bytes()) == []

    def raw(pois):
        return json.dumps(pois, indent=1, ensure_ascii=False).encode("utf-8")

    bad = copy.deepcopy(V2)
    bad[1]["evidence"]["ctx_registration"]["status"] = "SOLVED"
    assert any("ctx_registration" in p for p in bundle_problems(raw(bad)))
    moved = copy.deepcopy(V2)
    moved[2]["geo"]["lon"] += 1e-6
    assert any("differs from evidence" in p for p in bundle_problems(raw(moved)))
    dup = copy.deepcopy(V2)
    dup[3]["id"] = dup[0]["id"]
    assert any("duplicate id" in p for p in bundle_problems(raw(dup)))
    assert bundle_problems(raw(V2).replace(b"\n", b"\r\n"))[0].startswith("pois.json contains CR")


def test_t04_refuses_to_build_with_a_bad_pois_file(tmp_path, monkeypatch):
    import t04_bundle
    bad = copy.deepcopy(V2)
    bad[0]["evidence"]["role"]["validated_habitat"] = True
    (tmp_path / "science").mkdir()
    (tmp_path / "science" / "pois.json").write_bytes(json.dumps(bad).encode())
    monkeypatch.setattr(t04_bundle, "REPO", tmp_path)
    monkeypatch.setattr(t04_bundle.np, "load", lambda *_a, **_k: {"meta": [0] * 10, "dem": __import__("numpy").zeros((2, 2)), "slope": __import__("numpy").zeros((2, 2)), "validity": __import__("numpy").zeros((2, 2)), "ortho_5m": __import__("numpy").zeros((8, 8))})
    import pytest
    with pytest.raises(SystemExit, match="validated_habitat"):
        t04_bundle.main("roi_a")
    assert not (tmp_path / "web").exists()  # nothing staged
