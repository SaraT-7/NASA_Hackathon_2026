// shared/route.js — FROZEN shared module. Do not edit without team agreement (see docs/CONTRACT.md).
// The route object is the ONLY thing the planner (plan/) hands to the walk view (walk/).
// plan/ builds it with buildRoute() and stores it with saveRoute(); walk/ reads it with loadRoute().

import { cellCenter, indexToCell, RISK_NODATA, SLOPE_NODATA } from './data.js';
import { ASSUMPTIONS, stepTimeS } from './walk-model.js';

export const ROUTE_VERSION = 1;
export const ROUTE_KEY = 'marswalk.route.v1';

/**
 * Turn a path of grid cells into a route object.
 * @param {Grid} grid          from loadGrid()
 * @param {number[]} cells     cell indices (row * cols + col) from start to end, each next to the previous
 * @param {object} opts
 * @param {string} opts.name   label shown to the user, e.g. 'Lowest estimated risk'
 * @param {string} opts.kind   'shortest' | 'low_risk'
 * @param {number} opts.weight risk weight used by the path search
 * @param {Array<{id:string,name:string,x:number,y:number}>} [opts.stops] science stops, in visiting order
 * @returns {Route}
 */
export function buildRoute(grid, cells, opts) {
  if (!cells || cells.length < 2) throw new Error('A route needs at least two cells');
  const points = [];
  let dist = 0;
  let time = 0;
  let ascent = 0;
  let descent = 0;
  let maxSlope = 0;
  let riskSum = 0;
  let riskCount = 0;
  let nodata = 0;

  for (let i = 0; i < cells.length; i++) {
    const index = cells[i];
    const { col, row } = indexToCell(grid, index);
    const { x, y } = cellCenter(grid, col, row);
    const elevRaw = grid.elevation[index];
    const elev = Number.isFinite(elevRaw) ? elevRaw : null;
    const slopeRaw = grid.slope[index];
    const slope = slopeRaw === SLOPE_NODATA ? null : slopeRaw;
    const riskRaw = grid.risk[index];
    const risk = riskRaw === RISK_NODATA ? null : riskRaw;

    if (i > 0) {
      const prev = points[i - 1];
      const step = Math.hypot(x - prev.x, y - prev.y);
      const dz = elev != null && prev.elev != null ? elev - prev.elev : 0;
      dist += step;
      time += stepTimeS(step, dz);
      if (dz > 0) ascent += dz;
      else descent -= dz;
    }
    if (slope != null && slope > maxSlope) maxSlope = slope;
    if (risk == null) nodata++;
    else {
      riskSum += risk;
      riskCount++;
    }
    points.push({ x, y, elev, slope, risk, dist, time });
  }

  const stops = (opts.stops || []).map((s) => ({
    id: s.id,
    name: s.name,
    x: s.x,
    y: s.y,
    point_index: nearestPointIndex(points, s.x, s.y),
  }));

  return {
    version: ROUTE_VERSION,
    mock: Boolean(grid.meta.mock),
    grid_name: grid.meta.name,
    name: opts.name,
    kind: opts.kind,
    weight: opts.weight,
    created: new Date().toISOString(),
    points,
    stops,
    totals: {
      distance_m: dist,
      walk_s: time,
      work_s: stops.length * ASSUMPTIONS.STOP_WORK_S,
      return_s: returnTimeS({ points }, points.length - 1),
      max_slope_deg: maxSlope,
      ascent_m: ascent,
      descent_m: descent,
      mean_risk: riskCount ? riskSum / riskCount : null,
      nodata_cells: nodata,
    },
  };
}

/** Index of the route point closest to a local-metre position. */
export function nearestPointIndex(points, x, y) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = (points[i].x - x) ** 2 + (points[i].y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Seconds needed to walk back to the start (the habitat) along the same path, from a given point.
 * Includes the return safety margin (ASSUMPTIONS.RETURN_FACTOR).
 */
export function returnTimeS(route, fromIndex) {
  const p = route.points;
  let t = 0;
  for (let i = fromIndex; i > 0; i--) {
    const step = p[i].dist - p[i - 1].dist;
    const dz = p[i].elev != null && p[i - 1].elev != null ? p[i - 1].elev - p[i].elev : 0;
    t += stepTimeS(step, dz);
  }
  return t * ASSUMPTIONS.RETURN_FACTOR;
}

/** Total planned Marswalk time: walk out, work at the stops, walk back. */
export function totalEvaS(route) {
  const t = route.totals;
  return t.walk_s + t.work_s + t.return_s;
}

/** Store the chosen route for the walk view (same browser, same device). */
export function saveRoute(route) {
  try {
    localStorage.setItem(ROUTE_KEY, JSON.stringify(route));
    return true;
  } catch (err) {
    console.warn('Could not save the route', err);
    return false;
  }
}

/** Route chosen in the planner, or null when there is none. */
export function loadRoute() {
  try {
    const raw = localStorage.getItem(ROUTE_KEY);
    if (!raw) return null;
    const route = JSON.parse(raw);
    return route && route.version === ROUTE_VERSION ? route : null;
  } catch (err) {
    return null;
  }
}

/** Demo route shipped in app_data/, so the walk view works before the planner exists. */
export async function loadMockRoute(base = '../app_data/') {
  const res = await fetch(base + 'mock_route.json');
  if (!res.ok) throw new Error(`Could not load mock_route.json (${res.status})`);
  return res.json();
}
