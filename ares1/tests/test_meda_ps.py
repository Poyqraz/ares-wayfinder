"""MEDA derived-pressure parser: label-driven, never drops rows, separates valid/flagged/missing/invalid."""
from pathlib import Path

import pytest

from meda_ps import parse_label, parse_product, qa_report

RAW = Path(__file__).resolve().parents[1] / "sources" / "raw" / "pds_meda"
STEM = "WE__0516___________DER_PS__________________P01"
HEADER = b"SCLK,LMST,LTST,PRESSURE,PRESSURE_UNCERTAINTY,TRANSDUCER\r\n"


def label(records, unit_p="pascal", unit_u="kelvin", header_len=len(HEADER)):
    fields = [("SCLK", "ASCII_Real", "second"), ("LMST", "ASCII_String", None), ("LTST", "ASCII_String", None),
              ("PRESSURE", "ASCII_Real", unit_p), ("PRESSURE UNCERTAINTY", "ASCII_Real", unit_u), ("TRANSDUCER", "ASCII_Integer", None)]
    fx = ""
    for i, (n, t, u) in enumerate(fields, 1):
        unit = f"<unit>{u}</unit>" if u else ""
        fx += f"<Field_Delimited><name>{n}</name><field_number>{i}</field_number><data_type>{t}</data_type>{unit}<description>x</description></Field_Delimited>"
    xml = (
        '<Product_Observational xmlns="http://pds.nasa.gov/pds4/pds/v1">'
        "<Identification_Area><logical_identifier>urn:test</logical_identifier><version_id>1.0</version_id><title>t</title></Identification_Area>"
        "<File_Area_Observational><File><file_name>t.CSV</file_name></File>"
        f'<Header><offset unit="byte">0</offset><object_length unit="byte">{header_len}</object_length></Header>'
        f'<Table_Delimited><offset unit="byte">{header_len}</offset><records>{records}</records>'
        "<record_delimiter>Carriage-Return Line-Feed</record_delimiter><field_delimiter>Comma</field_delimiter>"
        f"<Record_Delimited>{fx}</Record_Delimited></Table_Delimited></File_Area_Observational></Product_Observational>"
    )
    return xml.encode()


def product(lines, **kw):
    body = b"".join(line.encode() + b"\r\n" for line in lines)
    return HEADER + body, label(len(lines), **kw)


def test_every_row_is_kept_and_classified():
    csv_b, xml_b = product([
        "1,00001M00:00:01,0001 00:00:01,790.0,,1",    # valid
        "2,00001M00:00:02,0001 00:00:02,,,1",         # missing pressure
        "3,00001M00:00:03,0001 00:00:03,abc,,1",      # invalid (non-numeric)
        "4,00001M00:00:04,0001 00:00:04,2000.0,,1",   # outside the plausibility screen -> flagged, kept
        "5,00001M00:00:05,0001 00:00:05,790.5,,3",    # unknown transducer -> flagged
        "5,00001M00:00:05,0001 00:00:05,790.6,,1",    # SCLK not increasing -> flagged
        "7,00001M00:00:07,0001 00:00:07,790.7,1",     # wrong width -> invalid
    ])
    lab, rows, anomalies = parse_product(csv_b, xml_b)
    assert [r["status"] for r in rows] == ["valid", "missing", "invalid", "flagged", "flagged", "flagged", "invalid"]
    assert rows[3]["flags"] == ["outside_plausibility_screen"] and rows[3]["values"]["PRESSURE"] == 2000.0
    assert rows[4]["flags"] == ["transducer_not_1_or_2"]
    assert rows[5]["flags"] == ["sclk_not_increasing"]
    assert any("kelvin" in a for a in anomalies)
    qa = qa_report(lab, rows, anomalies, csv_b, xml_b, {})
    assert qa["records_parsed"] == 7 and sum(qa["status_counts"].values()) == 7
    assert qa["pressure_pa_valid"]["n"] == 1


def test_structure_errors_fail_closed():
    csv_b, xml_b = product(["1,a,b,790.0,,1"])
    with pytest.raises(ValueError, match="records"):
        parse_product(csv_b + b"2,a,b,791.0,,1\r\n", xml_b)
    with pytest.raises(ValueError, match="PRESSURE unit"):
        parse_product(csv_b, label(1, unit_p="hectopascal"))
    bad_header = b"SCLK,LMST,LTST,PRESS,PRESSURE_UNCERTAINTY,TRANSDUCER\r\n"
    with pytest.raises(ValueError, match="header"):
        parse_product(bad_header + b"1,a,b,790.0,,1\r\n", label(1, header_len=len(bad_header)))


def test_real_sol_516_product():
    csv_b, xml_b = (RAW / f"{STEM}.CSV").read_bytes(), (RAW / f"{STEM}.xml").read_bytes()
    lab, rows, anomalies = parse_product(csv_b, xml_b)
    assert lab["metadata"]["start_date_time_utc"] == "2022-08-02T08:51:27.903Z"
    assert [f["unit"] for f in lab["fields"]][3] == "pascal"
    assert len(rows) == 7440 == lab["table"]["records"]
    qa = qa_report(lab, rows, anomalies, csv_b, xml_b, {})
    assert qa["source_sha256"]["csv"] == "4d50e6a15508814d7815d532bae9b5791cb2de66d1ad01d135fed2d086a01643"
    assert qa["status_counts"] == {"valid": 7440, "flagged": 0, "missing": 0, "invalid": 0}
    assert qa["uncertainty_provided_rows"] == 0  # PRESSURE_UNCERTAINTY is empty in every row
    assert (qa["pressure_pa_valid"]["min"], qa["pressure_pa_valid"]["max"]) == (769.75, 803.51)
    assert len(qa["sessions"]) == 24 and sum(s["n"] for s in qa["sessions"]) == 7440
    assert any("spatial field" in x for x in qa["limitations"]) and any("forecast" in x for x in qa["limitations"])


def test_label_parser_reads_units_and_types():
    lab = parse_label((RAW / f"{STEM}.xml").read_bytes())
    assert [(f["name"], f["data_type"]) for f in lab["fields"]] == [
        ("SCLK", "ASCII_Real"), ("LMST", "ASCII_String"), ("LTST", "ASCII_String"),
        ("PRESSURE", "ASCII_Real"), ("PRESSURE UNCERTAINTY", "ASCII_Real"), ("TRANSDUCER", "ASCII_Integer")]
    assert all(not f["special_constants"] for f in lab["fields"])
