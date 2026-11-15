"""CR-004 reference: validate the optional POI `evidence` record and derive display statuses.

The frontend must reproduce `display_status` exactly (see docs/decisions/CR-004-poi-evidence.md).
Rules: statuses come only from `evidence`; `confidence` never implies VERIFIED; a POI without a valid
evidence record renders with the legacy (all-unverified) statuses.
"""
SCHEMA = "ares-poi-evidence/1"
COORD_STATUS = {"VERIFIED", "UNVERIFIED"}
COORD_KIND = {"pds_rover_position", "pds_landing_site", "publication", "other"}
PRECISION = {"EXACT", "APPROXIMATE", "UNKNOWN"}
REG_STATUS = {"VERIFIED", "UNRESOLVED"}
DATUM_STATUS = {"VERIFIED", "UNVERIFIED"}
ROLE_KIND = {"historical_landing_reference", "sampling_site", "other"}
GEO_TOL_DEG = 1e-9


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v == v and abs(v) != float("inf")


def validate_evidence(poi):
    """Return a list of problems with poi['evidence'] (empty list = valid). Absent evidence is not an error."""
    ev = poi.get("evidence")
    if ev is None:
        return []
    p = []
    if not isinstance(ev, dict):
        return ["evidence is not an object"]
    if ev.get("schema") != SCHEMA:
        p.append(f"schema must be {SCHEMA!r}")
    cs = ev.get("coordinate_source")
    if not isinstance(cs, dict):
        p.append("coordinate_source missing")
    else:
        if cs.get("status") not in COORD_STATUS:
            p.append("coordinate_source.status")
        if cs.get("kind") not in COORD_KIND:
            p.append("coordinate_source.kind")
        for f in ("product", "locator", "url"):
            if not isinstance(cs.get(f), str) or not cs[f]:
                p.append(f"coordinate_source.{f}")
        pr = cs.get("printed")
        if not isinstance(pr, dict) or not _num(pr.get("lat")) or not _num(pr.get("lon")) or not (pr.get("elev_m") is None or _num(pr.get("elev_m"))):
            p.append("coordinate_source.printed")
        conv = cs.get("convention")
        if not isinstance(conv, dict) or conv.get("latitude") != "planetocentric" or conv.get("longitude") != "east_positive" or conv.get("elevation_reference") not in ("areoid", "unknown"):
            p.append("coordinate_source.convention")
        xs = cs.get("cross_checks")
        if not isinstance(xs, list) or any(not isinstance(x, dict) or not isinstance(x.get("source"), str) or not _num(x.get("delta_m")) for x in xs):
            p.append("coordinate_source.cross_checks")
    tl = ev.get("target_location")
    if not isinstance(tl, dict) or tl.get("precision") not in PRECISION or not isinstance(tl.get("basis"), str):
        p.append("target_location")
    reg = ev.get("ctx_registration")
    if not isinstance(reg, dict) or reg.get("status") not in REG_STATUS or not isinstance(reg.get("ref"), str):
        p.append("ctx_registration")
    vd = ev.get("vertical_datum")
    if not isinstance(vd, dict) or vd.get("status") not in DATUM_STATUS:
        p.append("vertical_datum")
    role = ev.get("role")
    if not isinstance(role, dict) or role.get("kind") not in ROLE_KIND or role.get("validated_habitat") is not False or not isinstance(role.get("text"), str):
        p.append("role (validated_habitat must be false)")
    return p


def bundle_problems(raw: bytes):
    """Release gate used by t04: problems that must stop a bundle build (empty list = OK to bundle)."""
    import json
    if b"\r" in raw:
        return ["pois.json contains CR bytes (line endings must stay LF)"]
    try:
        pois = json.loads(raw)
    except ValueError as e:
        return [f"pois.json is not valid JSON: {e}"]
    if not isinstance(pois, list):
        return ["pois.json is not a list"]
    out, ids = [], set()
    for i, p in enumerate(pois):
        pid = p.get("id") if isinstance(p, dict) else None
        tag = f"POI {pid or i}"
        if not isinstance(p, dict) or not all(isinstance(p.get(k), str) and p[k] for k in ("id", "name", "claim", "source")):
            out.append(f"{tag}: missing v1.0.0 field (id, name, claim, source)")
            continue
        if pid in ids:
            out.append(f"{tag}: duplicate id")
        ids.add(pid)
        if p.get("confidence") not in ("high", "medium", "low") or not isinstance(p.get("geo"), dict) or not _num(p["geo"].get("lat")) or not _num(p["geo"].get("lon")):
            out.append(f"{tag}: bad confidence or geo")
            continue
        out += [f"{tag}: evidence {x}" for x in validate_evidence(p)]
        ev = p.get("evidence")
        if isinstance(ev, dict) and not validate_evidence(p):
            pr = ev["coordinate_source"]["printed"]
            if abs(p["geo"]["lat"] - pr["lat"]) > GEO_TOL_DEG or abs(p["geo"]["lon"] - pr["lon"]) > GEO_TOL_DEG:
                out.append(f"{tag}: geo differs from evidence.coordinate_source.printed")
    return out


LEGACY = {
    "coordinate": "UNVERIFIED",
    "coordinate_label": "Coordinates UNVERIFIED (no evidence record)",
    "target_precision": "UNKNOWN",
    "target_label": "Target location: precision unknown",
    "registration_label": "CTX DEM/image registration UNRESOLVED (S-4)",
    "datum_label": "Vertical datum UNVERIFIED",
    "role_label": None,
    "elevation_label": None,
}


def display_status(poi):
    """Statuses and exact UI labels for one POI. Never derived from `confidence`."""
    ev = poi.get("evidence")
    problems = validate_evidence(poi)
    if ev is None or problems:
        out = dict(LEGACY)
        out["notice"] = None if ev is None else "POI evidence record invalid; showing legacy statuses"
        return out
    cs, tl = ev["coordinate_source"], ev["target_location"]
    geo = poi.get("geo", {})
    matches = _num(geo.get("lat")) and _num(geo.get("lon")) and abs(geo["lat"] - cs["printed"]["lat"]) <= GEO_TOL_DEG and abs(geo["lon"] - cs["printed"]["lon"]) <= GEO_TOL_DEG
    out: dict = {"notice": None}
    if cs["status"] == "VERIFIED" and matches:
        what = {"pds_rover_position": "PDS rover position", "pds_landing_site": "PDS landing-site position"}.get(cs["kind"], "Source position")
        out["coordinate"], out["coordinate_label"] = "VERIFIED", f"Coordinates: {what} VERIFIED"
    else:
        out["coordinate"], out["coordinate_label"] = "UNVERIFIED", "Coordinates UNVERIFIED"
        if cs["status"] == "VERIFIED":
            out["notice"] = "geo does not match the cited source coordinates; showing UNVERIFIED"
    out["target_precision"] = tl["precision"]
    out["target_label"] = {"EXACT": "Target location: exact as defined", "APPROXIMATE": "Target location: APPROXIMATE (rover position during the activity, not the rock itself)", "UNKNOWN": "Target location: precision unknown"}[tl["precision"]]
    out["registration_label"] = "CTX DEM/image registration UNRESOLVED (S-4)" if ev["ctx_registration"]["status"] == "UNRESOLVED" else "CTX DEM/image registration verified"
    out["datum_label"] = "Vertical datum UNVERIFIED" if ev["vertical_datum"]["status"] == "UNVERIFIED" else "Vertical datum verified"
    out["role_label"] = ev["role"]["text"]
    elev = cs["printed"]["elev_m"]
    if elev is None:
        out["elevation_label"] = None
    else:  # the source's own elevation: shown as provenance only, never next to or instead of DEM heights
        who = {"pds_rover_position": "PDS rover", "pds_landing_site": "PDS landing-site"}.get(cs["kind"], "Source")
        ref = "areoid" if cs["convention"]["elevation_reference"] == "areoid" else "reference unknown"
        out["elevation_label"] = f"{who} elevation {elev:.3f} m ({ref}, as printed in the source; not used for routing)"
    return out
