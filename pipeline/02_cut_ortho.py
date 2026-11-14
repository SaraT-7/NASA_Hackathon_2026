"""Step 2: read the AOI from the USGS/JPL Gale HiRISE colour mosaic (a cloud-optimised GeoTIFF, 25 cm/pixel).

Only the tiles that cover the AOI are downloaded (a few MB). Output: data/work/ortho_rgb_050cm.npy,
an RGB array at 0.5 m/pixel (4000 x 4000 for the 2 km AOI).

    python pipeline/02_cut_ortho.py
"""
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import from_bounds

import config as c

c.WORK.mkdir(parents=True, exist_ok=True)
size = c.AOI_SIZE_M * 2
with rasterio.Env(**c.GDAL_ENV), rasterio.open("/vsicurl/" + c.ORTHO_COLOR_URL) as ds:
    win = from_bounds(c.AOI_WEST, c.AOI_SOUTH, c.AOI_EAST, c.AOI_NORTH, ds.transform)
    rgb = ds.read(window=win, out_shape=(3, size, size), resampling=Resampling.average)
np.save(c.WORK / "ortho_rgb_050cm.npy", rgb)
print(f"ortho: {rgb.shape}, {(rgb.sum(0) == 0).mean():.2%} empty pixels")
