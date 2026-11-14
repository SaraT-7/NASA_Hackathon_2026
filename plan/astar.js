// plan/astar.js — 8-connected A* pathfinding over the grid for the planner.
// Step cost = distance * (1 + weight * riskForCost(grid, index) / 100).
// Never traverses impassable cells (!isPassable(grid, index)).

import { isPassable, riskForCost, xyToCell, cellIndex } from '../shared/data.js';

/**
 * Find an optimal cell path from startIndex to goalIndex on the grid.
 * @param {Grid} grid          loaded from loadGrid()
 * @param {number} startIndex  starting cell index (row * cols + col)
 * @param {number} goalIndex   target cell index (row * cols + col)
 * @param {number} weight      risk penalty weight (0 = shortest, 8 = lowest estimated risk)
 * @returns {number[] | null}  array of cell indices from startIndex to goalIndex inclusive, or null if unreachable
 */
export function findPath(grid, startIndex, goalIndex, weight) {
  const { cols, rows, cellSize } = grid;
  if (startIndex < 0 || goalIndex < 0 || startIndex >= cols * rows || goalIndex >= cols * rows) {
    return null;
  }
  if (!isPassable(grid, startIndex) || !isPassable(grid, goalIndex)) {
    return null;
  }
  if (startIndex === goalIndex) {
    return [startIndex];
  }

  const n = cols * rows;
  const g = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);

  // Typed-array binary min-heap for fast search even on 1000x1000 grids
  const heapF = new Float64Array(n);
  const heapIdx = new Int32Array(n);
  let heapLen = 0;

  const push = (f, i) => {
    let k = heapLen++;
    heapF[k] = f;
    heapIdx[k] = i;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heapF[p] <= heapF[k]) break;
      const tf = heapF[p];
      const ti = heapIdx[p];
      heapF[p] = heapF[k];
      heapIdx[p] = heapIdx[k];
      heapF[k] = tf;
      heapIdx[k] = ti;
      k = p;
    }
  };

  const pop = () => {
    const topIdx = heapIdx[0];
    heapLen--;
    if (heapLen > 0) {
      heapF[0] = heapF[heapLen];
      heapIdx[0] = heapIdx[heapLen];
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heapLen && heapF[l] < heapF[m]) m = l;
        if (r < heapLen && heapF[r] < heapF[m]) m = r;
        if (m === k) break;
        const tf = heapF[m];
        const ti = heapIdx[m];
        heapF[m] = heapF[k];
        heapIdx[m] = heapIdx[k];
        heapF[k] = tf;
        heapIdx[k] = ti;
        k = m;
      }
    }
    return topIdx;
  };

  const gc = goalIndex % cols;
  const gr = Math.floor(goalIndex / cols);
  const h = (i) => Math.hypot((i % cols) - gc, Math.floor(i / cols) - gr) * cellSize;

  g[startIndex] = 0;
  push(h(startIndex), startIndex);

  while (heapLen > 0) {
    const cur = pop();
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

/**
 * Convert a point {x, y} in local metres to its grid cell index, or null if out of bounds.
 */
export function pointToIndex(grid, p) {
  const cell = xyToCell(grid, p.x, p.y);
  if (!cell) return null;
  return cellIndex(grid, cell.col, cell.row);
}

/**
 * Find a multi-stop path starting at habitat and visiting stops in order.
 * @returns {{ ok: true, cells: number[] } | { ok: false, failedStop: object }}
 */
export function findMultiStopPath(grid, habitat, stops, weight) {
  const startIdx = pointToIndex(grid, habitat);
  if (startIdx == null) return { ok: false, failedStop: habitat };

  let cells = [];
  let from = startIdx;
  for (const stop of stops) {
    const goalIdx = pointToIndex(grid, stop);
    if (goalIdx == null) return { ok: false, failedStop: stop };
    const leg = findPath(grid, from, goalIdx, weight);
    if (!leg) return { ok: false, failedStop: stop };
    cells = cells.concat(cells.length ? leg.slice(1) : leg);
    from = goalIdx;
  }
  return { ok: true, cells };
}
