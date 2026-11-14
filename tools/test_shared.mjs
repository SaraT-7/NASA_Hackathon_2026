// tools/test_shared.mjs — checks the shared modules against app_data/. Run from the repo root:
//   node tools/test_shared.mjs
import assert from 'node:assert/strict';
import { installFileFetch } from './node-fetch-files.mjs';
import * as data from '../shared/data.js';
import { buildRoute, returnTimeS, totalEvaS, nearestPointIndex } from '../shared/route.js';
import { speedMps, stepTimeS, formatDuration, ASSUMPTIONS } from '../shared/walk-model.js';
import { findPath } from './make_mock_route.mjs';

installFileFetch();
const grid = await data.loadGrid('app_data/');

// cells <-> metres round trip, including the four corners
for (const [col, row] of [[0, 0], [grid.cols - 1, 0], [0, grid.rows - 1], [grid.cols - 1, grid.rows - 1], [7, 3]]) {
  const { x, y } = data.cellCenter(grid, col, row);
  assert.deepEqual(data.xyToCell(grid, x, y), { col, row });
  assert.deepEqual(data.indexToCell(grid, data.cellIndex(grid, col, row)), { col, row });
}
assert.equal(data.xyToCell(grid, -1, 5), null);
assert.equal(data.xyToCell(grid, 5, grid.heightM + 1), null);
// row 0 is the north edge
assert.ok(data.cellCenter(grid, 0, 0).y > data.cellCenter(grid, 0, grid.rows - 1).y);
assert.deepEqual(data.latLngToXy({ lat: 12, lng: 34 }), { x: 34, y: 12 });
assert.deepEqual(data.xyToLatLng(34, 12), [12, 34]);

// walking model: flat is fastest region, steep is slower both ways
assert.ok(speedMps(0) > speedMps(0.3));
assert.ok(speedMps(0) > speedMps(-0.4));
assert.ok(Math.abs(stepTimeS(100, 0) - 100 / speedMps(0)) < 1e-9);
assert.equal(formatDuration(3900), '1 h 05 min');

// a real path between the habitat and the first stop
const { habitat, stops } = await data.loadJson(grid, 'stops');
const idx = (p) => {
  const c = data.xyToCell(grid, p.x, p.y);
  return data.cellIndex(grid, c.col, c.row);
};
const shortest = findPath(grid, idx(habitat), idx(stops[0]), 0);
const careful = findPath(grid, idx(habitat), idx(stops[0]), 8);
assert.ok(shortest && careful);
for (const cells of [shortest, careful]) {
  for (const c of cells) assert.ok(data.isPassable(grid, c), 'route crosses an impassable cell');
}
const a = buildRoute(grid, shortest, { name: 'Shortest', kind: 'shortest', weight: 0, stops: [stops[0]] });
const b = buildRoute(grid, careful, { name: 'Low risk', kind: 'low_risk', weight: 8, stops: [stops[0]] });
assert.ok(a.totals.distance_m <= b.totals.distance_m + 1e-6, 'shortest route must not be longer');
assert.ok(b.totals.mean_risk <= a.totals.mean_risk + 1e-6, 'low-risk route must not be riskier');
for (const r of [a, b]) {
  for (let i = 1; i < r.points.length; i++) {
    assert.ok(r.points[i].dist > r.points[i - 1].dist);
    assert.ok(r.points[i].time > r.points[i - 1].time);
  }
  assert.equal(r.stops[0].point_index, r.points.length - 1);
  assert.equal(returnTimeS(r, 0), 0);
  assert.ok(returnTimeS(r, r.points.length - 1) > 0);
  assert.ok(Math.abs(totalEvaS(r) - (r.totals.walk_s + ASSUMPTIONS.STOP_WORK_S + r.totals.return_s)) < 1e-6);
}
assert.equal(nearestPointIndex(a.points, a.points[5].x, a.points[5].y), 5);

console.log(`shared modules OK  (shortest ${Math.round(a.totals.distance_m)} m, risk ${a.totals.mean_risk.toFixed(1)};` +
  ` low risk ${Math.round(b.totals.distance_m)} m, risk ${b.totals.mean_risk.toFixed(1)})`);
