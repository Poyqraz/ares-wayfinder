import hashlib
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
IDX = json.loads((REPO / "analysis" / "base" / "index.json").read_bytes())["base_scenario"]
S = json.loads((REPO / IDX["path"] / "base_scenario.json").read_bytes())


def test_integrity_and_hypothetical_status():
    m = json.loads((REPO / IDX["path"] / "manifest.json").read_bytes())
    assert hashlib.sha256((REPO / IDX["path"] / "base_scenario.json").read_bytes()).hexdigest() == m[0]["sha256"]
    assert hashlib.sha256((REPO / IDX["path"] / "manifest.json").read_bytes()).hexdigest()[:12] == IDX["version"]
    assert "HYPOTHETICAL" in S["status"] and "not evaluated or approved by NASA" in S["status"]


def test_sites_are_distinct_roles_and_follow_the_rules():
    s = S["sites"]
    assert {v["id"] for v in s.values()} == {"LZ-1", "BASE", "CAMP-A", "CAMP-B"}
    assert 1000 <= S["distances_from_base_m"]["landing_zone"] <= 2500
    assert s["base"]["grid"] == "m0a" and s["base"]["routable"] is True and s["base"]["slope_p95_deg"] < 6
    assert s["camp_b"]["routable"] is False and "PROVISIONAL" in s["camp_b"]["role"]
    assert s["landing_zone"]["inside_roi_a"] is True and "PROVISIONAL" in s["landing_zone"]["evaluation"]


def test_selected_landing_zone_is_the_flattest_candidate_and_limits_are_stated():
    c = {x["id"]: x for x in S["candidates"]}
    assert all(c["LZ-1"]["slope_p95_deg"] <= x["slope_p95_deg"] for x in c.values())
    assert any("radiation" in t for t in S["not_evaluated"]) and any("rock" in t for t in S["not_evaluated"])
