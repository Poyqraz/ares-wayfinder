"""Visual evidence: CTX bundle vs HiRISE display bundle over the identical ROI-A extent.

Usage: uv run python hirise_evidence.py
Output: science/hirise_roi_a_ctx_vs_hirise.jpg
"""
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parent.parent
DATA = REPO / "web" / "public" / "data"


def hillshade(z, dxg, dyg, az=315.0, el=45.0):
    gy, gx = np.gradient(z, dyg, dxg)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    a, e = math.radians(360 - az + 90), math.radians(el)
    h = np.sin(e) * np.cos(slope) + np.cos(e) * np.sin(slope) * np.cos(a - aspect)
    return (np.clip(h, 0, 1) * 255).astype(np.uint8)


def main():
    idx = json.loads((DATA / "hirise" / "index.json").read_bytes())["roi_a"]
    hb = DATA / idx["path"].removeprefix("data/")
    man = json.loads((hb / "manifest.json").read_bytes())
    cb = DATA / "roi_a" / man["aligned_to_ctx_bundle"]["dataset_version"]
    t = json.loads((cb / "terrain.json").read_bytes())
    nx, ny = t["nx"], t["ny"]
    W, H = 444, 540  # panel size: 1 panel px = 3.33 m
    cdem = np.fromfile(cb / "dem.f32.bin", "<f4").reshape(ny, nx).astype(np.float64)
    g = man["grids"]["dtm_2m"]
    hdem = np.frombuffer((hb / g["file"]).read_bytes(), "<f4").reshape(g["ny"], g["nx"]).astype(np.float64)
    ctx_o = Image.open(cb / "ortho.jpg").convert("L")
    hi_o = Image.open(hb / "ortho_0p5m.jpg").convert("L")
    # zoom box: 300 m square centred on Landing
    R, k = t["radius_m"], math.cos(math.radians(t["lat_ts_deg"]))
    pois = {p["id"]: p["geo"] for p in json.loads((cb / "pois.json").read_bytes())}

    def frac(p):  # fractional position in the ROI (0..1 east, 0..1 south)
        X = R * k * math.radians(p["lon"])
        Y = R * math.radians(p["lat"])
        return (X - t["x0"]) / (nx * 20), (t["y0"] - Y) / (ny * 20)

    fx, fy = frac(pois["landing"])
    half_x, half_y = 150 / (nx * 20), 150 / (ny * 20)
    box = (fx - half_x, fy - half_y, fx + half_x, fy + half_y)

    def crop(img, b):
        w, h = img.size
        return img.crop((round(b[0] * w), round(b[1] * h), round(b[2] * w), round(b[3] * h))).resize((W, W), Image.BILINEAR)

    panels = [
        ("CTX ortho 5 m (current demo)", ctx_o.resize((W, H), Image.BILINEAR)),
        ("HiRISE ortho 0.5 m (display only)", hi_o.resize((W, H), Image.LANCZOS)),
        ("CTX 300 m box at Landing", crop(ctx_o, box)),
        ("HiRISE 300 m box at Landing", crop(hi_o, box)),
        ("CTX DEM 20 m hillshade", Image.fromarray(hillshade(cdem, t["dx_ground_m"], t["dy_ground_m"])).resize((W, H), Image.BILINEAR)),
        ("HiRISE DTM 2 m hillshade (E-W line artifacts visible)", Image.fromarray(hillshade(hdem, g["dx_ground_m"], g["dy_ground_m"])).resize((W, H), Image.LANCZOS)),
    ]
    rows = [(panels[0], panels[1], H), (panels[2], panels[3], W), (panels[4], panels[5], H)]
    out = Image.new("RGB", (2 * W + 30, sum(r[2] + 26 for r in rows) + 40), (18, 14, 12))
    d = ImageDraw.Draw(out)
    y = 8
    for a, b, h in rows:
        for i, (label, img) in enumerate((a, b)):
            x = 10 + i * (W + 10)
            d.text((x, y), label, fill=(255, 200, 150))
            out.paste(img.convert("RGB"), (x, y + 16))
            if h == H:  # full-ROI panels: mark Landing and Rochette
                for pid, col in (("landing", (255, 154, 66)), ("rochette", (121, 231, 255))):
                    px, py = frac(pois[pid])
                    cx, cy = x + px * W, y + 16 + py * H
                    d.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), outline=col, width=2)
        y += h + 26
    d.text((10, y), f"ROI-A, identical extent; north up. HiRISE bundle {idx['dataset_version']} (USGS doi:10.5066/P9REJ9JN, P9QJDP48); CTX bundle {t['dataset_version']}.", fill=(200, 200, 200))
    d.text((10, y + 14), "Circles: Landing (orange), Rochette (cyan); coordinates UNVERIFIED (S2). HiRISE imagery predates the 2021 landing.", fill=(200, 200, 200))
    out.save(REPO / "science" / "hirise_roi_a_ctx_vs_hirise.jpg", quality=88)


if __name__ == "__main__":
    main()
