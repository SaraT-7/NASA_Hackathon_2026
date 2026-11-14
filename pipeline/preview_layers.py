"""Check image for the data layers: orbital image + one layer + the demo route before and after the layer.

    python pipeline/preview_layers.py <layer_id> <route_before.json>   ->  data/work/check_layer_<layer_id>.jpg

Not part of the app; for checking by eye and for the presentation.
"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw

import config as c


def route_stats(route, grid, layer):
    cols, f = grid["cols"], grid["cell_size_m"]
    cells = [int((grid["height_m"] - p["y"]) // f) * cols + int(p["x"] // f) for p in route["points"]]
    on = np.mean([layer.flat[i] > 0 for i in cells])
    t = route["totals"]
    return (f"{t['distance_m']:.0f} m, mean risk {t['mean_risk']:.1f}, max slope {t['max_slope_deg']} deg, "
            f"{on:.0%} on layer")


def main():
    lid, before_path = sys.argv[1], sys.argv[2]
    grid = json.loads((c.APP / "grid.json").read_text(encoding="utf-8"))
    rows, cols = grid["rows"], grid["cols"]
    layer = np.fromfile(c.APP / "layers" / f"{lid}.bin", dtype=np.uint8).reshape(rows, cols)
    before = json.loads(open(before_path, encoding="utf-8").read())
    after = json.loads((c.APP / "mock_route.json").read_text(encoding="utf-8"))
    stops = json.loads((c.APP / "stops.json").read_text(encoding="utf-8"))

    img = Image.open(c.APP / grid["files"]["ortho_small"]).convert("RGBA")
    s = img.width / grid["width_m"]
    over = Image.open(c.APP / "layers" / f"{lid}.png").resize(img.size, Image.NEAREST)
    img = Image.alpha_composite(img, over).convert("RGB")
    d = ImageDraw.Draw(img)
    px = lambda p: (p["x"] * s, (grid["height_m"] - p["y"]) * s)
    for route, col, w in [(before, (255, 255, 255), 5), (after, (255, 210, 0), 3)]:
        d.line([px(p) for p in route["points"]], fill=col, width=w)
    for st in [stops["habitat"]] + stops["stops"]:
        x, y = px(st)
        d.ellipse((x - 9, y - 9, x + 9, y + 9), outline=(255, 0, 200), width=4)
    xs = [px(p)[0] for r in (before, after) for p in r["points"]]
    ys = [px(p)[1] for r in (before, after) for p in r["points"]]
    pad = 120
    box = (max(0, min(xs) - pad), max(0, min(ys) - pad), min(img.width, max(xs) + pad), min(img.height, max(ys) + pad))
    out = c.WORK / f"check_layer_{lid}.jpg"
    img.crop(tuple(int(v) for v in box)).save(out, quality=88)
    print(f"before (white): {route_stats(before, grid, layer)}")
    print(f"after (yellow): {route_stats(after, grid, layer)}")
    print(out)


if __name__ == "__main__":
    main()
