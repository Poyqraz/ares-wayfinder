"""Route figure for review: M0-A bundle ortho (1 m) with the TS routes drawn from their cell indices.

Cell (row, col) of the 2 m grid has its centre at ortho pixel (2 row + 1, 2 col + 1) - both grids share x0/y0.
Usage (from pipeline/): uv run python m0a_figure.py -> analysis/m0a/results/routes_<version>.png
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parent.parent


def main():
    idx = json.loads((REPO / "analysis" / "m0a" / "bundle" / "index.json").read_bytes())["m0a"]
    ver = idx["dataset_version"]
    b = REPO / idx["path"]
    routes = json.loads((REPO / "analysis" / "m0a" / "results" / f"routes_{ver}.json").read_bytes())
    img = Image.open(b / "ortho_1m.jpg").convert("RGB")
    hs = Image.open(b / "hillshade.png").convert("RGB").resize(img.size, Image.Resampling.BILINEAR)
    img = Image.blend(img, hs, 0.35)
    d = ImageDraw.Draw(img)
    style = {"M0->A distance": ((80, 220, 255), 3), "M0->A terrain-minetti": ((255, 140, 30), 2)}
    for r in routes["routes"]:
        if r["id"] in style:
            colour, w = style[r["id"]]
            d.line([(2 * c["col"] + 1, 2 * c["row"] + 1) for c in r["cells"]], fill=colour, width=w)
    for key, label in (("start_M0", "M0 rover position (Bearwallow drop)"), ("goal_A", "A rover position (Skinner Ridge sampling)")):
        e = routes["endpoints"][key]
        x, y = 2 * e["cell"]["col"] + 1, 2 * e["cell"]["row"] + 1
        d.ellipse((x - 5, y - 5, x + 5, y + 5), outline=(255, 255, 0), width=2)
        d.text((x + 8, y - 6), label, fill=(255, 255, 0))
    d.text((6, 4), f"M0-A prototype analysis {ver} - HiRISE 2 m grid - north up - 1 px = 1 m", fill=(255, 255, 255))
    d.text((6, 18), "cyan: shortest horizontal distance   orange: lowest relative terrain cost (Minetti)", fill=(255, 255, 255))
    d.text((6, img.size[1] - 16), "Imagery: NASA/JPL/UArizona HiRISE via USGS. Not a safety assessment.", fill=(255, 255, 255))
    out = REPO / "analysis" / "m0a" / "results" / f"routes_{ver}.png"
    img.save(out)
    print(out)


if __name__ == "__main__":
    main()
