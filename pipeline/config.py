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
TRAVERSE_URL = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json"

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
SLOPE_LIMIT_DEG = 20  # cells this steep or steeper are impassable. NASA xEVA suit capability: walking on slopes of up to
# 20 degrees (EVA-EXP-0075, written for lunar missions). See docs/CONTRACT.md, section 6.

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


# Data layers on top of slope (step 6, pipeline/06_layers.py) --------------------------------------------
# Combined risk = slope / SLOPE_LIMIT_DEG x 100 + sum(weight x layer / 100), clipped to 0..100 (docs/CONTRACT.md).
# Weights are our planning choice, not measurements; the app shows them as assumptions.
LAYER_WEIGHTS = {
    "curiosity": -20,  # ground a rover has already driven on: proven firm, so up to 20 risk points lower
    "comm": 20,  # no radio line of sight to the habitat: 20 risk points higher
    "boxwork": 15,  # stepping over a boxwork ridge (1-2 m high): 15 risk points higher on the ridge
    "sky": 0,  # radiation shelter: map only. Over a walk of a few hours the dose difference is tiny, and pulling
    # routes to the foot of cliffs would add rockfall risk; its use is finding shelter in a solar storm.
}
CURIOSITY_TRACK_HALF_WIDTH_M = 3  # rover is ~3 m wide; +/- 3 m also covers track localisation error
HABITAT_ANTENNA_M = 3  # assumed mast height of the habitat's radio antenna
SUIT_ANTENNA_M = 2  # suit radio antenna above the ground (helmet / backpack height)
BOXWORK_RIDGE_THRESHOLD = 0.5  # Sato line strength on the contrast-normalised image that counts as a ridge
BOXWORK_WINDOW_SIGMA_M = 20  # Gaussian window (sigma, m) for ridge density and direction spread
BOXWORK_ZONE_THRESHOLD = 0.3  # zone score above which ground counts as boxwork terrain
SKY_OBSERVER_M = 1.5  # height of the astronaut's body above the ground for the sky view
SKY_MAX_DIST_M = 800  # terrain this far away is checked for blocking the sky
SKY_AZIMUTHS = 24  # horizon directions
SKY_SHELTER_MIN = 0.15  # share of the sky blocked from which a cell counts as sheltered
RAD_BUTTE_SKY_BLOCKED = 0.19  # MSL RAD at Butte M12, Murray Buttes, sols 1456-1467: sky blocked ...
RAD_BUTTE_DOSE_DROP = 0.04  # ... and dose rate decrease (Ehresmann et al. 2021, doi:10.1029/2021JE006851)
