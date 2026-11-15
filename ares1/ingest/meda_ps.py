"""Label-driven parser for Mars 2020 MEDA derived pressure (DER_PS) PDS4 products.

Principles (ARES-1):
- the original CSV/XML bytes are kept unchanged and hashed;
- structure, units and field types come from the PDS4 XML label, never from guesses;
- no row is ever dropped: each row gets a status (valid / flagged / missing / invalid) and flags;
- the plausibility screen is a sanity check, not a physical or EVA limit;
- these are rover-local historical observations, not a map, a forecast or an EVA risk value.
"""
import hashlib
import re
import statistics
import xml.etree.ElementTree as ET

PLAUSIBILITY_SCREEN_PA = (100.0, 1500.0)  # sanity screen inherited from the team package; not a physical limit
SESSION_GAP_S = 60  # SCLK step above this starts a new measurement session (observed steps: 1 s or ~3390 s)
DELIMITERS = {"Comma": ",", "Tab": "\t", "Semicolon": ";", "Vertical Bar": "|"}
RECORD_DELIMITERS = {"Carriage-Return Line-Feed": b"\r\n", "Line-Feed": b"\n"}


def _norm(name):
    return re.sub(r"[^A-Z0-9]+", "_", name.upper()).strip("_")


def _text(el, path):
    found = el.find(path)
    return " ".join(found.text.split()) if found is not None and found.text else None


def parse_label(xml_bytes):
    root = ET.fromstring(xml_bytes)
    any_ns = "{*}"
    fo = root.find(f".//{any_ns}File_Area_Observational")
    if fo is None:
        raise ValueError("label has no File_Area_Observational")
    header = fo.find(f"{any_ns}Header")
    table = fo.find(f"{any_ns}Table_Delimited")
    if table is None:
        raise ValueError("label has no Table_Delimited")
    fields = []
    for f in table.findall(f".//{any_ns}Field_Delimited"):
        unit_el = f.find(f"{any_ns}unit")
        sc = f.find(f"{any_ns}Special_Constants")
        fields.append({
            "field_number": int(_text(f, f"{any_ns}field_number")),
            "name": _text(f, f"{any_ns}name"),
            "data_type": _text(f, f"{any_ns}data_type"),
            "unit": " ".join(unit_el.text.split()) if unit_el is not None and unit_el.text else None,
            "description": _text(f, f"{any_ns}description"),
            "special_constants": {c.tag.split("}")[1]: c.text for c in sc} if sc is not None else {},
        })
    fields.sort(key=lambda x: x["field_number"])
    md = {"logical_identifier": _text(root, f".//{any_ns}Identification_Area/{any_ns}logical_identifier"),
          "version_id": _text(root, f".//{any_ns}Identification_Area/{any_ns}version_id"),
          "title": _text(root, f".//{any_ns}Identification_Area/{any_ns}title"),
          "start_date_time_utc": _text(root, f".//{any_ns}Time_Coordinates/{any_ns}start_date_time"),
          "stop_date_time_utc": _text(root, f".//{any_ns}Time_Coordinates/{any_ns}stop_date_time"),
          "processing_level": _text(root, f".//{any_ns}processing_level"),
          "file_name": _text(fo, f"{any_ns}File/{any_ns}file_name"),
          "creation_date_time": _text(fo, f"{any_ns}File/{any_ns}creation_date_time")}
    for tag in ("start_local_true_solar_time", "stop_local_true_solar_time", "start_solar_longitude", "stop_solar_longitude"):
        el = root.find(f".//{any_ns}{tag}")
        md[tag] = el.text.strip() if el is not None and el.text else None
    return {
        "metadata": md,
        "header": {"offset": int(_text(header, f"{any_ns}offset")), "length": int(_text(header, f"{any_ns}object_length"))} if header is not None else None,
        "table": {"offset": int(_text(table, f"{any_ns}offset")), "records": int(_text(table, f"{any_ns}records")),
                  "field_delimiter": _text(table, f"{any_ns}field_delimiter"), "record_delimiter": _text(table, f"{any_ns}record_delimiter")},
        "fields": fields,
    }


def _convert(value, data_type):
    """Return (parsed, problem). Empty string = missing (no Special_Constants defined in the label)."""
    if value == "":
        return None, None
    try:
        if data_type == "ASCII_Real":
            return float(value), None
        if data_type == "ASCII_Integer":
            return int(value), None
        return value, None
    except ValueError:
        return None, f"not {data_type}"


def parse_product(csv_bytes, xml_bytes):
    label = parse_label(xml_bytes)
    anomalies = []
    names = [f["name"] for f in label["fields"]]
    types = [f["data_type"] for f in label["fields"]]
    sep = DELIMITERS[label["table"]["field_delimiter"]]
    rec_delim = RECORD_DELIMITERS[label["table"]["record_delimiter"]]
    for f in label["fields"]:
        if f["special_constants"]:
            anomalies.append(f"field {f['name']} defines special constants {f['special_constants']} (handled as missing)")
    # header
    h = label["header"]
    if h:
        header_bytes = csv_bytes[h["offset"]:h["offset"] + h["length"]]
        header_cols = header_bytes.decode("ascii").rstrip("\r\n").split(sep)
        if [_norm(c) for c in header_cols] != [_norm(n) for n in names]:
            raise ValueError(f"header {header_cols} does not match label fields {names}")
        for c, n in zip(header_cols, names):
            if c != n:
                anomalies.append(f"header spells '{c}' where the label names the field '{n}' (same field after normalisation)")
    table_bytes = csv_bytes[label["table"]["offset"]:]
    if not table_bytes.endswith(rec_delim):
        anomalies.append("table does not end with the declared record delimiter")
    lines = table_bytes.split(rec_delim)
    if lines and lines[-1] == b"":
        lines = lines[:-1]
    if b"\n" in table_bytes.replace(rec_delim, b""):
        raise ValueError("stray line feeds outside the declared record delimiter")
    if len(lines) != label["table"]["records"]:
        raise ValueError(f"label declares {label['table']['records']} records, file has {len(lines)}")
    unit = {f["name"]: f["unit"] for f in label["fields"]}
    if unit.get("PRESSURE") != "pascal":
        raise ValueError(f"PRESSURE unit is {unit.get('PRESSURE')!r}, expected 'pascal' from the label")
    if unit.get("PRESSURE UNCERTAINTY") not in (None, "pascal"):
        anomalies.append(f"label unit of PRESSURE UNCERTAINTY is '{unit.get('PRESSURE UNCERTAINTY')}', inconsistent with a pressure uncertainty; values kept as published, no conversion")
    for required in ("SCLK", "PRESSURE", "PRESSURE UNCERTAINTY", "TRANSDUCER"):
        if required not in names:
            raise ValueError(f"label lacks field {required}")
    rows, prev_sclk = [], None
    for idx, raw in enumerate(lines, start=1):
        text = raw.decode("ascii")
        parts = text.split(sep)
        row = {"record_index": idx, "raw": text, "flags": []}
        if len(parts) != len(names):
            row.update(status="invalid", flags=[f"width {len(parts)} != {len(names)}"], values={})
            rows.append(row)
            continue
        values, problems = {}, []
        for name, dtype, v in zip(names, types, parts):
            parsed, problem = _convert(v, dtype)
            values[name] = parsed
            if problem:
                problems.append(f"{name}: {problem}")
        row["values"] = values
        if problems:
            row.update(status="invalid", flags=problems)
        elif values["PRESSURE"] is None:
            row["status"] = "missing"
        else:
            p, sclk, tr = values["PRESSURE"], values["SCLK"], values["TRANSDUCER"]
            if not (PLAUSIBILITY_SCREEN_PA[0] <= p <= PLAUSIBILITY_SCREEN_PA[1]):
                row["flags"].append("outside_plausibility_screen")
            if tr not in (1, 2):
                row["flags"].append("transducer_not_1_or_2")
            if prev_sclk is not None and sclk is not None and sclk <= prev_sclk:
                row["flags"].append("sclk_not_increasing")
            row["status"] = "flagged" if row["flags"] else "valid"
        if values.get("SCLK") is not None:
            prev_sclk = values["SCLK"]
        if values.get("PRESSURE UNCERTAINTY") is None:
            row["uncertainty_provided"] = False
        rows.append(row)
    return label, rows, anomalies


def qa_report(label, rows, anomalies, csv_bytes, xml_bytes, source_urls):
    from collections import Counter
    status = Counter(r["status"] for r in rows)
    flags = Counter(f for r in rows for f in r["flags"])
    valid_p = [r["values"]["PRESSURE"] for r in rows if r["status"] == "valid"]
    sclk = [(r["values"]["SCLK"], r) for r in rows if r.get("values") and r["values"].get("SCLK") is not None]
    sessions, start = [], 0
    for k in range(1, len(sclk) + 1):
        if k == len(sclk) or sclk[k][0] - sclk[k - 1][0] > SESSION_GAP_S:
            a, b = sclk[start][1], sclk[k - 1][1]
            sessions.append({"first_record": a["record_index"], "last_record": b["record_index"], "n": k - start,
                             "sclk_start": a["values"]["SCLK"], "sclk_end": b["values"]["SCLK"],
                             "lmst_start": a["values"]["LMST"], "lmst_end": b["values"]["LMST"]})
            start = k
    steps = Counter(sclk[k][0] - sclk[k - 1][0] for k in range(1, len(sclk)))
    return {
        "product": label["metadata"],
        "source_urls": source_urls,
        "source_bytes": {"csv": len(csv_bytes), "xml": len(xml_bytes)},
        "source_sha256": {"csv": hashlib.sha256(csv_bytes).hexdigest(), "xml": hashlib.sha256(xml_bytes).hexdigest()},
        "label_fields": label["fields"],
        "label_anomalies": anomalies,
        "records_declared": label["table"]["records"],
        "records_parsed": len(rows),
        "status_counts": {k: status.get(k, 0) for k in ("valid", "flagged", "missing", "invalid")},
        "flag_counts": dict(flags),
        "uncertainty_provided_rows": sum(1 for r in rows if r.get("uncertainty_provided", True) and r["status"] in ("valid", "flagged")),
        "transducer_counts": dict(Counter(r["values"].get("TRANSDUCER") for r in rows if r.get("values"))),
        "pressure_pa_valid": {"n": len(valid_p), "min": min(valid_p) if valid_p else None, "max": max(valid_p) if valid_p else None,
                              "mean": round(statistics.fmean(valid_p), 4) if valid_p else None,
                              "median": statistics.median(valid_p) if valid_p else None},
        "sclk_range_s": [sclk[0][0], sclk[-1][0]] if sclk else None,
        "sclk_step_counts_top": [[int(s), n] for s, n in steps.most_common(6)],
        "sessions": sessions,
        "plausibility_screen_pa": list(PLAUSIBILITY_SCREEN_PA),
        "time_basis": "Each record carries SCLK (s, MEDA clock approximation), LMST and LTST as published. No per-record UTC is in the product; "
                      "only the product start/stop UTC from the label. SCLK-to-UTC conversion would need SPICE kernels and was not done.",
        "missing_value_rule": "The label defines no Special_Constants; an empty field is treated as missing. Missing values are kept as rows, never imputed.",
        "data_kind": "observed_historical (PDS processing level: Derived)",
        "limitations": [
            "Rover-local point measurement at the MEDA pressure inlet on Perseverance, sol 516; not a spatial field over Jezero.",
            "Historical (2022) observation; not a forecast and not a condition for a hypothetical future EVA.",
            "Not a validated EVA risk or safety value.",
            "Pressure uncertainty is not provided in this product (all rows empty); the label's unit for it ('kelvin') is inconsistent.",
            "The plausibility screen is a sanity check only; no row was removed.",
        ],
    }
