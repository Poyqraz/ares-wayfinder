"""Extract header fields from the PDS Mars 2020 Sample Dossier Initial Reports (PDF) by designation key.

Pages are found by the normalized designation (spaces removed), never by sample name. Each value keeps
its PDF volume/page. The PDFs are large and are not committed; their URL and SHA-256 are recorded.
Usage: uv run python ares1/ingest/extract_initial_reports.py <dir with initial_reports_volumeN.pdf> <out.json>
"""
import hashlib
import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader

BASE = "https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_sample_dossier/initial_reports/"
# designations needed by the ARES-1 catalog (M0 depot tubes, A cores, B core)
WANTED = ["M2020-00164-02", "M2020-00190-03", "M2020-00271-06", "M2020-00337-08", "M2020-00374-10",
          "M2020-00490-11", "M2020-00495-12", "M2020-00509-14", "M2020-00516-15", "M2020-00579-17",
          "M2020-00586-18", "M2020-00639-21", "M2020-01215-28"]


def short(designation):
    """M2020-00190-03 -> M2020-190-3 (the form printed in the Initial Reports)."""
    _, sol, num = designation.split("-")
    return f"M2020-{int(sol)}-{int(num)}"


def squeeze(s):
    return re.sub(r"\s+", "", s)


def field(text, label):
    """Value after 'label:' up to the end of that line (raw, whitespace-collapsed)."""
    m = re.search(re.escape(label) + r"\s*:\s*(.+)", text)
    return " ".join(m.group(1).split()) if m else None


def normalize(text):
    """Undo PDF typography only (degree signs, Unicode minus/dashes). Words are never repaired."""
    t = text.replace("\r", "")
    for ch in ("˚", "°", "º"):
        t = t.replace(ch, "")
    for ch in ("–", "−", "—"):
        t = t.replace(ch, "-")
    return t


def parse_page(text):
    t = normalize(text)
    nospace = squeeze(t)
    out = {}
    m = re.search(r"(?:Sample|WitnessTube)Designation:(M2020-\d+-\d+)", nospace)
    out["designation_printed"] = m.group(1) if m else None
    m = re.search(r"Sol(\d+),Ls=?([\d.]+)", nospace)
    out["sealing_sol"] = int(m.group(1)) if m else None
    out["sealing_ls_deg"] = float(m.group(2)) if m else None
    m = re.search(r"MarsTimeof(?:SampleCore|WitnessTube|Sample)?Sealing:([\d:]+)LMST", nospace)
    out["sealing_lmst"] = m.group(1) if m else None
    m = re.search(r"Latitude\(N\),Longitude\(E\),Elevation:(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)m?", nospace)
    out["printed_lat"], out["printed_lon"], out["printed_elev_m"] = (float(m.group(1)), float(m.group(2)), float(m.group(3))) if m else (None, None, None)
    m = re.search(r"SampleSerialNumbers:TubeSN(\d+)[;,]SealSN(\d+)[;,]FerruleSN(\d+)", nospace)
    out["tube_sn"], out["seal_sn"], out["ferrule_sn"] = (f"SN{m.group(1)}", f"SN{m.group(2)}", f"SN{m.group(3)}") if m else (None, None, None)
    for key, label in (("date_of_coring_raw", "Date of Coring"), ("date_of_sealing_raw", "Date of Sealing"),
                       ("campaign_raw", "Campaign"), ("region_of_interest_raw", "Region of Interest"),
                       ("lithology_raw", "Lithology"), ("abrasion_patch_raw", "Abrasion Patch Name and Depth"),
                       ("anomalous_behavior_raw", "Anomalous Behavior")):
        out[key] = field(t, label)
    return out


def main(pdf_dir, out_path):
    pdf_dir = Path(pdf_dir)
    result = {"source": "urn:nasa:pds:mars2020_sample_dossier, initial_reports", "note": "values parsed from PDF text; '_raw' fields keep PDF text-extraction spacing artifacts", "volumes": {}, "reports": {}}
    want = {squeeze(short(d)): d for d in WANTED}
    for pdf in sorted(pdf_dir.glob("initial_reports_volume*.pdf")):
        vol = int(re.search(r"volume(\d+)", pdf.name).group(1))
        b = pdf.read_bytes()
        result["volumes"][str(vol)] = {"url": BASE + pdf.name, "bytes": len(b), "sha256": hashlib.sha256(b).hexdigest()}
        reader = PdfReader(str(pdf))
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            ns = squeeze(text[:1500])
            m = re.search(r"(?:Sample|WitnessTube)Designation:(M2020-\d+-\d+)", ns)
            if not m or m.group(1) not in want:
                continue
            d = want[m.group(1)]
            if d in result["reports"]:
                raise SystemExit(f"designation {d} found twice (vol {vol} p {i + 1})")
            rec = parse_page(text)
            rec.update({"designation": d, "volume": vol, "page": i + 1, "url": BASE + pdf.name})
            result["reports"][d] = rec
    missing = [d for d in WANTED if d not in result["reports"]]
    result["missing"] = missing
    Path(out_path).write_bytes(json.dumps(result, indent=1, ensure_ascii=False).encode("utf-8"))
    print(f"{len(result['reports'])} reports extracted; missing: {missing}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
