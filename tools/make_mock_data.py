"""Generate MOCK app_data/ in exactly the format described in docs/CONTRACT.md.

The terrain is invented (a tilted plain crossed by boxwork-like ridges). It exists only so that
plan/ and walk/ can be built before the real NASA data is ready. Every file is marked "mock": true.

Run from the repo root:   python tools/make_mock_data.py
Then:                     node tools/make_mock_route.mjs
"""
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "app_data"
CELL = 2  # metres per cell
COLS = ROWS = 500  # 1 km x 1 km
RISK_NODATA, RISK_IMPASSABLE, SLOPE_NODATA = 254, 255, 255
SLOPE_LIMIT_DEG = 30  # assumption: steeper cells are impassable in a suit


def terrain(rng):
    """Elevation in metres: a tilted plain plus a lattice of low ridges (the mock boxwork)."""
    y, x = np.mgrid[0:ROWS, 0:COLS].astype(np.float64) * CELL
    z = -4100 + 0.03 * x + 0.05 * (ROWS * CELL - y)
    z += 3 * np.sin(x / 180) * np.cos(y / 140)
    for _ in range(34):  # each ridge is a line segment with a Gaussian cross-section
        angle = rng.uniform(0, np.pi)
        cx, cy = rng.uniform(0, COLS * CELL), rng.uniform(0, ROWS * CELL)
        across = (x - cx) * np.cos(angle) + (y - cy) * np.sin(angle)
        along = -(x - cx) * np.sin(angle) + (y - cy) * np.cos(angle)
        length = rng.uniform(90, 260)
        z += rng.uniform(1.0, 3.6) * np.exp(-(across / rng.uniform(3, 6)) ** 2) * np.exp(-(along / length) ** 4)
    z += 12 * np.exp(-(((x - 760) / 70) ** 2 + ((y - 300) / 90) ** 2))  # a steep butte
    return z


def slope_deg(z):
    gy, gx = np.gradient(z, CELL)
    return np.degrees(np.arctan(np.hypot(gx, gy)))


def colourise(values, stops):
    """Map 0..1 values through colour stops [(pos, (r, g, b, a)), ...] to an RGBA image array."""
    out = np.zeros(values.shape + (4,), dtype=np.float64)
    pos = [p for p, _ in stops]
    for ch in range(4):
        out[..., ch] = np.interp(values, pos, [c[ch] for _, c in stops])
    return out.astype(np.uint8)


def main():
    rng = np.random.default_rng(7)
    OUT.mkdir(exist_ok=True)
    (OUT / "photos").mkdir(exist_ok=True)

    z = terrain(rng)
    slope = slope_deg(z)

    risk = np.clip(np.round(slope / SLOPE_LIMIT_DEG * 100), 0, 100).astype(np.uint8)
    risk[slope >= SLOPE_LIMIT_DEG] = RISK_IMPASSABLE
    for _ in range(40):  # mock boulders
        r, c = rng.integers(20, ROWS - 20), rng.integers(20, COLS - 20)
        risk[r - 1 : r + 2, c - 1 : c + 2] = RISK_IMPASSABLE
    risk[60:120, 380:450] = RISK_NODATA  # a patch with no data: unknown, not safe

    slope_u8 = np.clip(np.round(slope), 0, 90).astype(np.uint8)
    z32 = z.astype("<f4")
    z32[60:120, 380:450] = np.nan
    slope_u8[60:120, 380:450] = SLOPE_NODATA

    risk.tofile(OUT / "risk.bin")
    slope_u8.tofile(OUT / "slope.bin")
    z32.tofile(OUT / "elevation.bin")

    # Mock "satellite photo": a hillshade, at 1 m/pixel (twice the grid resolution).
    gy, gx = np.gradient(z, CELL)
    shade = np.clip(0.55 - 2.2 * (gx * 0.7 - gy * 0.7), 0, 1)
    tone = (70 + 150 * shade).astype(np.uint8)
    ortho = np.stack([tone, (tone * 0.78).astype(np.uint8), (tone * 0.62).astype(np.uint8)], axis=-1)
    Image.fromarray(ortho).resize((COLS * 2, ROWS * 2), Image.BICUBIC).save(OUT / "ortho.png")
    Image.fromarray(ortho).save(OUT / "ortho_small.png")

    slope_rgba = colourise(
        np.clip(slope / 35, 0, 1),
        [(0, (255, 255, 204, 0)), (0.3, (254, 217, 118, 150)), (0.6, (253, 141, 60, 200)), (1, (189, 0, 38, 230))],
    )
    slope_rgba[slope_u8 == SLOPE_NODATA] = (120, 120, 120, 170)
    Image.fromarray(slope_rgba).save(OUT / "slope.png")

    risk_rgba = colourise(
        np.clip(risk.astype(np.float64) / 100, 0, 1),
        [(0, (26, 152, 80, 0)), (0.35, (166, 217, 106, 140)), (0.65, (253, 174, 97, 200)), (1, (215, 48, 39, 230))],
    )
    risk_rgba[risk == RISK_IMPASSABLE] = (90, 0, 20, 240)
    risk_rgba[risk == RISK_NODATA] = (120, 120, 120, 170)
    Image.fromarray(risk_rgba).save(OUT / "risk.png")

    grid = {
        "version": 1,
        "mock": True,
        "name": "MOCK terrain (not Mars data)",
        "cell_size_m": CELL,
        "cols": COLS,
        "rows": ROWS,
        "width_m": COLS * CELL,
        "height_m": ROWS * CELL,
        "georef": {"sw_lat": None, "sw_lon": None, "radius_m": 3396190, "note": "mock data has no real location"},
        "files": {
            "risk": "risk.bin",
            "slope": "slope.bin",
            "elevation": "elevation.bin",
            "ortho": "ortho.png",
            "ortho_small": "ortho_small.png",
            "slope_img": "slope.png",
            "risk_img": "risk.png",
            "stops": "stops.json",
            "curiosity_path": "curiosity_path.json",
            "conditions": "conditions.json",
        },
        "risk_model": {
            "slope_limit_deg": SLOPE_LIMIT_DEG,
            "description": "risk = slope / slope_limit x 100; cells at or above the limit and boulders are impassable",
        },
        "sources": [
            {
                "layer": "Elevation and slope",
                "mission": "MOCK",
                "instrument": "MOCK",
                "product_id": "MOCK",
                "resolution_m": CELL,
                "url": None,
                "cannot_see": "Mock terrain. Replace with the real source and what it cannot resolve.",
            }
        ],
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (OUT / "grid.json").write_text(json.dumps(grid, indent=2), encoding="utf-8")

    stops = {
        "mock": True,
        "habitat": {"id": "habitat", "name": "Habitat (hypothetical)", "x": 120, "y": 140},
        "stops": [
            {"id": "s1", "name": "Ridge junction", "type": "science", "x": 380, "y": 420,
             "description": "Three ridges meet: sample the ridge crest.", "photo": None},
            {"id": "s2", "name": "Sandy hollow", "type": "science", "x": 560, "y": 700,
             "description": "Hollow between ridges: sample the floor.", "photo": None},
            {"id": "s3", "name": "Butte foot", "type": "science", "x": 700, "y": 520,
             "description": "Layered outcrop at the foot of the butte.", "photo": None},
        ],
    }
    (OUT / "stops.json").write_text(json.dumps(stops, indent=2), encoding="utf-8")

    t = np.linspace(0, 1, 60)
    path = {
        "mock": True,
        "points": [
            {"x": round(float(100 + 760 * u + 40 * np.sin(u * 9)), 1),
             "y": round(float(120 + 700 * u + 60 * np.sin(u * 5)), 1),
             "sol": int(4534 + 200 * u)}
            for u in t
        ],
    }
    (OUT / "curiosity_path.json").write_text(json.dumps(path), encoding="utf-8")

    conditions = {
        "mock": True,
        "note": "Last archived measurements, not real time.",
        "items": [
            {"id": "radiation", "label": "Surface radiation dose rate", "value": 0.67, "unit": "mSv/day",
             "measured": "MOCK", "instrument": "MSL RAD", "source_url": None},
            {"id": "pressure", "label": "Air pressure", "value": 850, "unit": "Pa",
             "measured": "MOCK", "instrument": "MSL REMS", "source_url": None},
            {"id": "air_temp_max", "label": "Air temperature, daily max", "value": -10, "unit": "°C",
             "measured": "MOCK", "instrument": "MSL REMS", "source_url": None},
            {"id": "air_temp_min", "label": "Air temperature, daily min", "value": -75, "unit": "°C",
             "measured": "MOCK", "instrument": "MSL REMS", "source_url": None},
        ],
    }
    (OUT / "conditions.json").write_text(json.dumps(conditions, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Mock app_data written to {OUT}")


if __name__ == "__main__":
    main()
