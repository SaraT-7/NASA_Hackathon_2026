"""Step 3: build app_data/ (the files the web app reads) from the AOI cuts. Format: docs/CONTRACT.md.

    python pipeline/03_export_app_data.py
    python tools/validate_app_data.py

Inputs: data/raw/aoi_dem_1m.tif (step 1), data/work/ortho_rgb_050cm.npy (step 2), data/raw/MSL_waypoints.json.
conditions.json is written by a later step and is left untouched here.
"""
import json
from datetime import datetime, timezone

import numpy as np
import rasterio
from PIL import Image
from scipy.ndimage import gaussian_filter

import config as c

RISK_NODATA, RISK_IMPASSABLE, SLOPE_NODATA = 254, 255, 255
SMOOTH_SIGMA_M = 1.5  # the 1 m DEM carries pixel-scale noise; smooth before taking the slope


def block(a, f, reducer):
    """Reduce a 2D array by an integer factor with max or mean over each f x f block."""
    h, w = a.shape
    return reducer(a.reshape(h // f, f, w // f, f), axis=(1, 3))


def colourise(values, stops):
    out = np.zeros(values.shape + (4,), dtype=np.float64)
    pos = [p for p, _ in stops]
    for ch in range(4):
        out[..., ch] = np.interp(values, pos, [col[ch] for _, col in stops])
    return out.astype(np.uint8)


def main():
    with rasterio.open(c.RAW / "aoi_dem_1m.tif") as ds:
        dem = ds.read(1).astype(np.float64)
        nodata = ds.nodata
    missing = dem == nodata
    if missing.any():
        dem[missing] = np.nan

    # Slope on the smoothed 1 m DEM, then the steepest value inside each 2 m cell (cautious choice).
    gy, gx = np.gradient(gaussian_filter(np.nan_to_num(dem, nan=np.nanmean(dem)), SMOOTH_SIGMA_M), 1.0)
    slope1 = np.degrees(np.arctan(np.hypot(gx, gy)))
    f = c.CELL_M
    slope = block(slope1, f, np.max)
    elev = block(dem, f, np.mean)
    cell_missing = block(missing.astype(np.uint8), f, np.max).astype(bool)
    rows, cols = slope.shape

    risk = np.clip(np.round(slope / c.SLOPE_LIMIT_DEG * 100), 0, 100).astype(np.uint8)
    risk[slope >= c.SLOPE_LIMIT_DEG] = RISK_IMPASSABLE
    risk[cell_missing] = RISK_NODATA
    slope_u8 = np.clip(np.round(slope), 0, 90).astype(np.uint8)
    slope_u8[cell_missing] = SLOPE_NODATA
    elev32 = elev.astype("<f4")

    c.APP.mkdir(exist_ok=True)
    (c.APP / "photos").mkdir(exist_ok=True)
    risk.tofile(c.APP / "risk.bin")
    slope_u8.tofile(c.APP / "slope.bin")
    elev32.tofile(c.APP / "elevation.bin")

    rgb = np.moveaxis(np.load(c.WORK / "ortho_rgb_050cm.npy"), 0, -1)
    ortho = Image.fromarray(rgb)
    ortho.save(c.APP / "ortho.jpg", quality=85, optimize=True)
    ortho.resize((rgb.shape[1] // 2, rgb.shape[0] // 2), Image.LANCZOS).save(c.APP / "ortho_small.jpg", quality=82, optimize=True)

    slope_rgba = colourise(
        np.clip(slope / 35, 0, 1),
        [(0, (255, 255, 204, 0)), (0.3, (254, 217, 118, 150)), (0.6, (253, 141, 60, 200)), (1, (189, 0, 38, 230))],
    )
    slope_rgba[slope_u8 == SLOPE_NODATA] = (120, 120, 120, 170)
    Image.fromarray(slope_rgba).save(c.APP / "slope.png", optimize=True)
    risk_rgba = colourise(
        np.clip(risk.astype(np.float64) / 100, 0, 1),
        [(0, (26, 152, 80, 0)), (0.35, (166, 217, 106, 140)), (0.65, (253, 174, 97, 200)), (1, (215, 48, 39, 230))],
    )
    risk_rgba[risk == RISK_IMPASSABLE] = (90, 0, 20, 240)
    risk_rgba[risk == RISK_NODATA] = (120, 120, 120, 170)
    Image.fromarray(risk_rgba).save(c.APP / "risk.png", optimize=True)

    # Curiosity's real path and the places where it stayed longest -------------------------------------
    wps = [f["properties"] for f in json.loads((c.RAW / "MSL_waypoints.json").read_text())["features"]]
    path = []
    for p in wps:
        x, y = c.to_local(p["easting"], p["northing"])
        if 0 <= x <= c.AOI_SIZE_M and 0 <= y <= c.AOI_SIZE_M:
            path.append({"x": round(x, 1), "y": round(y, 1), "sol": p["sol"]})
    (c.APP / "curiosity_path.json").write_text(json.dumps({
        "mock": False,
        "source": "NASA/JPL-Caltech MSL rover waypoints (MMGIS), " + c.WAYPOINTS_URL,
        "points": path,
    }), encoding="utf-8")

    def passable(x, y):
        col, row = int(x // f), int((c.AOI_SIZE_M - y) // f)
        return risk[row, col] != RISK_IMPASSABLE

    def nudge(p):
        """Move a point to the nearest passable cell centre if it sits on an impassable cell."""
        if passable(p["x"], p["y"]):
            return p
        for radius in range(1, 30):
            for dx in range(-radius, radius + 1):
                for dy in range(-radius, radius + 1):
                    x, y = p["x"] + dx * f, p["y"] + dy * f
                    if passable(x, y):
                        print(f"  moved '{p['id']}' by ({dx * f}, {dy * f}) m to a passable cell")
                        return {**p, "x": x, "y": y}
        raise SystemExit(f"no passable cell near {p['id']}")

    stops = {
        "mock": False,
        "note": "Stops are places where the Curiosity rover stayed for many sols. The habitat is hypothetical.",
        "habitat": nudge({"id": "habitat", "name": "Habitat (hypothetical)", "x": 1128, "y": 1460}),
        "stops": [nudge(s) for s in [
            {"id": "s1", "name": "Boxwork edge site", "type": "science", "x": 1117.4, "y": 1290.6,
             "description": "Curiosity stopped here for 11 sols from sol 4560, soon after entering the boxwork terrain.",
             "photo": None},
            {"id": "s2", "name": "Central boxwork site", "type": "science", "x": 966.3, "y": 805.5,
             "description": "Curiosity worked within a few metres of this spot from sol 4687 to sol 4805.",
             "photo": None},
            {"id": "s3", "name": "Upper boxwork site", "type": "science", "x": 1008.6, "y": 435.8,
             "description": "Curiosity stayed here for about 40 sols from sol 4868, higher up the slope.",
             "photo": None},
        ]],
    }
    (c.APP / "stops.json").write_text(json.dumps(stops, indent=2), encoding="utf-8")

    sw_lon, sw_lat = c.to_lonlat(c.AOI_WEST, c.AOI_SOUTH)
    grid = {
        "version": 1,
        "mock": False,
        "name": "Mount Sharp boxwork terrain, Gale Crater (2 km x 2 km)",
        "cell_size_m": f,
        "cols": cols,
        "rows": rows,
        "width_m": cols * f,
        "height_m": rows * f,
        "georef": {
            "sw_lat": round(sw_lat, 6), "sw_lon": round(sw_lon, 6), "radius_m": c.MARS_RADIUS_M,
            "projection": "Mars equirectangular, centre longitude 0, sphere",
            "west_m": c.AOI_WEST, "south_m": c.AOI_SOUTH,
        },
        "files": {
            "risk": "risk.bin", "slope": "slope.bin", "elevation": "elevation.bin",
            "ortho": "ortho.jpg", "ortho_small": "ortho_small.jpg",
            "slope_img": "slope.png", "risk_img": "risk.png",
            "stops": "stops.json", "curiosity_path": "curiosity_path.json", "conditions": "conditions.json",
        },
        "risk_model": {
            "slope_limit_deg": c.SLOPE_LIMIT_DEG,
            "description": (
                f"Estimated risk = slope / {c.SLOPE_LIMIT_DEG} deg x 100. Cells at or above {c.SLOPE_LIMIT_DEG} deg are impassable "
                f"(an assumption for suited walking). Slope is taken from the 1 m elevation model after {SMOOTH_SIGMA_M} m "
                f"Gaussian smoothing; each {f} m cell keeps its steepest value. Rocks and loose sand are not in the model yet."
            ),
        },
        "sources": [
            {"layer": "Elevation and slope", "mission": "Mars Reconnaissance Orbiter (stereo), tied to MGS MOLA",
             "instrument": "HiRISE, with CTX and HRSC where HiRISE stereo is missing",
             "product_id": "MSL_Gale_DEM_Mosaic_1m_v3 (USGS Astrogeology; Parker and Calef)",
             "resolution_m": 1, "url": c.DEM_PAGE,
             "cannot_see": "Features smaller than a few metres. Individual rocks and the crests of narrow ridges are smoothed out."},
            {"layer": "Orbital image", "mission": "Mars Reconnaissance Orbiter", "instrument": "HiRISE",
             "product_id": "MSL_Gale_HiRISE-LRGB_78quads_sharp_cog (USGS / JPL; Calef and Parker)",
             "resolution_m": 0.25, "url": c.ORTHO_PAGE,
             "cannot_see": "Rocks smaller than about 1 m. Loose sand cannot be told apart from firm ground. Shown here at 0.5 m per pixel."},
            {"layer": "Curiosity path and long-stay sites", "mission": "Mars Science Laboratory (Curiosity)",
             "instrument": "Rover localisation (waypoints)",
             "product_id": "MSL_waypoints.json (NASA/JPL-Caltech, MMGIS)",
             "resolution_m": 1, "url": c.WAYPOINTS_URL,
             "cannot_see": "Only where the rover stopped; the ground between waypoints is not recorded."},
        ],
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (c.APP / "grid.json").write_text(json.dumps(grid, indent=2), encoding="utf-8")
    for old in ["ortho.png", "ortho_small.png"]:
        (c.APP / old).unlink(missing_ok=True)

    share = (risk == RISK_IMPASSABLE).mean()
    print(f"grid {cols} x {rows}, impassable {share:.1%}, median slope {np.median(slope):.1f} deg, "
          f"{len(path)} Curiosity waypoints")


if __name__ == "__main__":
    main()
