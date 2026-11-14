// tools/make_mock_route.mjs — writes app_data/mock_route.json so the walk view has a route before the
// planner exists. Run from the repo root after make_mock_data.py:   node tools/make_mock_route.mjs
//
// The path search below is a small reference A*. The planner (plan/) owns the real one.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installFileFetch, REPO } from './node-fetch-files.mjs';
import { loadGrid, loadJson, xyToCell, cellIndex, isPassable, riskForCost } from '../shared/data.js';
import { buildRoute } from '../shared/route.js';

/** A* over the grid, 8 neighbours. Step cost = distance x (1 + weight x risk / 100). */
export function findPath(grid, startIndex, goalIndex, weight) {
  const { cols, rows, cellSize } = grid;
  const n = cols * rows;
  const g = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = []; // binary heap of [f, index]
  const push = (f, i) => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  const gc = goalIndex % cols;
  const gr = Math.floor(goalIndex / cols);
  const h = (i) => Math.hypot((i % cols) - gc, Math.floor(i / cols) - gr) * cellSize;

  g[startIndex] = 0;
  push(h(startIndex), startIndex);
  while (heap.length) {
    const [, cur] = pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goalIndex) break;
    const c = cur % cols;
    const r = Math.floor(cur / cols);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const nb = nr * cols + nc;
        if (closed[nb] || !isPassable(grid, nb)) continue;
        const step = (dr && dc ? Math.SQRT2 : 1) * cellSize;
        const cost = g[cur] + step * (1 + (weight * riskForCost(grid, nb)) / 100);
        if (cost < g[nb]) {
          g[nb] = cost;
          came[nb] = cur;
          push(cost + h(nb), nb);
        }
      }
    }
  }
  if (!closed[goalIndex]) return null;
  const cells = [];
  for (let i = goalIndex; i !== -1; i = came[i]) cells.push(i);
  return cells.reverse();
}

async function main() {
  installFileFetch();
  const grid = await loadGrid('app_data/');
  const { habitat, stops } = await loadJson(grid, 'stops');
  const toIndex = (p) => {
    const cell = xyToCell(grid, p.x, p.y);
    return cellIndex(grid, cell.col, cell.row);
  };
  const weight = 8;
  let cells = [];
  let from = toIndex(habitat);
  for (const stop of stops) {
    const leg = findPath(grid, from, toIndex(stop), weight);
    if (!leg) throw new Error(`No path to ${stop.name}`);
    cells = cells.concat(cells.length ? leg.slice(1) : leg);
    from = toIndex(stop);
  }
  const route = buildRoute(grid, cells, { name: 'Demo route (mock)', kind: 'low_risk', weight, stops });
  route.mock = true;
  await writeFile(path.join(REPO, 'app_data', 'mock_route.json'), JSON.stringify(route));
  const t = route.totals;
  console.log(`mock_route.json: ${route.points.length} points, ${Math.round(t.distance_m)} m, max slope ${t.max_slope_deg} deg`);
}

if (process.argv[1] && process.argv[1].endsWith('make_mock_route.mjs')) main();
