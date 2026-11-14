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
  comm       No line of sight to the habitat's antenna (from the elevation model). Radio shadow: raises risk.
  boxwork    Boxwork ridges found in the HiRISE image (rule based). Ridge crossings: raises risk.
  rough      Surface roughness: departure from a flat plane over 5 m (elevation model). Raises risk.
"""
import importlib
import json
import math
import sys
import urllib.request

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
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


def layer_comm():
    """100 where a suit radio has no line of sight to the habitat's antenna, 0 where it has.

    Radial sweep over the 2 m elevation grid: along each ray from the antenna a cell is visible when the line to it
    clears every cell in between. Mars' curvature lowers distant ground by d^2 / 2R (about 0.6 m at 2 km).
    """
    grid = json.loads((c.APP / "grid.json").read_text(encoding="utf-8"))
    rows, cols, f = grid["rows"], grid["cols"], grid["cell_size_m"]
    elev = np.fromfile(c.APP / grid["files"]["elevation"], dtype="<f4").reshape(rows, cols).astype(np.float64)
    hab = json.loads((c.APP / grid["files"]["stops"]).read_text(encoding="utf-8"))["habitat"]
    r0, c0 = (grid["height_m"] - hab["y"]) / f, hab["x"] / f  # fractional row/col of the habitat
    z0 = elev[int(r0), int(c0)] + c.HABITAT_ANTENNA_M

    max_r = max(math.hypot(r - r0, cc - c0) for r in (0, rows) for cc in (0, cols))
    n_rays = int(2 * math.pi * max_r * 1.5)  # dense enough that every cell is crossed by a ray
    dist = np.arange(1.0, max_r, 0.5)  # cells along each ray
    d_m = dist * f
    drop = d_m ** 2 / (2 * c.MARS_RADIUS_M)
    hits = np.zeros(rows * cols)  # ray samples falling in each cell
    seen_hits = np.zeros(rows * cols)  # ... of which see the antenna
    for ang in np.array_split(np.linspace(0, 2 * np.pi, n_rays, endpoint=False), 32):  # chunks keep memory small
        rr = r0 - np.outer(np.sin(ang), dist)  # rows grow southwards
        cc = c0 + np.outer(np.cos(ang), dist)
        inside = (rr >= 0) & (rr < rows) & (cc >= 0) & (cc < cols)
        ri, ci = np.clip(rr.astype(int), 0, rows - 1), np.clip(cc.astype(int), 0, cols - 1)
        ground = elev[ri, ci] - drop
        ground[~inside] = -np.inf
        horizon = np.maximum.accumulate((ground - z0) / d_m, axis=1)  # steepest terrain angle so far along the ray
        before = np.concatenate([np.full((len(ang), 1), -np.inf), horizon[:, :-1]], axis=1)
        seen = (ground + c.SUIT_ANTENNA_M - z0) / d_m >= before
        idx = ri * cols + ci
        hits += np.bincount(idx[inside], minlength=rows * cols)
        seen_hits += np.bincount(idx[inside & seen], minlength=rows * cols)
    visible = seen_hits >= 0.5 * np.maximum(hits, 1)  # cautious: most rays through the cell must see the antenna
    visible[int(r0) * cols + int(c0)] = True
    score = np.where(visible.reshape(rows, cols), 0, 100).astype(np.uint8)
    meta = {
        "id": "comm",
        "label": "No radio line of sight to the habitat",
        "effect": "raises risk",
        "description": (f"Cells where terrain blocks the straight line between a suit radio ({c.SUIT_ANTENNA_M} m above "
                        f"ground) and the habitat antenna ({c.HABITAT_ANTENNA_M} m mast, assumed). Out of sight, the "
                        "astronaut cannot call the habitat directly."),
        "source": "Line of sight computed from the MSL Gale merged DEM (USGS Astrogeology), " + c.DEM_PAGE,
        "cannot_see": "No relay orbiters, rovers or radio bending around ridges; the 2 m elevation grid smooths "
                      "narrow crests, so a few shadows may be missed.",
        "colour": (140, 60, 255, 75),  # light: the shadow covers most of the area, the ground must stay visible
        "habitat_antenna_m": c.HABITAT_ANTENNA_M,
        "suit_antenna_m": c.SUIT_ANTENNA_M,
    }
    return score, meta


def layer_boxwork():
    """100 on boxwork ridges, 0 elsewhere. Rule based, from the 0.5 m HiRISE image (the 1 m elevation model is too
    smooth to resolve 1-2 m high ridges).

    1. Ridge lines: Sato line filter on the brightness, normalised for local contrast; thinned to 1 px centre lines.
    2. Boxwork vs layer edges: boxwork ridges cross in many directions and close into cells, while the edges of rock
       layers run parallel. Within ~40 m windows we measure ridge density and how aligned the ridge directions are
       (mean resultant length of the doubled angles, 0 = all directions, 1 = parallel). Dense and multi-directional
       = boxwork zone.
    3. The layer is the ridge band (about 3 m wide) inside boxwork zones.
    """
    from skimage.feature import hessian_matrix
    from skimage.filters import sato
    from skimage.morphology import remove_small_objects, skeletonize

    rgb = np.load(c.WORK / "ortho_rgb_050cm.npy").astype(np.float64)
    gray = export.block(rgb.mean(axis=0), 2, np.mean)  # 0.5 m -> 1 m
    hp = gray - ndi.gaussian_filter(gray, 20)
    g = hp / (ndi.gaussian_filter(np.abs(hp), 20) + 1)  # local contrast, so dusty and dark ground compare
    ridge = sato(g, sigmas=[1.5, 2.5, 3.5], black_ridges=False)
    hrr, hrc, hcc = hessian_matrix(g, sigma=2.5, order="rc", use_gaussian_derivatives=False)
    theta = 0.5 * np.arctan2(2 * hrc, hcc - hrr)  # line direction (any fixed offset cancels below)

    lines = remove_small_objects(ridge > c.BOXWORK_RIDGE_THRESHOLD, min_size=40)
    skel = remove_small_objects(skeletonize(lines), min_size=10, connectivity=2)
    win = c.BOXWORK_WINDOW_SIGMA_M
    smooth = lambda a: ndi.gaussian_filter(a.astype(np.float64), win)
    density = smooth(skel)
    align = np.hypot(smooth(np.cos(2 * theta) * skel), smooth(np.sin(2 * theta) * skel)) / np.maximum(density, 1e-9)
    lo, hi = np.percentile(density, [50, 95])
    ramp = lambda a, a0, a1: np.clip((a - a0) / (a1 - a0), 0, 1)
    zone_score = ndi.gaussian_filter(ramp(density, lo, hi) * ramp(1 - align, 0.5, 0.85), 5)
    zone = zone_score > c.BOXWORK_ZONE_THRESHOLD
    band = ndi.binary_dilation(skel) & zone  # ~3 m wide ridge band, boxwork only

    f = c.CELL_M
    score = (export.block(band.astype(np.uint8), f, np.max) * 100).astype(np.uint8)
    zone2 = export.block(zone.astype(np.uint8), f, np.max).astype(bool)
    rgba = np.zeros(score.shape + (4,), dtype=np.uint8)
    rgba[zone2] = (255, 200, 60, 55)  # boxwork zone: pale tint
    rgba[score > 0] = (255, 110, 0, 225)  # ridges
    meta = {
        "id": "boxwork",
        "label": "Boxwork ridges",
        "effect": "raises risk",
        "description": ("Ridge lines found in the orbital image where they cross in many directions, the pattern of "
                        "boxwork. Each crossing means stepping over a ridge 1-2 m high. Ridges are also the science "
                        "target of this area."),
        "source": "Rule-based ridge detection on the HiRISE colour mosaic (USGS / JPL), " + c.ORTHO_PAGE,
        "cannot_see": "Ridge height is not measured, only the line; some layer edges may still be counted and "
                      "faint ridges under dust are missed. Not checked against rover images ridge by ridge.",
        "rgba": rgba,
        "zone_share": round(float(zone2.mean()), 4),
        "ridge_km": round(float(skel[zone].sum()) / 1000, 1),
    }
    return score, meta


def layer_rough():
    """0-100 surface roughness: how far the ground departs from a flat plane over a few metres.

    For every 1 m pixel a plane is fitted to the elevation in a ROUGH_WINDOW_M x ROUGH_WINDOW_M window; the layer is
    the RMS of the residual (metres), so a steady slope scores 0 and only bumps, steps and ledges count. Each 2 m cell
    keeps its roughest pixel. Score 0 at ROUGH_LOW_M or less (about the elevation model's own noise), 100 at
    ROUGH_HIGH_M or more.
    """
    import rasterio

    with rasterio.open(c.RAW / "aoi_dem_1m.tif") as ds:
        z = ds.read(1).astype(np.float64)
        nodata = ds.nodata
    z[z == nodata] = np.nan
    z = np.where(np.isnan(z), np.nanmean(z), z)
    w = c.ROUGH_WINDOW_M
    mean = lambda a: ndi.uniform_filter(a, w, mode="nearest")
    yy, xx = np.mgrid[0:z.shape[0], 0:z.shape[1]].astype(np.float64)
    mz, mx, my = mean(z), mean(xx), mean(yy)
    var_z = mean(z * z) - mz ** 2
    var_x, var_y = mean(xx * xx) - mx ** 2, mean(yy * yy) - my ** 2
    cov_x, cov_y = mean(z * xx) - mz * mx, mean(z * yy) - mz * my
    rms = np.sqrt(np.clip(var_z - cov_x ** 2 / var_x - cov_y ** 2 / var_y, 0, None))  # residual of the plane fit
    cell = export.block(rms, c.CELL_M, np.max)
    score = np.clip((cell - c.ROUGH_LOW_M) / (c.ROUGH_HIGH_M - c.ROUGH_LOW_M) * 100, 0, 100)
    score = np.floor(score + 0.5).astype(np.uint8)
    meta = {
        "id": "rough",
        "label": "Rough, uneven ground",
        "effect": "raises risk",
        "description": (f"How far the ground departs from a flat plane over {w} m (RMS, from the elevation model): "
                        f"0 at {int(c.ROUGH_LOW_M * 100)} cm or less, full at {int(c.ROUGH_HIGH_M * 100)} cm or more. "
                        "Catches steps, ledges and bumps that the slope alone misses."),
        "source": "Computed from the MSL Gale merged DEM (USGS Astrogeology), " + c.DEM_PAGE,
        "cannot_see": "Features smaller than a few metres are smoothed out in the elevation model: single rocks "
                      "and small steps are missed. Partly overlaps with slope, since steep ground is often rough.",
        "colour": (255, 70, 40, 110),  # light: rough ground covers over half the area
        "median_rms_m": round(float(np.median(cell)), 3),
    }
    return score, meta


LAYERS = [layer_curiosity, layer_comm, layer_boxwork, layer_rough]


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
        if "rgba" in meta:  # a layer may draw its own map image
            rgba = meta.pop("rgba")
        else:
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
