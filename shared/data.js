// shared/data.js — FROZEN shared module. Do not edit without team agreement (see docs/CONTRACT.md).
// Loads everything in app_data/ and converts between grid cells, local metres and Leaflet coordinates.
//
// Coordinate system (the whole app uses it):
//   x = metres east, y = metres north, (0, 0) = SOUTH-WEST corner of the area.
//   Grid: row 0 = NORTH edge, col 0 = WEST edge, index = row * cols + col.
//   Leaflet (L.CRS.Simple): latlng = [y, x].

export const RISK_NODATA = 254; // risk.bin: no data for this cell (unknown is NOT safe)
export const RISK_IMPASSABLE = 255; // risk.bin: never route through this cell
export const SLOPE_NODATA = 255; // slope.bin: no data

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return res.json();
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return res.arrayBuffer();
}

/**
 * Load the grid and its rasters.
 * @param {string} base  URL of the app_data folder, with trailing slash. From plan/ or walk/ use '../app_data/'.
 * @returns {Promise<Grid>} { meta, cols, rows, cellSize, widthM, heightM, risk, slope, elevation, base }
 */
export async function loadGrid(base = '../app_data/') {
  const meta = await fetchJson(base + 'grid.json');
  const n = meta.cols * meta.rows;
  const [riskBuf, slopeBuf, elevBuf] = await Promise.all([
    fetchBuffer(base + meta.files.risk),
    fetchBuffer(base + meta.files.slope),
    fetchBuffer(base + meta.files.elevation),
  ]);
  const grid = {
    meta,
    base,
    cols: meta.cols,
    rows: meta.rows,
    cellSize: meta.cell_size_m,
    widthM: meta.width_m,
    heightM: meta.height_m,
    risk: new Uint8Array(riskBuf),
    slope: new Uint8Array(slopeBuf),
    elevation: new Float32Array(elevBuf),
  };
  if (grid.risk.length !== n || grid.slope.length !== n || grid.elevation.length !== n) {
    throw new Error(`app_data rasters do not match grid.json (${meta.cols} x ${meta.rows})`);
  }
  return grid;
}

/** URL of a file listed in grid.json "files" (e.g. fileUrl(grid, 'ortho')). */
export function fileUrl(grid, key) {
  const name = grid.meta.files[key];
  if (!name) throw new Error(`grid.json has no file for "${key}"`);
  return grid.base + name;
}

/** Load one of the JSON files listed in grid.json "files": 'stops', 'curiosity_path', 'conditions'. */
export function loadJson(grid, key) {
  return fetchJson(fileUrl(grid, key));
}

export function cellIndex(grid, col, row) {
  return row * grid.cols + col;
}

export function indexToCell(grid, index) {
  return { col: index % grid.cols, row: Math.floor(index / grid.cols) };
}

/** Centre of a cell in local metres. */
export function cellCenter(grid, col, row) {
  return {
    x: (col + 0.5) * grid.cellSize,
    y: grid.heightM - (row + 0.5) * grid.cellSize,
  };
}

/** Cell containing a point in local metres, or null when the point is outside the area. */
export function xyToCell(grid, x, y) {
  const col = Math.floor(x / grid.cellSize);
  const row = Math.floor((grid.heightM - y) / grid.cellSize);
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null;
  return { col, row };
}

/** Local metres -> Leaflet latlng for L.CRS.Simple. */
export function xyToLatLng(x, y) {
  return [y, x];
}

/** Leaflet latlng (L.CRS.Simple) -> local metres. */
export function latLngToXy(latlng) {
  return { x: latlng.lng, y: latlng.lat };
}

/** Leaflet bounds of the whole area, for L.imageOverlay and map.fitBounds. */
export function mapBounds(grid) {
  return [
    [0, 0],
    [grid.heightM, grid.widthM],
  ];
}

/** Real Mars latitude / longitude of a local point, or null when grid.json has no georeference (mock data). */
export function xyToGeo(grid, x, y) {
  const g = grid.meta.georef;
  if (!g || g.sw_lat == null || g.sw_lon == null) return null;
  const deg = 180 / Math.PI;
  const lat = g.sw_lat + (y / g.radius_m) * deg;
  const lon = g.sw_lon + (x / (g.radius_m * Math.cos(g.sw_lat / deg))) * deg;
  return { lat, lon };
}

/** True when a route may pass through the cell. */
export function isPassable(grid, index) {
  return grid.risk[index] !== RISK_IMPASSABLE;
}

/** Risk 0-100 used for costs. Unknown cells count as the highest risk, never as safe. */
export function riskForCost(grid, index) {
  const r = grid.risk[index];
  return r === RISK_NODATA ? 100 : r;
}
