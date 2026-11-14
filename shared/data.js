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

/**
 * Data layers on top of slope (docs/CONTRACT.md, grid.json "layers"). Loads each layer's 0-100 cell scores and the
 * slope-only risk, so the planner can switch layers on and off and rebuild the risk with combineRisk().
 * Adds to the grid: riskAll (risk.bin, all layers on), riskSlope (slope only, or null), layerScores { id: Uint8Array }.
 * @returns {Promise<object[]>} grid.meta.layers (empty list if the data has no layers)
 */
export async function loadLayers(grid) {
  const layers = grid.meta.layers || [];
  grid.riskAll = grid.risk;
  grid.riskSlope = grid.meta.files.risk_slope
    ? new Uint8Array(await fetchBuffer(grid.base + grid.meta.files.risk_slope))
    : null;
  grid.layerScores = {};
  for (const layer of layers) {
    grid.layerScores[layer.id] = new Uint8Array(await fetchBuffer(grid.base + layer.bin));
  }
  return layers;
}

/**
 * Risk with only the chosen layers switched on:
 * risk = clamp(round(slope risk + sum(weight x layer / 100)), 0, 100). Impassable (255) and no-data (254) cells stay
 * as they are; layers never open a closed cell. With every layer on this equals risk.bin.
 * Use it as `grid.risk = combineRisk(grid, ids)` before searching for routes. Call loadLayers() first.
 * @param {string[]} enabledIds  ids from grid.meta.layers
 * @returns {Uint8Array}
 */
export function combineRisk(grid, enabledIds) {
  if (!grid.riskSlope) return grid.riskAll || grid.risk;
  const on = (grid.meta.layers || []).filter((l) => enabledIds.includes(l.id));
  const out = new Uint8Array(grid.riskSlope.length);
  for (let i = 0; i < out.length; i++) {
    const base = grid.riskSlope[i];
    if (base === RISK_IMPASSABLE || base === RISK_NODATA) {
      out[i] = base;
      continue;
    }
    let r = base;
    for (const l of on) r += (l.weight * grid.layerScores[l.id][i]) / 100;
    out[i] = Math.min(100, Math.max(0, Math.round(r)));
  }
  return out;
}
