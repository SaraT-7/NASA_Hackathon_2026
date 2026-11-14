"""Step 1: cut the AOI out of the USGS Gale 1 m elevation mosaic, straight from the web.

The mosaic is a 3.6 GB GeoTIFF stored one image row per strip, so every AOI row costs one full-width
strip download (about 15 s per 100 rows). The script downloads in chunks and can be re-run: finished
chunks are kept in data/work/dem_chunks/ and skipped.

    python pipeline/01_cut_dem.py [seconds]     # optional time budget for this run

Output: data/raw/aoi_dem_1m.tif (float32 metres, same projection as the source).
"""
import sys
import time

import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.windows import Window

import config as c

CHUNK = 100
budget = float(sys.argv[1]) if len(sys.argv) > 1 else 1e9
chunks = c.WORK / "dem_chunks"
chunks.mkdir(parents=True, exist_ok=True)
c.RAW.mkdir(parents=True, exist_ok=True)
start = time.time()
todo = [r for r in range(0, c.AOI_SIZE_M, CHUNK) if not (chunks / f"rows_{r:04d}.npy").exists()]

if todo:
    with rasterio.Env(**c.GDAL_ENV), rasterio.open("/vsicurl/" + c.DEM_URL) as ds:
        for r in todo:
            if time.time() - start > budget:
                break
            win = Window(c.AOI_COL_OFF, c.AOI_ROW_OFF + r, c.AOI_SIZE_M, CHUNK)
            np.save(chunks / f"rows_{r:04d}.npy", ds.read(1, window=win))
            print(f"rows {r}-{r + CHUNK - 1} done ({time.time() - start:.0f} s)", flush=True)

left = [r for r in range(0, c.AOI_SIZE_M, CHUNK) if not (chunks / f"rows_{r:04d}.npy").exists()]
if left:
    print(f"{len(left)} chunks still to download; run the script again")
    sys.exit(2)

dem = np.vstack([np.load(chunks / f"rows_{r:04d}.npy") for r in range(0, c.AOI_SIZE_M, CHUNK)])
with rasterio.Env(**c.GDAL_ENV), rasterio.open("/vsicurl/" + c.DEM_URL) as ds:
    crs, nodata = ds.crs, ds.nodata
profile = dict(driver="GTiff", height=dem.shape[0], width=dem.shape[1], count=1, dtype="float32", crs=crs,
               transform=from_origin(c.AOI_WEST, c.AOI_NORTH, 1, 1), nodata=nodata, compress="deflate", tiled=True)
with rasterio.open(c.RAW / "aoi_dem_1m.tif", "w", **profile) as out:
    out.write(dem, 1)
valid = dem[dem != nodata]
print(f"aoi_dem_1m.tif written: {dem.shape}, elevation {valid.min():.1f} to {valid.max():.1f} m, "
      f"{(dem == nodata).sum()} no-data cells")
