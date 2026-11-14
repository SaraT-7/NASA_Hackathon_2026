"""Shared settings for the data pipeline (work stream A).

Area of interest (AOI): a 2 km x 2 km square on Mount Sharp, Gale Crater, centred on the part of the
boxwork terrain that the Curiosity rover drove through from sol 4534 (May 2025) onwards.

All coordinates are in the projection of the USGS Gale mosaics: Mars equirectangular, centre longitude 0,
sphere radius 3,396,190 m (metres east / metres north). The rover waypoint file uses the same projection.
"""
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
RAW = REPO / "data" / "raw"
WORK = REPO / "data" / "work"
APP = REPO / "app_data"

MARS_RADIUS_M = 3396190.0

# Sources -----------------------------------------------------------------------------------------
DEM_URL = "https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif"
DEM_PAGE = "https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m"
ORTHO_COLOR_URL = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif"
ORTHO_PAGE = "https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm"
WAYPOINTS_URL = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json"

# AOI, aligned to the 1 m pixel grid of the DEM mosaic -----------------------------------------------
DEM_LEFT = 8127993.492786024  # easting of the west edge of the DEM mosaic
DEM_TOP = -244781.075189438  # northing of the north edge of the DEM mosaic
AOI_COL_OFF = 14257  # first DEM column of the AOI
AOI_ROW_OFF = 39019  # first DEM row of the AOI (row 0 = north)
AOI_SIZE_M = 2000  # the AOI is AOI_SIZE_M x AOI_SIZE_M metres

AOI_WEST = DEM_LEFT + AOI_COL_OFF
AOI_NORTH = DEM_TOP - AOI_ROW_OFF
AOI_EAST = AOI_WEST + AOI_SIZE_M
AOI_SOUTH = AOI_NORTH - AOI_SIZE_M

CELL_M = 2  # grid cell size used by the web app
SLOPE_LIMIT_DEG = 30  # ASSUMPTION: cells this steep or steeper are impassable in a suit

GDAL_ENV = dict(
    GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
    CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
    GDAL_HTTP_MAX_RETRY="4",
    GDAL_HTTP_RETRY_DELAY="2",
    GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES",
)


def to_local(easting, northing):
    """Projected metres -> local metres (x east, y north, origin at the AOI's south-west corner)."""
    return easting - AOI_WEST, northing - AOI_SOUTH


def to_lonlat(easting, northing):
    """Projected metres -> (east longitude, latitude) in degrees. Equirectangular, standard parallel 0."""
    import math

    return math.degrees(easting / MARS_RADIUS_M), math.degrees(northing / MARS_RADIUS_M)
