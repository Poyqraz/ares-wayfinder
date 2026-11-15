"""Build the ARES-1 science catalog bundle (M0 / A / B + MEDA sol 516) from committed source bytes.

Deterministic, offline. Joins use exact keys only:
  - PDS Sample Designation across the three Three Forks depot tables, the Initial Reports extract,
    the team M0 table and the Analyst's Notebook drop table;
  - the Initial Report sealing sol for NASA's public sample cards (which carry no designation).
Names, serial numbers, sols and classes are cross-checked after the join; any mismatch stops the build.
Usage: uv run python ares1/ingest/build_catalog.py
Output: ares1/bundle/<version>/ and ares1/bundle/index.json
"""
import csv
import hashlib
import html
import io
import json
import math
import re
import shutil
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from meda_ps import parse_product, qa_report  # noqa: E402

A1 = Path(__file__).resolve().parents[1]
SRC = A1 / "sources"
RETRIEVED = "2026-11-14"
R_MARS = 3396190.0  # sphere radius used by the PDS/USGS Jezero products (m)
SCHEMA = "ares1-science-catalog/1"

PDS_TF = "https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_sample_depot_three_forks/miscellaneous/sample_metadata/"
MEDA_DIR = "https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/sol_0420_0539/sol_0516/"
MEDA_STEM = "WE__0516___________DER_PS__________________P01"


def sha(b):
    return hashlib.sha256(b).hexdigest()


def read(rel):
    return (SRC / rel).read_bytes()


def fold(s):
    """Lower-case, strip diacritics and punctuation: used ONLY for post-join cross-checks, never to join."""
    s = unicodedata.normalize("NFKD", s)
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in s if not unicodedata.combining(c)).lower()).strip()


def surface_distance_m(lat1, lon1, lat2, lon2, r=R_MARS):
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    c = math.sin(p1) * math.sin(p2) + math.cos(p1) * math.cos(p2) * math.cos(dl)
    return r * math.acos(max(-1.0, min(1.0, c)))


# ---------- sources ----------
def source_register(ir_extract):
    local = [
        ("pds_tf_locations_csv", "Three Forks Depot - sample_tube_locations (CSV)", "pds_table", PDS_TF + "sample_tube_locations.csv", "raw/pds_three_forks/sample_tube_locations.csv"),
        ("pds_tf_locations_xml", "Three Forks Depot - sample_tube_locations (PDS4 label)", "pds_label", PDS_TF + "sample_tube_locations.xml", "raw/pds_three_forks/sample_tube_locations.xml"),
        ("pds_tf_identifiers_csv", "Three Forks Depot - sample_tube_identifiers (CSV)", "pds_table", PDS_TF + "sample_tube_identifiers.csv", "raw/pds_three_forks/sample_tube_identifiers.csv"),
        ("pds_tf_identifiers_xml", "Three Forks Depot - sample_tube_identifiers (PDS4 label)", "pds_label", PDS_TF + "sample_tube_identifiers.xml", "raw/pds_three_forks/sample_tube_identifiers.xml"),
        ("pds_tf_targets_csv", "Three Forks Depot - sample_tube_targets (CSV)", "pds_table", PDS_TF + "sample_tube_targets.csv", "raw/pds_three_forks/sample_tube_targets.csv"),
        ("pds_tf_targets_xml", "Three Forks Depot - sample_tube_targets (PDS4 label)", "pds_label", PDS_TF + "sample_tube_targets.xml", "raw/pds_three_forks/sample_tube_targets.xml"),
        ("pds_meda_sol0516_ps_csv", "Mars 2020 MEDA Pressure Sensor Derived Data, sol 516 (CSV)", "pds_table", MEDA_DIR + MEDA_STEM + ".CSV", f"raw/pds_meda/{MEDA_STEM}.CSV"),
        ("pds_meda_sol0516_ps_xml", "Mars 2020 MEDA Pressure Sensor Derived Data, sol 516 (PDS4 label)", "pds_label", MEDA_DIR + MEDA_STEM + ".xml", f"raw/pds_meda/{MEDA_STEM}.xml"),
        ("nasa_mmgis_waypoints", "NASA MMGIS M20 rover waypoints (JSON)", "nasa_json", "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json", "raw/nasa_mmgis/M20_waypoints.json"),
        ("nasa_rock_samples_page", "NASA Mars 2020 Mars Rock Samples page (HTML snapshot)", "nasa_web", "https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/", "raw/nasa_web/mars-rock-samples.html"),
        ("pds_an_three_forks", "PDS Analyst's Notebook - Three Forks Depot help page (HTML snapshot)", "pds_web", "https://an.rsl.wustl.edu/help/Content/About%20the%20mission/M20/Return%20sample%20science/Three%20Forks%20Depot.htm", "raw/nasa_web/an_three_forks.htm"),
        ("team_m0_table", "ARES-1 science team: M0_10_tup_kaydi.csv (research package v1)", "team_research", None, "team/research_v1/M0_10_tup_kaydi.csv"),
        ("team_a_table", "ARES-1 science team: A_iki_kaya_kanitlari.csv", "team_research", None, "team/research_v1/A_iki_kaya_kanitlari.csv"),
        ("team_b_claims", "ARES-1 science team: B_Cheyava_Falls_bulgular.csv", "team_research", None, "team/research_v1/B_Cheyava_Falls_bulgular.csv"),
        ("team_waypoints", "ARES-1 science team: Jezeroda_3_taslak_waypoint.geojson", "team_research", None, "team/research_v1/Jezeroda_3_taslak_waypoint.geojson"),
        ("team_research_readme", "ARES-1 science team: README_ARAStIRMA.md", "team_research", None, "team/research_v1/README_ARAStIRMA.md"),
        ("team_verification_report", "ARES-1 science team: ARES1_M0_MEDA_DOGRULAMA_RAPORU.md", "team_research", None, "team/verification/ARES1_M0_MEDA_DOGRULAMA_RAPORU.md"),
        ("team_developer_handoff", "ARES-1 science team: ARES-1_Gelistirici_Teknik_Devir_Dokumani.md", "team_research", None, "team/developer_handoff/ARES-1_Gelistirici_Teknik_Devir_Dokumani.md"),
        ("ir_extract", "Initial Reports header extract (generated by ares1/ingest/extract_initial_reports.py)", "derived_extract", None, "extracted/initial_reports_extract.json"),
    ]
    out = []
    for sid, title, kind, url, rel in local:
        b = read(rel)
        out.append({"id": sid, "title": title, "kind": kind, "url": url, "local_path": f"ares1/sources/{rel}", "bytes": len(b), "sha256": sha(b), "retrieved": RETRIEVED})
    for vol, v in sorted(ir_extract["volumes"].items(), key=lambda kv: int(kv[0])):
        out.append({"id": f"pds_initial_reports_v{vol}", "title": f"Mars 2020 Sample Dossier - Initial Reports, volume {vol} (PDF; not stored in the repo)",
                    "kind": "pds_pdf", "url": v["url"], "local_path": None, "bytes": v["bytes"], "sha256": v["sha256"], "retrieved": RETRIEVED})
    cited = [
        ("bosak_2024_agu_advances", "Bosak et al. (2024), AGU Advances, doi:10.1029/2024AV001241 (cited by the team; not retrieved here)", "https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2024AV001241"),
        ("hurowitz_2025_nature", "Redox-driven mineral and organic associations in Jezero Crater, Mars. Nature (2025), doi:10.1038/s41586-025-09413-0 (cited by the team; not retrieved here)", "https://www.nature.com/articles/s41586-025-09413-0"),
        ("nasa_2024_cheyava_release", "NASA (2024) Perseverance rover scientists find intriguing Mars rock (cited by the team; not retrieved here)", "https://www.nasa.gov/solar-system/nasas-perseverance-rover-scientists-find-intriguing-mars-rock/"),
        ("nasa_leopard_spots_image", "NASA image resource: Perseverance finds a rock with leopard spots (cited by the team; not retrieved here)", "https://science.nasa.gov/resource/perseverance-finds-a-rock-with-leopard-spots/"),
        ("nasa_skinner_cores_image", "NASA image resource: Rock cores from Skinner Ridge (cited by the team; not retrieved here)", "https://science.nasa.gov/resource/rock-cores-from-skinner-ridge/"),
        ("nasa_wildcat_cores_image", "NASA image resource: Perseverance rock cores from Wildcat Ridge (cited by the team; not retrieved here)", "https://science.nasa.gov/resource/perseverance-rock-cores-from-wildcat-ridge/"),
        ("nasa_two_sampling_locations", "NASA image resource: Two Perseverance sampling locations in Jezero's delta (cited by the team; not retrieved here)", "https://science.nasa.gov/resource/two-perseverance-sampling-locations-in-jezeros-delta/"),
        ("meda_bundle_doi", "Rodriguez-Manfredi & de la Torre Juarez (2021), Mars 2020 MEDA Bundle, doi:10.17189/1522849", "https://doi.org/10.17189/1522849"),
    ]
    for sid, title, url in cited:
        out.append({"id": sid, "title": title, "kind": "cited_not_retrieved", "url": url, "local_path": None, "bytes": None, "sha256": None, "retrieved": None})
    return out


# ---------- parsers for committed sources ----------
def pds_table(stem):
    """CSV parsed against its PDS4 label: header must equal the label field names; record count must match."""
    label = read(f"raw/pds_three_forks/{stem}.xml").decode("utf-8")
    names = [" ".join(m.split()) for m in re.findall(r"<Field_Delimited>.*?<name>(.*?)</name>", label, re.S)]
    records = int(re.search(r"<records>(\d+)</records>", label).group(1))
    rows = list(csv.reader(io.StringIO(read(f"raw/pds_three_forks/{stem}.csv").decode("utf-8"))))
    if rows[0] != names:
        raise SystemExit(f"{stem}: header {rows[0]} != label {names}")
    data = [r for r in rows[1:] if r]
    if len(data) != records:
        raise SystemExit(f"{stem}: {len(data)} rows != label records {records}")
    return [dict(zip(names, r)) for r in data]


def team_csv(rel):
    return list(csv.DictReader(io.StringIO(read(rel).decode("utf-8-sig"))))


def an_drop_table():
    t = read("raw/nasa_web/an_three_forks.htm").decode("utf-8", "replace")
    txt = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", t, flags=re.S))).split())
    out = {}
    for m in re.finditer(r"(M2020-\d{5}-\d{2}) (.+?) Sol (\d+) (\d{2}:\d{2}:\d{2}\.\d{3})", txt):
        out[m.group(1)] = {"name": m.group(2), "sol": int(m.group(3)), "time": m.group(4)}
    return out


def nasa_cards():
    t = read("raw/nasa_web/mars-rock-samples.html").decode("utf-8", "replace")
    txt = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", t, flags=re.S))).split())
    pat = re.compile(r"(?P<display>[^.]{1,60}?) Sample No\. (?P<no>\d+) Feature Name: (?P<feature>.+?) Sample Type: (?P<type>.+?) Sol Sealed: (?P<sol>\d+) "
                     r"Date Sealed: (?P<date>.+?) Rock Type: (?P<rock>.+?) Sample Height: (?P<height>.+?) Current Location: (?P<loc>Sample Depot|Perseverance Rover|[A-Z][a-z]+(?: [A-Z][a-z]+)?)")
    cards = {}
    for m in pat.finditer(txt):
        d = m.groupdict()
        disp = re.sub(r"^.*?(?:NASA/JPL-Caltech(?:/[A-Z]+)*|ASU|MSSS)\s+", "", d["display"]).strip()
        sol = int(d["sol"])
        if sol in cards:
            raise SystemExit(f"two NASA cards share sealing sol {sol}: join key not unique")
        cards[sol] = {"display_name": disp, "nasa_sample_number": int(d["no"]), "feature_name": d["feature"], "sample_type": d["type"],
                      "sol_sealed": sol, "date_sealed": d["date"], "rock_type": d["rock"], "sample_height": d["height"], "current_location": d["loc"]}
    return cards


def mmgis_waypoint(rmc):
    d = json.loads(read("raw/nasa_mmgis/M20_waypoints.json"))
    hits = [f for f in d["features"] if f["properties"]["RMC"] == rmc]
    if len(hits) != 1:
        raise SystemExit(f"RMC {rmc}: {len(hits)} waypoints")
    p = hits[0]["properties"]
    return {"rmc": rmc, "sol": p["sol"], "lat": p["lat"], "lon": p["lon"], "elev_geoid_m": p["elev_geoid"], "note": p["Note"]}


def waypoint_sols():
    d = json.loads(read("raw/nasa_mmgis/M20_waypoints.json"))
    return sorted({f["properties"]["sol"] for f in d["features"]})


# ---------- catalog ----------
CLASS_MAP = {  # team class -> NASA card (type, rock type prefix); witness has no NASA card
    "igneous_rock": ("Rock Core", "Igneous"), "sedimentary_rock": ("Rock Core", "Sedimentary"),
    "regolith": ("Regolith", None), "atmosphere": ("Atmospheric", None), "witness_control": (None, None),
}
EVIDENCE_KIND = {"locality": "identity", "core": "identity", "sedimentology": "interpretation", "organics": "interpretation",
                 "nodule_phosphate": "interpretation", "reaction_front_sulfide": "interpretation", "sulfate_veins": "observation",
                 "potential_biosignature": "hypothesis", "sample_return_need": "rationale"}


def position(lat, lon, elev, semantics, source, locator, elevation_reference="areoid (relative to the datum, per PLACES)", decimals_note=None):
    pos = {"lat_deg": lat, "lon_deg_east": lon, "elev_m": elev, "frame": "planetocentric latitude, east-positive longitude (Mars)",
           "elevation_reference": elevation_reference, "semantics": semantics, "source": source, "locator": locator}
    if decimals_note:
        pos["precision_note"] = decimals_note
    return pos


def build():
    ir = json.loads(read("extracted/initial_reports_extract.json"))
    if ir["missing"]:
        raise SystemExit(f"Initial Reports missing: {ir['missing']}")
    reports = ir["reports"]
    loc = {r["Sample Designation"]: r for r in pds_table("sample_tube_locations")}
    ids = {r["Sample Designation"]: r for r in pds_table("sample_tube_identifiers")}
    tgt = {r["Sample Designation"]: r for r in pds_table("sample_tube_targets")}
    team_m0 = {r["sample_designation"]: r for r in team_csv("team/research_v1/M0_10_tup_kaydi.csv")}
    an = an_drop_table()
    cards = nasa_cards()
    checks = []

    def check(name, ok, detail=""):
        checks.append({"check": name, "pass": bool(ok), "detail": detail})
        if not ok:
            raise SystemExit(f"CHECK FAILED: {name} {detail}")

    m0_keys = set(loc)
    check("M0: exactly 10 distinct designations in sample_tube_locations", len(m0_keys) == 10, str(sorted(m0_keys)))
    for nm, other in (("sample_tube_identifiers", ids), ("sample_tube_targets", tgt), ("team M0 table", team_m0), ("Analyst's Notebook drop table", an)):
        check(f"M0: designation set of {nm} equals sample_tube_locations", set(other) == m0_keys)
    for d in sorted(m0_keys):
        check(f"{d}: Initial Report present (designation key)", d in reports)

    drops, samples = [], {}
    for d in sorted(m0_keys, key=lambda k: int(loc[k]["Dropoff Sol"])):
        L, I, T, M, A, R = loc[d], ids[d], tgt[d], team_m0[d], an[d], reports[d]
        name = L["Sample Name"]
        check(f"{d}: sample name identical in the three PDS depot tables", name == I["Sample Name"] == T["Sample Name"])
        check(f"{d}: dropoff sol PDS == Analyst's Notebook == team", int(L["Dropoff Sol"]) == A["sol"] == int(M["depot_drop_sol"]))
        check(f"{d}: drop timestamp Analyst's Notebook == team", A["time"] == M["depot_drop_lmst"])
        for part, ir_key, pds_key in (("tube", "tube_sn", "Tube Serial Number"), ("seal", "seal_sn", "Seal Serial Number"), ("ferrule", "ferrule_sn", "Seal Ferrule Serial Number")):
            check(f"{d}: {part} serial number Initial Report == depot identifiers", int(R[ir_key][2:]) == int(I[pds_key][2:]), f"{R[ir_key]} vs {I[pds_key]}")
        des_sol = int(d.split("-")[1])
        check(f"{d}: designation sol <= Initial Report sealing sol", des_sol <= R["sealing_sol"], f"{des_sol} vs {R['sealing_sol']}")
        card = cards.get(R["sealing_sol"])
        cls = M["sample_class"]
        if cls == "witness_control":
            check(f"{d}: witness tube has no NASA sample card at its sealing sol", card is None)
        else:
            check(f"{d}: NASA card found by Initial Report sealing sol", card is not None, str(R["sealing_sol"]))
            exp_type, exp_rock = CLASS_MAP[cls]
            check(f"{d}: team class '{cls}' consistent with NASA card type '{card['sample_type']}' / rock '{card['rock_type']}'",
                  card["sample_type"] == exp_type and (exp_rock is None or card["rock_type"].startswith(exp_rock)))
            check(f"{d}: NASA card display name contains the PDS sample name (post-join cross-check)", fold(name) in fold(card["display_name"]), f"{card['display_name']!r} vs {name!r}")
        tube_number = int(d.split("-")[2])
        samples[d] = {
            "id": f"sample:{d}", "kind": "sample", "sample_designation": d, "sample_name": name,
            "alternate_names": sorted({x for x in ([I["Alternate Name"]] if I["Alternate Name"] else []) + ([card["display_name"]] if card and card["display_name"] != name else [])}),
            "designation_sol": des_sol, "designation_tube_number": tube_number,
            "nasa_public_sample_number": card["nasa_sample_number"] if card else None,
            "classification": {"team_class": cls, "nasa_sample_type": card["sample_type"] if card else "witness tube (no NASA sample card)",
                               "nasa_rock_type": card["rock_type"] if card else None, "evidence": {"confidence": "high", "evidence_kind": "identity", "sources": ["team_m0_table", "nasa_rock_samples_page", f"pds_initial_reports_v{R['volume']}"]}},
            "origin": {"team_origin": M["origin_rock_or_location"], "nasa_feature_name": card["feature_name"] if card else None,
                       "initial_report_campaign_raw": R["campaign_raw"], "initial_report_region_of_interest_raw": R["region_of_interest_raw"]},
            "sampling_event": {"designation_sol": des_sol, "date_of_coring_raw": R["date_of_coring_raw"],
                               "rover_position": position(R["printed_lat"], R["printed_lon"], R["printed_elev_m"], "rover position printed in the Initial Report for the sampling activity (not the rock/core point)", f"pds_initial_reports_v{R['volume']}", f"p. {R['page']}") if R["printed_lat"] is not None else None},
            "sealing_event": {"sol": R["sealing_sol"], "lmst": R["sealing_lmst"], "ls_deg": R["sealing_ls_deg"], "date_of_sealing_raw": R["date_of_sealing_raw"],
                              "independently_documented": bool(card and card["sol_sealed"] == R["sealing_sol"]) if cls != "witness_control" else False,
                              "sources": [f"pds_initial_reports_v{R['volume']}"] + (["nasa_rock_samples_page"] if card else []),
                              "note": None if card else "Witness tube: sealing documented only by its Initial Report"},
            "current_location": "Three Forks Depot (surface)",
            "lithology_raw": R["lithology_raw"],
            "initial_report": {"volume": R["volume"], "page": R["page"], "designation_printed": R["designation_printed"]},
        }
        drops.append({
            "id": f"drop:{d}", "kind": "depot_drop_event", "sample": f"sample:{d}", "sample_designation": d,
            "drop_sol": int(L["Dropoff Sol"]), "drop_time": A["time"],
            "drop_time_basis": "sol-local time as published by the Analyst's Notebook ('Sample drop timestamp'); the page does not name the time scale (the team labels it LMST)",
            "rmc": {"site": int(L["Site"]), "drive": int(L["Drive"])},
            "rover_position": position(float(L["Rover Latitude"]), float(L["Rover Longitude"]), float(L["Rover Elevation"]),
                                       "ROVER position during the tube drop (PDS: 'Latitude of the rover during tube drop'); NOT the tube location", "pds_tf_locations_csv", f"row {d}"),
            "tube_azimuth_deg": float(L["Sample Tube Azimuth"]),
            "tube_azimuth_definition": "clockwise from true north to the vector from the seal end to the glove end, nearest degree (PDS label)",
            "drop_zone_id": I["Drop Zone ID"], "tube_id": I["Tube ID"],
            "serial_numbers": {"tube": I["Tube Serial Number"], "seal": I["Seal Serial Number"], "ferrule": I["Seal Ferrule Serial Number"]},
            "targets": {k: T[k] for k in ("Drop Zone - Strategic", "Drop Zone - Tactical", "Drop Zone - End of Drive", "Drop Location - Glove", "Drop Location - Seal", "Imaging Target")},
            "tube_center": {"status": "NOT_AVAILABLE", "lat_deg": None, "lon_deg_east": None, "uncertainty_m": None,
                            "reason": "The PDS depot tables give the rover position and named glove/seal targets, but no tube-center coordinates. "
                                      "Deriving them needs the per-tube Navcam DEM/RZS products, the target coordinates in the local frame and the PLACES transform; not done.",
                            "named_targets": {"glove_end": T["Drop Location - Glove"], "seal_end": T["Drop Location - Seal"]}},
            "evidence": {"confidence": "high", "evidence_kind": "identity", "sources": ["pds_tf_locations_csv", "pds_tf_identifiers_csv", "pds_tf_targets_csv", "pds_an_three_forks", "team_m0_table"]},
        })

    # ---- A: Western Delta (Skinner Ridge, Wildcat Ridge) ----
    team_a = {r["outcrop"]: r for r in team_csv("team/research_v1/A_iki_kaya_kanitlari.csv")}
    check("A: exactly two outcrops in the team table", set(team_a) == {"Skinner Ridge", "Wildcat Ridge"})
    core_designation = {"Swift Run": "M2020-00490-11", "Skyland": "M2020-00495-12", "Hazeltop": "M2020-00509-14", "Bearwallow": "M2020-00516-15"}
    outcrops, a_cores = [], {}
    for oname, row in sorted(team_a.items()):
        oid = "outcrop:" + fold(oname).replace(" ", "_")
        cores = []
        for k in ("core_1", "core_2"):
            cname = row[k]
            d = core_designation[cname]
            R = reports[d]
            check(f"A: {cname} Initial Report printed designation matches", fold(R["designation_printed"]) == fold(f"M2020-{int(d.split('-')[1])}-{int(d.split('-')[2])}"))
            check(f"A: {cname} designation sol equals the team's sample sol", int(d.split("-")[1]) == int(row[k + "_sample_sol"]))
            card = cards.get(R["sealing_sol"])
            check(f"A: {cname} NASA card (by sealing sol) names the outcrop {oname}", card is not None and card["feature_name"] == oname)
            check(f"A: {cname} NASA card display name contains the core name (post-join cross-check)", fold(cname) in fold(card["display_name"]))
            in_depot = d in m0_keys
            check(f"A: {cname} depot membership agrees with the team table ({row[k + '_location']})", in_depot == row[k + "_location"].startswith("Three Forks"))
            cores.append(d)
            if d not in samples:  # cores kept on the rover
                a_cores[d] = {
                    "id": f"sample:{d}", "kind": "sample", "sample_designation": d, "sample_name": cname, "alternate_names": [],
                    "designation_sol": int(d.split("-")[1]), "designation_tube_number": int(d.split("-")[2]), "nasa_public_sample_number": card["nasa_sample_number"],
                    "classification": {"team_class": "sedimentary_rock (A table rock_type: " + row["rock_type"] + ")", "nasa_sample_type": card["sample_type"], "nasa_rock_type": card["rock_type"],
                                       "evidence": {"confidence": "high", "evidence_kind": "identity", "sources": ["team_a_table", "nasa_rock_samples_page", f"pds_initial_reports_v{R['volume']}"]}},
                    "origin": {"team_origin": oname, "nasa_feature_name": card["feature_name"], "initial_report_campaign_raw": R["campaign_raw"], "initial_report_region_of_interest_raw": R["region_of_interest_raw"]},
                    "sampling_event": {"designation_sol": int(d.split("-")[1]), "date_of_coring_raw": R["date_of_coring_raw"],
                                       "rover_position": position(R["printed_lat"], R["printed_lon"], R["printed_elev_m"], "rover position printed in the Initial Report for the sampling activity (not the rock/core point)", f"pds_initial_reports_v{R['volume']}", f"p. {R['page']}")},
                    "sealing_event": {"sol": R["sealing_sol"], "lmst": R["sealing_lmst"], "ls_deg": R["sealing_ls_deg"], "date_of_sealing_raw": R["date_of_sealing_raw"],
                                      "independently_documented": card["sol_sealed"] == R["sealing_sol"], "sources": [f"pds_initial_reports_v{R['volume']}", "nasa_rock_samples_page"], "note": None},
                    "current_location": f"{card['current_location']} (NASA page snapshot {RETRIEVED})",
                    "lithology_raw": R["lithology_raw"],
                    "initial_report": {"volume": R["volume"], "page": R["page"], "designation_printed": R["designation_printed"]},
                }
        pos = [samples.get(d, a_cores.get(d))["sampling_event"]["rover_position"] for d in cores]
        outcrops.append({
            "id": oid, "kind": "outcrop", "name": oname, "mission": "A", "region": "region:western_delta_front",
            "geologic_unit_team": row["geologic_unit"], "abrasion_patch": f"abrasion:{fold(row['abrasion_patch']).replace(' ', '_')}",
            "cores": [f"sample:{d}" for d in cores],
            "rock_type_team": row["rock_type"], "science_reason_team": row["science_reason"],
            "spatial": {"precision": "pds_rover_position_at_sampling", "positions": pos,
                        "note": "Rover positions printed in the Initial Reports for the two cores; the outcrop's extent and the exact core points are not defined here."},
            "evidence": {"rock_type": {"confidence": row["rock_type_confidence"], "evidence_kind": "observation"},
                         "scientific_interpretation": {"confidence": row["scientific_interpretation_confidence"], "evidence_kind": "interpretation"},
                         "core_ids": {"confidence": row["core_id_confidence"], "evidence_kind": "identity"},
                         "sources": ["team_a_table", row["source_nasa"] and ("nasa_skinner_cores_image" if oname == "Skinner Ridge" else "nasa_wildcat_cores_image"), "bosak_2024_agu_advances", "nasa_rock_samples_page"]},
        })
    sk = next(o for o in outcrops if o["name"] == "Skinner Ridge")["spatial"]["positions"][0]
    wc = next(o for o in outcrops if o["name"] == "Wildcat Ridge")["spatial"]["positions"][0]
    sep_m = surface_distance_m(sk["lat_deg"], sk["lon_deg_east"], wc["lat_deg"], wc["lon_deg_east"])
    check("A: Skinner and Wildcat sampling positions are distinct (> 5 m)", sep_m > 5, f"{sep_m:.1f} m")

    # ---- B: Bright Angel / Cheyava Falls / Sapphire Canyon ----
    sc_d = "M2020-01215-28"
    R = reports[sc_d]
    card = cards.get(R["sealing_sol"])
    check("B: Sapphire Canyon NASA card found by Initial Report sealing sol 1215", card is not None and card["feature_name"] == "Cheyava Falls" and fold("Sapphire Canyon") in fold(card["display_name"]))
    check("B: Sapphire Canyon is not one of the ten M0 depot tubes", sc_d not in m0_keys)
    b_claims = team_csv("team/research_v1/B_Cheyava_Falls_bulgular.csv")
    check("B: nine documented claims", len(b_claims) == 9 and [c["claim_id"] for c in b_claims] == [f"B-{i:02d}" for i in range(1, 10)])
    sapphire = {
        "id": f"sample:{sc_d}", "kind": "sample", "sample_designation": sc_d, "sample_name": "Sapphire Canyon", "alternate_names": [],
        "designation_sol": 1215, "designation_tube_number": 28, "nasa_public_sample_number": card["nasa_sample_number"],
        "numbering_note": "NASA's public 'Sample No. 25' differs from the designation tube number 28 because NASA's public list does not count witness tubes; both are recorded.",
        "classification": {"team_class": "sedimentary_rock (core)", "nasa_sample_type": card["sample_type"], "nasa_rock_type": card["rock_type"],
                           "evidence": {"confidence": "high", "evidence_kind": "identity", "sources": ["team_b_claims", "nasa_rock_samples_page", "pds_initial_reports_v4"]}},
        "origin": {"team_origin": "Cheyava Falls", "nasa_feature_name": card["feature_name"], "initial_report_campaign_raw": R["campaign_raw"], "initial_report_region_of_interest_raw": R["region_of_interest_raw"]},
        "sampling_event": {"designation_sol": 1215, "date_of_coring_raw": R["date_of_coring_raw"],
                           "rover_position": position(R["printed_lat"], R["printed_lon"], R["printed_elev_m"], "rover position printed in the Initial Report for the sampling activity (not the rock/core point)", "pds_initial_reports_v4", f"p. {R['page']}")},
        "sealing_event": {"sol": R["sealing_sol"], "lmst": R["sealing_lmst"], "ls_deg": R["sealing_ls_deg"], "date_of_sealing_raw": R["date_of_sealing_raw"],
                          "independently_documented": card["sol_sealed"] == R["sealing_sol"], "sources": ["pds_initial_reports_v4", "nasa_rock_samples_page"], "note": None},
        "current_location": f"{card['current_location']} (NASA page snapshot {RETRIEVED})",
        "lithology_raw": R["lithology_raw"],
        "initial_report": {"volume": R["volume"], "page": R["page"], "designation_printed": R["designation_printed"]},
    }
    claims = []
    for c in b_claims:
        kind = EVIDENCE_KIND[c["category"]]
        src = {"https://www.nature.com/articles/s41586-025-09413-0": "hurowitz_2025_nature",
               "https://www.nasa.gov/solar-system/nasas-perseverance-rover-scientists-find-intriguing-mars-rock/": "nasa_2024_cheyava_release",
               "https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/": "nasa_rock_samples_page",
               "https://science.nasa.gov/resource/perseverance-finds-a-rock-with-leopard-spots/": "nasa_leopard_spots_image"}[c["primary_source_url"]]
        claims.append({"id": f"claim:{c['claim_id']}", "kind": "science_claim", "mission": "B", "subject": "rock:cheyava_falls" if c["category"] not in ("core",) else f"sample:{sc_d}",
                       "category": c["category"], "claim": c["claim"], "confidence": c["confidence"], "evidence_kind": kind,
                       "limitation": c["limitation"], "primary_source": src, "primary_source_url": c["primary_source_url"],
                       "team_source": "team_b_claims"})
    check("B: the biosignature claim is a low-confidence hypothesis", any(c["evidence_kind"] == "hypothesis" and c["confidence"] == "low" for c in claims))
    b_flags = {"life_detected": False, "biological_origin_confirmed": False, "possible_biosignature_hypothesis": True,
               "label": "possible biosignature (hypothesis; abiotic pathways not excluded)"}

    # ---- reference waypoints (team pins, verified against MMGIS) ----
    team_wp = json.loads(read("team/research_v1/Jezeroda_3_taslak_waypoint.geojson"))
    waypoints = []
    for mission, rmc in (("M0", "32_774"), ("A", "26_1154"), ("B", "56_0")):
        w = mmgis_waypoint(rmc)
        tf = next(f for f in team_wp["features"] if f["properties"]["rover_RMC"] == rmc)
        check(f"waypoint {mission}: team pin equals NASA MMGIS RMC {rmc}", tf["geometry"]["coordinates"] == [w["lon"], w["lat"]] and tf["properties"]["rover_sol"] == w["sol"])
        waypoints.append({"id": f"waypoint:{mission}", "kind": "reference_waypoint", "mission": mission,
                          "position": position(w["lat"], w["lon"], w["elev_geoid_m"], f"NASA rover {w['note']} (sol {w['sol']}, RMC {rmc}); regional reference only, not a sample or tube point",
                                               "nasa_mmgis_waypoints", f"RMC {rmc}", elevation_reference="elev_geoid as published by MMGIS"),
                          "team_label": tf["properties"]["name"], "coordinate_status": "approximate_rover_waypoint"})
    bw = loc["M2020-00516-15"]
    m0w = next(w for w in waypoints if w["mission"] == "M0")["position"]
    check("waypoint M0 equals the Bearwallow drop rover position (same RMC 32_774)", (float(bw["Rover Latitude"]), float(bw["Rover Longitude"])) == (m0w["lat_deg"], m0w["lon_deg_east"]))
    wp = {w["mission"]: w["position"] for w in waypoints}
    distances = {f"{a}-{b}": round(surface_distance_m(wp[a]["lat_deg"], wp[a]["lon_deg_east"], wp[b]["lat_deg"], wp[b]["lon_deg_east"]), 1) for a, b in (("M0", "A"), ("M0", "B"), ("A", "B"))}

    # ---- MEDA sol 516 ----
    csv_b, xml_b = read(f"raw/pds_meda/{MEDA_STEM}.CSV"), read(f"raw/pds_meda/{MEDA_STEM}.xml")
    label, rows, anomalies = parse_product(csv_b, xml_b)
    qa = qa_report(label, rows, anomalies, csv_b, xml_b, {"csv": MEDA_DIR + MEDA_STEM + ".CSV", "xml": MEDA_DIR + MEDA_STEM + ".xml"})
    check("MEDA: every declared record parsed and kept", qa["records_parsed"] == qa["records_declared"] == len(rows))
    sols = waypoint_sols()
    before = max(s for s in sols if s <= 516)
    after = min(s for s in sols if s > 516)
    w_before = [f for f in json.loads(read("raw/nasa_mmgis/M20_waypoints.json"))["features"] if f["properties"]["sol"] == before][-1]["properties"]
    bw_pos = samples["M2020-00516-15"]["sampling_event"]["rover_position"]
    qa["rover_location_context"] = {
        "last_logged_end_of_drive_before_sol_516": {"sol": before, "rmc": w_before["RMC"], "lat_deg": w_before["lat"], "lon_deg_east": w_before["lon"]},
        "next_logged_drive_sol": after,
        "bearwallow_sampling_rover_position": {"lat_deg": bw_pos["lat_deg"], "lon_deg_east": bw_pos["lon_deg_east"], "source": bw_pos["source"], "locator": bw_pos["locator"]},
        "separation_m": round(surface_distance_m(w_before["lat"], w_before["lon"], bw_pos["lat_deg"], bw_pos["lon_deg_east"]), 1),
        "statement": "No MMGIS drive waypoint is logged between these sols, so the sol 516 series is attributed to the rover parked at the Wildcat Ridge workspace.",
        "confidence": "medium", "evidence_kind": "interpretation (absence of logged drives)",
    }
    series = {"id": "series:meda_sol0516_ps", "kind": "measurement_series", "mission": "A", "instrument": "Mars 2020 MEDA Pressure Sensor (PS)",
              "product_lid": label["metadata"]["logical_identifier"], "processing_level": label["metadata"]["processing_level"],
              "sol": 516, "start_utc": label["metadata"]["start_date_time_utc"], "stop_utc": label["metadata"]["stop_date_time_utc"],
              "ls_deg": [float(label["metadata"]["start_solar_longitude"]), float(label["metadata"]["stop_solar_longitude"])],
              "data_kind": "observed_historical", "rows_file": "meda_sol0516_der_ps_rows.csv", "qa_file": "meda_sol0516_der_ps_qa.json",
              "status_counts": qa["status_counts"], "pressure_pa_valid": qa["pressure_pa_valid"], "linked_samples": ["sample:M2020-00516-15"],
              "not_to_be_presented_as": ["spatial weather map", "forecast", "future EVA condition", "validated EVA risk"],
              "sources": ["pds_meda_sol0516_ps_csv", "pds_meda_sol0516_ps_xml", "meda_bundle_doi"]}

    regions = [
        {"id": "region:three_forks_depot", "kind": "region", "name": "Three Forks Sample Depot", "mission": "M0",
         "spatial": {"precision": "pds_rover_positions_at_drops", "rover_drop_positions_bbox": {
             "lat_min": min(float(r["Rover Latitude"]) for r in loc.values()), "lat_max": max(float(r["Rover Latitude"]) for r in loc.values()),
             "lon_min": min(float(r["Rover Longitude"]) for r in loc.values()), "lon_max": max(float(r["Rover Longitude"]) for r in loc.values())},
             "note": "Bounding box of the ten ROVER drop positions; the tubes lie near but not at these points."},
         "evidence": {"confidence": "high", "evidence_kind": "identity", "sources": ["pds_tf_locations_csv", "pds_an_three_forks"]}},
        {"id": "region:western_delta_front", "kind": "region", "name": "Western delta front (Hawksbill Gap context)", "mission": "A",
         "spatial": {"precision": "approximate_rover_waypoint", "reference": "waypoint:A"},
         "evidence": {"confidence": "high", "evidence_kind": "identity", "sources": ["team_a_table", "nasa_two_sampling_locations"]}},
        {"id": "region:bright_angel", "kind": "region", "name": "Bright Angel (Neretva Vallis)", "mission": "B",
         "spatial": {"precision": "approximate_rover_waypoint", "reference": "waypoint:B"},
         "evidence": {"confidence": "high", "evidence_kind": "identity", "sources": ["team_b_claims", "nasa_2024_cheyava_release"]}},
    ]
    rocks = [{"id": "rock:cheyava_falls", "kind": "rock", "name": "Cheyava Falls", "mission": "B", "region": "region:bright_angel",
              "is_not": "a waterfall or a sample", "cores": [f"sample:{sc_d}"],
              "spatial": {"precision": "pds_rover_position_at_sampling", "positions": [sapphire["sampling_event"]["rover_position"]]},
              "evidence": {"confidence": "high", "evidence_kind": "identity", "sources": ["team_b_claims", "nasa_rock_samples_page", "pds_initial_reports_v4"]}}]
    abrasions = [{"id": o["abrasion_patch"], "kind": "abrasion_patch", "name": team_a[o["name"]]["abrasion_patch"], "outcrop": o["id"],
                  "evidence": {"confidence": "high", "evidence_kind": "identity", "sources": ["team_a_table"]}} for o in outcrops]
    relations = (
        [{"from": f"sample:{d}", "rel": "dropped_at", "to": "region:three_forks_depot", "via": f"drop:{d}"} for d in sorted(m0_keys)]
        + [{"from": c, "rel": "cored_from", "to": o["id"]} for o in outcrops for c in o["cores"]]
        + [{"from": o["id"], "rel": "located_in", "to": o["region"]} for o in outcrops]
        + [{"from": f"sample:{sc_d}", "rel": "cored_from", "to": "rock:cheyava_falls"}, {"from": "rock:cheyava_falls", "rel": "located_in", "to": "region:bright_angel"},
           {"from": "series:meda_sol0516_ps", "rel": "same_sol_as_sealing_of", "to": "sample:M2020-00516-15"}]
    )
    all_samples = [samples[d] for d in sorted(samples)] + [a_cores[d] for d in sorted(a_cores)] + [sapphire]
    catalog = {
        "schema": SCHEMA,
        "status": "development catalog; not integrated in the live application",
        "conventions": {"coordinates": "planetocentric latitude, east-positive longitude, decimal degrees (Mars); never WGS84",
                        "sphere_radius_m_for_distances": R_MARS, "null_means": "unknown (never zero)",
                        "confidence": {"high": "directly stated in a primary NASA/PDS record", "medium": "evidence-based interpretation or inference",
                                       "low": "hypothesis; alternatives remain", "pending": "source identified, value not yet obtained"},
                        "evidence_kind": ["identity", "observation", "measurement", "interpretation", "hypothesis", "rationale"],
                        "spatial_precision": ["pds_rover_position_at_event (rover pose; the target lies near, not at, it)", "approximate_rover_waypoint (MMGIS end-of-drive; regional reference)", "not_available"]},
        "missions": [
            {"id": "M0", "name": "Three Forks Sample Depot (hypothetical tube recovery)", "region": "region:three_forks_depot", "drop_events": [x["id"] for x in drops], "reference_waypoint": "waypoint:M0"},
            {"id": "A", "name": "Western delta front: Skinner Ridge and Wildcat Ridge", "region": "region:western_delta_front", "outcrops": [o["id"] for o in outcrops], "reference_waypoint": "waypoint:A", "measurement_series": ["series:meda_sol0516_ps"]},
            {"id": "B", "name": "Bright Angel: Cheyava Falls rock and Sapphire Canyon core", "region": "region:bright_angel", "rocks": ["rock:cheyava_falls"], "claims": [c["id"] for c in claims], "reference_waypoint": "waypoint:B", "flags": b_flags},
        ],
        "regions": regions, "outcrops": outcrops, "rocks": rocks, "abrasion_patches": abrasions, "samples": all_samples, "depot_drop_events": drops,
        "reference_waypoints": waypoints, "reference_distances_m": distances | {"skinner_ridge-wildcat_ridge_sampling_positions": round(sep_m, 1)},
        "claims": claims, "measurement_series": [series], "relations": relations,
        "consistency_checks": checks,
        "unknowns": [
            "Tube-center coordinates of all ten Three Forks tubes (not in the PDS depot tables).",
            "Exact rock/core points for Skinner Ridge, Wildcat Ridge and Cheyava Falls (only rover positions at sampling).",
            "Time scale of the Analyst's Notebook drop timestamps (not stated; team labels it LMST).",
            "Per-record UTC of the MEDA sol 516 series (only SCLK/LMST/LTST); pressure uncertainty (not provided).",
            "Vertical datum consistency between PLACES elevations, MMGIS elev_geoid and the CTX/HiRISE DEMs.",
        ],
        "excluded_claims": [
            "Life detected / biological origin confirmed (not supported; B-08 is a low-confidence hypothesis).",
            "Any tube-center coordinate derived from rover drop positions.",
            "Spatial weather fields, forecasts or EVA risk values derived from MEDA.",
            "A NASA-approved sample-return schedule (B-09 is a scientific rationale only).",
        ],
    }
    return catalog, label, rows, qa


def write_bundle(catalog, label, rows, qa):
    files = {"catalog.json": json.dumps(catalog, indent=1, ensure_ascii=False).encode("utf-8"),
             "meda_sol0516_der_ps_qa.json": json.dumps(qa, indent=1, ensure_ascii=False).encode("utf-8")}
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    names = [f["name"] for f in label["fields"]]
    w.writerow(["record_index"] + [n.lower().replace(" ", "_") + "_as_published" for n in names] + ["status", "flags", "data_kind"])
    for r in rows:
        parts = r["raw"].split(",") if r["status"] != "invalid" or len(r["raw"].split(",")) == len(names) else [r["raw"]] + [""] * (len(names) - 1)
        w.writerow([r["record_index"]] + parts + [r["status"], ";".join(r["flags"]), "observed_historical"])
    files["meda_sol0516_der_ps_rows.csv"] = buf.getvalue().encode("utf-8")
    manifest = {"schema": "ares1-catalog-bundle/1", "catalog_schema": SCHEMA,
                "files": [{"file": f, "bytes": len(b), "sha256": sha(b)} for f, b in sorted(files.items())],
                "source_register": source_register(json.loads(read("extracted/initial_reports_extract.json")))}
    mb = json.dumps(manifest, indent=1, ensure_ascii=False).encode("utf-8")
    version = sha(mb)[:12]
    out = A1 / "bundle" / version
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    for f, b in files.items():
        (out / f).write_bytes(b)
    (out / "manifest.json").write_bytes(mb)
    for f in manifest["files"]:
        assert sha((out / f["file"]).read_bytes()) == f["sha256"]
    (A1 / "bundle" / "index.json").write_bytes(json.dumps({"catalog": {"version": version, "path": f"ares1/bundle/{version}/", "manifest_sha256": sha(mb), "role": "development_only"}}, indent=1).encode("utf-8"))
    return version, manifest


if __name__ == "__main__":
    cat, lab, rws, q = build()
    v, man = write_bundle(cat, lab, rws, q)
    print(json.dumps({"version": v, "files": man["files"], "checks_passed": sum(c["pass"] for c in cat["consistency_checks"]),
                      "samples": len(cat["samples"]), "drops": len(cat["depot_drop_events"]), "claims": len(cat["claims"]),
                      "distances_m": cat["reference_distances_m"], "meda": q["status_counts"], "meda_pressure": q["pressure_pa_valid"],
                      "meda_anomalies": q["label_anomalies"], "sessions": len(q["sessions"])}, indent=1, ensure_ascii=False))
