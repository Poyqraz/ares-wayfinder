"""Which area the m0a_* scripts work on.

ARES_AREA=m0a (default): the frozen M0-A box and bundle f8de9017164a. Behaviour and outputs unchanged.
ARES_AREA=m0ab: a wider box that also holds the Amalik sampling position (mission B). It keeps the M0-A box's north
and east edges and its 2 m cell lattice, so every cell of the frozen grid is the same cell in the wider one.
Nothing here is a measurement: the box and the endpoints come from committed ARES-1 files.
"""
import json
import math
import os
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
AREA = os.environ.get("ARES_AREA", "m0a")
assert AREA in ("m0a", "m0ab"), AREA
WIDE = AREA == "m0ab"
ANALYSIS = REPO / "analysis" / AREA
B_MARGIN_M = 150.0  # ground kept west and south of the Amalik position, so a route has room to approach it
R_MARS = 3396190.0
# (start key, goal key, name, reverse name); the sensitivity study runs on PRIMARY
ROUTES = [("start_M0", "goal_A", "M0->A", "A->M0")] + ([("start_M0", "goal_B", "M0->B", "B->M0"), ("goal_A", "goal_B", "A->B", "B->A")] if WIDE else [])
PRIMARY = ROUTES[1] if WIDE else ROUTES[0]


def catalog():
    idx = json.loads((REPO / "ares1" / "bundle" / "index.json").read_bytes())["catalog"]
    return idx["version"], json.loads((REPO / idx["path"] / "catalog.json").read_bytes())


def amalik(cat):
    """Rover position during the Mageik sampling activity at Amalik (catalog record; the Shuyak sheet's is 0.3 m away)."""
    return next(s for s in cat["samples"] if s["sample_designation"] == "M2020-00579-17")["sampling_event"]["rover_position"]


def box():
    b = dict(json.loads((REPO / "ares1" / "docs" / "dem_coverage.json").read_bytes())["areas"]["m0_to_a"])
    if WIDE:
        p = amalik(catalog()[1])
        b["lon_min"] = min(b["lon_min"], p["lon_deg_east"] - math.degrees(B_MARGIN_M / (R_MARS * math.cos(math.radians(p["lat_deg"])))))
        b["lat_min"] = min(b["lat_min"], p["lat_deg"] - math.degrees(B_MARGIN_M / R_MARS))
    return b


def frozen_m0a():
    """Folder and terrain.json of the frozen M0-A bundle: the lattice and ground spacing the wider grid must share."""
    idx = json.loads((REPO / "analysis" / "m0a" / "bundle" / "index.json").read_bytes())["m0a"]
    return REPO / idx["path"], json.loads((REPO / idx["path"] / "terrain.json").read_bytes())
