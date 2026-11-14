"""Step 6: data layers on top of slope, and the combined risk the route search uses. Format: docs/CONTRACT.md.

    python pipeline/06_layers.py
    python tools/validate_app_data.py
    node tools/make_mock_route.mjs

Run after step 3 (it reads data/work/slope_2m.npy and rewrites app_data/risk.bin and risk.png).
The slope-only risk goes to app_data/layers/slope_risk.bin, so the app can switch layers on and off.
Each layer is a 0-100 score per grid cell, written to app_data/layers/<id>.bin with a map image <id>.png.
Combined risk = slope / SLOPE_LIMIT_DEG x 100 + sum(weight x layer / 100), clipped to 0..100.
Cells at or above the slope limit stay impassable whatever the layers say; layers never open a closed cell.

Layers so far:
  curiosity  Ground the Curiosity rover drove on (MSL traverse, MMGIS). Proven firm ground: lowers risk.
"""
import importlib
import json
import math
import sys
import urllib.request

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

import config as c

sys.path.insert(0, str(c.REPO / "pipeline"))
export = importlib.import_module("03_export_app_data")  # reuse block() and colourise(), same colours as step 3

RISK_NODATA, RISK_IMPASSABLE = export.RISK_NODATA, export.RISK_IMPASSABLE
N1 = c.AOI_SIZE_M  # the 1 m raster is N1 x N1, row 0 = north


def to_1m_rowcol(easting, northing):
    x, y = c.to_local(easting, northing)
    return N1 - y, x  # fractional row (from the north edge), column


# Layers ----------------------------------------------------------------------------------------------

def layer_curiosity():
    """100 within CURIOSITY_TRACK_HALF_WIDTH_M of the rover's driven track, 0 elsewhere."""
    src = c.RAW / "MSL_traverse.json"
    if not src.exists():
        urllib.request.urlretrieve(c.TRAVERSE_URL, src)
    track = np.zeros((N1, N1), dtype=bool)
    for feat in json.loads(src.read_text())["features"]:
        geom = feat["geometry"]
        lines = geom["coordinates"] if geom["type"] == "MultiLineString" else [geom["coordinates"]]
        for line in lines:
            pts = np.array([to_1m_rowcol(math.radians(lon) * c.MARS_RADIUS_M, math.radians(lat) * c.MARS_RADIUS_M)
                            for lon, lat, *_ in line])
            for a, b in zip(pts[:-1], pts[1:]):
                n = max(2, int(np.hypot(*(b - a)) / 0.5) + 1)  # densify to 0.5 m
                rr, cc = np.linspace(a[0], b[0], n), np.linspace(a[1], b[1], n)
                ok = (rr >= 0) & (rr < N1) & (cc >= 0) & (cc < N1)
                track[rr[ok].astype(int), cc[ok].astype(int)] = True
    near = distance_transform_edt(~track) <= c.CURIOSITY_TRACK_HALF_WIDTH_M
    score = export.block(near.astype(np.uint8), c.CELL_M, np.max) * 100
    meta = {
        "id": "curiosity",
        "label": "Ground the Curiosity rover drove on",
        "effect": "lowers risk",
        "description": (f"Cells within {c.CURIOSITY_TRACK_HALF_WIDTH_M} m of Curiosity's driven track. A 900 kg rover "
                        "crossed this ground, so it is firm and passable at rover scale."),
        "source": "MSL traverse, NASA/JPL-Caltech (MMGIS), " + c.TRAVERSE_URL,
        "cannot_see": "Only one track across the area; ground off the track is not proven either way.",
        "colour": (0, 220, 255, 200),
        "km_in_area": round(float(track.sum()) / 1000, 2),
    }
    return score.astype(np.uint8), meta


LAYERS = [layer_curiosity]


# Combination -----------------------------------------------------------------------------------------

def main():
    grid_path = c.APP / "grid.json"
    grid = json.loads(grid_path.read_text(encoding="utf-8"))
    rows, cols = grid["rows"], grid["cols"]
    slope = np.load(c.WORK / "slope_2m.npy").astype(np.float64)
    old_risk = np.fromfile(c.APP / grid["files"]["risk"], dtype=np.uint8).reshape(rows, cols)

    # Slope-only risk, rounded exactly like step 3; written out so the app can rebuild the risk with any set of
    # layers (shared/data.js combineRisk). Rounding is floor(x + 0.5) to match JavaScript's Math.round.
    jsround = lambda a: np.floor(a + 0.5)
    slope_risk = jsround(np.clip(slope / c.SLOPE_LIMIT_DEG * 100, 0, 100)).astype(np.uint8)
    slope_risk[slope >= c.SLOPE_LIMIT_DEG] = RISK_IMPASSABLE
    slope_risk[old_risk == RISK_NODATA] = RISK_NODATA
    total = slope_risk.astype(np.float64)
    (c.APP / "layers").mkdir(exist_ok=True)
    layer_meta = []
    for make in LAYERS:
        score, meta = make()
        assert score.shape == (rows, cols), f"{meta['id']}: {score.shape} != grid {rows} x {cols}"
        lid, weight = meta["id"], c.LAYER_WEIGHTS[meta["id"]]
        total += weight * score.astype(np.float64) / 100.0
        score.tofile(c.APP / "layers" / f"{lid}.bin")
        rgba = np.zeros((rows, cols, 4), dtype=np.uint8)
        rgba[score > 0] = meta.pop("colour")
        rgba[..., 3] = (rgba[..., 3].astype(np.float64) * score / 100).astype(np.uint8)
        Image.fromarray(rgba).save(c.APP / "layers" / f"{lid}.png", optimize=True)
        extra = {k: meta.pop(k) for k in list(meta) if k not in
                 ("id", "label", "effect", "description", "source", "cannot_see")}
        layer_meta.append({**{k: meta[k] for k in ("id", "label")},
                           "bin": f"layers/{lid}.bin", "img": f"layers/{lid}.png", "weight": weight,
                           **{k: meta[k] for k in ("effect", "description", "source", "cannot_see")},
                           "cells_share": round(float((score > 0).mean()), 4), **extra})
        print(f"layer {lid}: weight {weight:+d}, {(score > 0).mean():.1%} of cells, {extra}")

    risk = np.clip(jsround(total), 0, 100).astype(np.uint8)
    closed = slope_risk >= RISK_NODATA  # impassable or no data: layers never change these
    risk[closed] = slope_risk[closed]
    risk.tofile(c.APP / grid["files"]["risk"])
    slope_risk.tofile(c.APP / "layers" / "slope_risk.bin")
    grid["files"]["risk_slope"] = "layers/slope_risk.bin"
    risk_rgba = export.colourise(
        np.clip(risk.astype(np.float64) / 100, 0, 1),
        [(0, (26, 152, 80, 0)), (0.35, (166, 217, 106, 140)), (0.65, (253, 174, 97, 200)), (1, (215, 48, 39, 230))],
    )
    risk_rgba[risk == RISK_IMPASSABLE] = (90, 0, 20, 240)
    risk_rgba[risk == RISK_NODATA] = (120, 120, 120, 170)
    Image.fromarray(risk_rgba).save(c.APP / grid["files"]["risk_img"], optimize=True)

    grid["layers"] = layer_meta
    base = grid["risk_model"]["description"].split(" Data layers:")[0]
    names = "; ".join(f"{m['label']} ({m['weight']:+d} risk points)" for m in layer_meta)
    grid["risk_model"]["description"] = (
        f"{base} Data layers: {names}. Combined risk = slope risk + sum of weight x layer score / 100, kept within "
        f"0-100; layer weights are our assumptions. Layers never make an impassable cell passable.")
    grid["risk_model"]["layers_formula"] = "risk = clamp(slope / limit x 100 + sum(weight x layer / 100), 0, 100)"
    grid_path.write_text(json.dumps(grid, indent=2), encoding="utf-8")

    passable = risk != RISK_IMPASSABLE
    print(f"combined risk: mean {risk[passable].mean():.1f} on passable cells "
          f"(slope only {np.clip(slope / c.SLOPE_LIMIT_DEG * 100, 0, 100)[passable].mean():.1f}), "
          f"impassable {(~passable).mean():.1%}")


if __name__ == "__main__":
    main()
