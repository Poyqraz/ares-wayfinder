"""Generate docs/handoff/cr004_display_fixture.json: inputs and the exact display_status outputs (CR-004 reference).
Usage: uv run python probes/s2/make_display_fixture.py"""
import copy, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from poi_evidence import display_status

REPO = Path(__file__).resolve().parents[3]
v2 = json.loads((REPO / "science/s2_release/pois.v2.proposed.json").read_bytes())
legacy = json.loads((REPO / "science/pois.json").read_bytes())
hi = copy.deepcopy(legacy[0]); hi["confidence"] = "high"
bad = copy.deepcopy(v2[2]); bad["evidence"]["target_location"]["precision"] = "PRECISE"
mism = copy.deepcopy(v2[3]); mism["geo"]["lat"] += 1e-4
habitat = copy.deepcopy(v2[0]); habitat["evidence"]["role"]["validated_habitat"] = True
cases = [{"case": f"v2:{p['id']}", "poi": p} for p in v2] + [{"case": f"legacy:{p['id']}", "poi": p} for p in legacy] + [
    {"case": "legacy_confidence_high", "poi": hi}, {"case": "invalid_precision_enum", "poi": bad},
    {"case": "geo_mismatch_6m", "poi": mism}, {"case": "validated_habitat_true", "poi": habitat}]
for c in cases:
    c["expected"] = display_status(c["poi"])
(REPO / "docs/handoff/cr004_display_fixture.json").write_bytes(json.dumps({"generator": "pipeline/poi_evidence.py display_status", "cases": cases}, indent=1, ensure_ascii=False).encode("utf-8"))
print(len(cases), "cases")
