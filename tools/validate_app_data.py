"""Check that app_data/ follows docs/CONTRACT.md. Run from the repo root before every data pull request:

    python tools/validate_app_data.py

Exit code 0 = everything the web app relies on is in place.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
APP = Path(__file__).resolve().parent.parent / "app_data"
REQUIRED_FILES = ["risk", "slope", "elevation", "ortho", "ortho_small", "slope_img", "risk_img",
                  "stops", "curiosity_path", "conditions"]
errors, warnings = [], []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def load_json(name):
    path = APP / name
    if not path.exists():
        err(f"{name}: missing")
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        err(f"{name}: not valid JSON ({exc})")
        return None


def main():
    grid = load_json("grid.json")
    if grid is None:
        return finish()

    for key in ["version", "mock", "name", "cell_size_m", "cols", "rows", "width_m", "height_m",
                "georef", "files", "sources"]:
        if key not in grid:
            err(f"grid.json: missing key '{key}'")
    if errors:
        return finish()

    cols, rows, cell = grid["cols"], grid["rows"], grid["cell_size_m"]
    n = cols * rows
    if grid["width_m"] != cols * cell or grid["height_m"] != rows * cell:
        err("grid.json: width_m / height_m must equal cols / rows x cell_size_m")
    if n > 2_500_000:
        warn(f"grid has {n:,} cells; path search in the browser may be slow above about 1,000,000")

    files = grid["files"]
    for key in REQUIRED_FILES:
        if key not in files:
            err(f"grid.json files: missing '{key}'")
        elif not (APP / files[key]).exists():
            err(f"{files[key]}: listed in grid.json but missing")
    if errors:
        return finish()

    risk = np.fromfile(APP / files["risk"], dtype=np.uint8)
    slope = np.fromfile(APP / files["slope"], dtype=np.uint8)
    elev = np.fromfile(APP / files["elevation"], dtype="<f4")
    for name, arr in [("risk", risk), ("slope", slope), ("elevation", elev)]:
        if arr.size != n:
            err(f"{files[name]}: has {arr.size:,} values, grid needs {n:,}")
    if errors:
        return finish()

    bad_risk = np.count_nonzero((risk > 100) & (risk < 254))
    if bad_risk:
        err(f"risk.bin: {bad_risk:,} cells between 101 and 253 (allowed: 0-100, 254 no data, 255 impassable)")
    bad_slope = np.count_nonzero((slope > 90) & (slope != 255))
    if bad_slope:
        err(f"slope.bin: {bad_slope:,} cells above 90 degrees (255 = no data)")
    passable = np.count_nonzero(risk < 255) / n
    if passable < 0.3:
        warn(f"only {passable:.0%} of the area is passable; check the slope limit")
    valid = np.isfinite(elev)
    if valid.any():
        lo, hi = float(elev[valid].min()), float(elev[valid].max())
        if hi - lo > 2000:
            warn(f"elevation range {lo:.0f} to {hi:.0f} m looks too large for a few-km area")
    else:
        err("elevation.bin: no finite values")

    for key, max_side in [("ortho", 4096), ("ortho_small", 2048), ("slope_img", 4096), ("risk_img", 4096)]:
        with Image.open(APP / files[key]) as im:
            w, h = im.size
            if max(w, h) > max_side:
                err(f"{files[key]}: {w} x {h} px, longest side must be at most {max_side}")
            if abs(w / h - cols / rows) > 0.01:
                err(f"{files[key]}: aspect ratio {w}:{h} does not match the grid {cols}:{rows}")
        size_mb = (APP / files[key]).stat().st_size / 1e6
        if size_mb > 15:
            warn(f"{files[key]}: {size_mb:.1f} MB; keep images small for phones")

    def inside(p, label):
        if not (0 <= p["x"] <= grid["width_m"] and 0 <= p["y"] <= grid["height_m"]):
            err(f"{label}: ({p['x']}, {p['y']}) is outside the area")
            return False
        return True

    def cell_risk(p):
        col = min(cols - 1, int(p["x"] // cell))
        row = min(rows - 1, int((grid["height_m"] - p["y"]) // cell))
        return int(risk[row * cols + col])

    stops = load_json(files["stops"])
    if stops:
        if "habitat" not in stops or "stops" not in stops:
            err("stops.json: needs 'habitat' and 'stops'")
        else:
            for p in [stops["habitat"], *stops["stops"]]:
                label = f"stops.json '{p.get('id')}'"
                for key in ["id", "name", "x", "y"]:
                    if key not in p:
                        err(f"{label}: missing '{key}'")
                if "x" in p and "y" in p and inside(p, label) and cell_risk(p) == 255:
                    err(f"{label}: sits on an impassable cell")
                photo = p.get("photo")
                if photo and not (APP / photo["file"]).exists():
                    err(f"{label}: photo {photo['file']} is missing")
            if len(stops["stops"]) < 2:
                warn("stops.json: fewer than two science stops")

    path = load_json(files["curiosity_path"])
    if path:
        pts = path.get("points", [])
        if len(pts) < 2:
            warn("curiosity_path.json: fewer than two points")
        outside = sum(1 for p in pts if not (0 <= p["x"] <= grid["width_m"] and 0 <= p["y"] <= grid["height_m"]))
        if outside:
            warn(f"curiosity_path.json: {outside} of {len(pts)} points are outside the area")

    cond = load_json(files["conditions"])
    if cond:
        for item in cond.get("items", []):
            for key in ["id", "label", "value", "unit", "measured", "instrument"]:
                if key not in item:
                    err(f"conditions.json item '{item.get('id')}': missing '{key}'")
        if not cond.get("items"):
            err("conditions.json: no items")

    if not grid["mock"]:
        g = grid["georef"]
        if g.get("sw_lat") is None or g.get("sw_lon") is None:
            err("grid.json georef: real data needs sw_lat and sw_lon")
        elif not (-90 <= g["sw_lat"] <= 90 and math.isfinite(g["sw_lon"])):
            err("grid.json georef: sw_lat / sw_lon out of range")
        for s in grid["sources"]:
            for key in ["layer", "mission", "instrument", "product_id", "resolution_m", "url", "cannot_see"]:
                if not s.get(key):
                    err(f"grid.json source '{s.get('layer')}': '{key}' is empty")
        for name, data in [("stops.json", stops), ("curiosity_path.json", path), ("conditions.json", cond)]:
            if data and data.get("mock"):
                warn(f"{name} is still mock while grid.json says real data")

    print(f"grid: {cols} x {rows} cells of {cell} m ({'MOCK' if grid['mock'] else 'real data'}), "
          f"{passable:.0%} passable")
    return finish()


def finish():
    for w in warnings:
        print("WARNING:", w)
    for e in errors:
        print("ERROR:", e)
    print("OK: app_data follows the contract" if not errors else f"{len(errors)} error(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
