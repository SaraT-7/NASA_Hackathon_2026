// plan/plan.js — planning screen (work stream B).
import {
  loadGrid,
  loadJson,
  fileUrl,
  mapBounds,
  xyToLatLng,
  latLngToXy,
  xyToCell,
  cellCenter,
  cellIndex,
  isPassable,
  RISK_IMPASSABLE,
  loadLayers,
  combineRisk,
} from '../shared/data.js';
import { buildRoute, saveRoute, totalEvaS } from '../shared/route.js';
import { ASSUMPTIONS, ASSUMPTION_NOTES, formatDuration } from '../shared/walk-model.js';
import { findMultiStopPath } from './astar.js';
import { createTerrain3D } from './terrain3d.js';

const statusEl = document.getElementById('status');
const demoBadgeEl = document.getElementById('demo-badge');
const habitatNameEl = document.getElementById('habitat-name');
const stopsListEl = document.getElementById('stops-list');
const clearStopsBtn = document.getElementById('clear-stops-btn');
const customStopNameEl = document.getElementById('custom-stop-name');
const addStopBtn = document.getElementById('add-stop-btn');
const addStopHintEl = document.getElementById('add-stop-hint');
const reportObstacleBtn = document.getElementById('report-obstacle-btn');
const clearObstaclesBtn = document.getElementById('clear-obstacles-btn');
const obstacleHintEl = document.getElementById('obstacle-hint');
const toggleRiskLayerEl = document.getElementById('toggle-risk-layer');
const riskMapNoteEl = document.getElementById('risk-map-note');
const toggleSlopeLayerEl = document.getElementById('toggle-slope-layer');
const dataLayersWrapEl = document.getElementById('data-layers-wrap');
const dataLayersListEl = document.getElementById('data-layers-list');
const map2dEl = document.getElementById('map');
const map3dEl = document.getElementById('map3d');
const btnView2dEl = document.getElementById('btn-view-2d');
const btnView3dEl = document.getElementById('btn-view-3d');
const controls3dEl = document.getElementById('controls-3d');
const zScaleSliderEl = document.getElementById('z-scale-slider');
const zScaleValEl = document.getElementById('z-scale-val');
const btnReset3dEl = document.getElementById('btn-reset-3d');
const routeAlertEl = document.getElementById('route-alert');
const routesContainerEl = document.getElementById('routes-container');
const routeRationaleEl = document.getElementById('route-rationale');
const startWalkBtn = document.getElementById('start-walk-btn');
const profileWrapEl = document.getElementById('profile-wrap');
const profileSvgEl = document.getElementById('profile-svg');
const profileRouteLabelEl = document.getElementById('profile-route-label');
const profileHoverInfoEl = document.getElementById('profile-hover-info');
const conditionsMockTagEl = document.getElementById('conditions-mock-tag');
const conditionsNoteEl = document.getElementById('conditions-note');
const conditionsListEl = document.getElementById('conditions-list');
const sourcesListEl = document.getElementById('sources-list');
const layersLimitsSectionEl = document.getElementById('layers-limits-section');
const layersLimitsListEl = document.getElementById('layers-limits-list');
const riskModelBoxEl = document.getElementById('risk-model-box');
const assumptionsListEl = document.getElementById('assumptions-list');

// Route colours live in plan.css so the map, the cards and the profile always agree.
const rootStyle = getComputedStyle(document.documentElement);
const cssVar = (name) => rootStyle.getPropertyValue(name).trim();
const ROUTE_STYLE = {
  low_risk: { color: cssVar('--route-low-risk'), dash: null },
  shortest: { color: cssVar('--route-shortest'), dash: '7 7' },
};
const CASING_COLOR = cssVar('--bg');
const DANGER_COLOR = cssVar('--danger') || '#ff9488';
const ROUTE_ORDER = ['low_risk', 'shortest'];

const PROFILE_HINT = 'Hover the chart to see the point on the map.';
const OBSTACLE_DEFAULT_HINT = 'Mark impassable ground on the map to recompute routes around it.';
const OBSTACLE_ACTIVE_HINT = 'Click on the map to mark an impassable obstacle (16 m radius).';
const OBSTACLE_RADIUS_M = 16;

let grid = null;
let initialRiskCopy = null;
let reachableMask = null;
let dataLayers = [];
let enabledLayerIds = [];
const dataLayerOverlays = new Map();

// User-reported obstacles: [{ id, x, y, radiusM, cells: number[] }]
let reportedObstacles = [];
let nextObstacleId = 1;
let isReportingObstacle = false;

let habitat = null;
let allStops = [];
let nextCustomStopId = 1;
let isAddingStop = false;
// Ordered array of selected stop IDs (selection order = visiting order)
let selectedStopIds = [];

// Currently computed routes and selected route kind ('low_risk' | 'shortest')
let currentRoutes = { shortest: null, low_risk: null };
let currentCells = { shortest: null, low_risk: null };
let selectedRouteKind = 'low_risk';

let map = null;
let riskOverlay = null;
let terrain3d = null;
let viewMode = '2d'; // '2d' | '3d'
let routeLayerGroup = null;
let obstacleLayerGroup = null;
let hoverMapMarker = null;
const stopMarkers = new Map();

/** Create an element with a class and text. */
function h(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** "−4,068 m" style text: thousands separator and a real minus sign. */
function formatMetres(value) {
  return `${Math.round(value).toLocaleString('en-US').replace('-', '−')} m`;
}

/** Format signed weight, e.g. -20 -> "−20", +15 -> "+15". */
function formatSignedWeight(w) {
  if (w < 0) return `−${Math.abs(w)}`;
  if (w > 0) return `+${w}`;
  return '0';
}

/** Round tick values (1, 2, 5 × 10ⁿ steps) inside [min, max]. */
function niceTicks(min, max, target) {
  const raw = (max - min) / target;
  if (!(raw > 0)) return [min];
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) ticks.push(v);
  return ticks;
}

function terrainSummary() {
  return `${grid.meta.name}, ${grid.widthM} × ${grid.heightM} m at ${grid.cellSize} m per cell`;
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('is-error', isError);
}

function setViewMode(mode) {
  viewMode = mode;
  const is3d = mode === '3d';
  btnView2dEl.setAttribute('aria-pressed', String(!is3d));
  btnView3dEl.setAttribute('aria-pressed', String(is3d));
  map2dEl.hidden = is3d;
  controls3dEl.hidden = !is3d;
  if (terrain3d) {
    terrain3d.setVisible(is3d);
  }
  if (!is3d && map) {
    map.invalidateSize();
  }
}

function getSelectedStops() {
  return selectedStopIds.map((id) => allStops.find((s) => s.id === id)).filter(Boolean);
}

function toggleStop(stopId) {
  const idx = selectedStopIds.indexOf(stopId);
  if (idx >= 0) {
    selectedStopIds.splice(idx, 1);
  } else {
    selectedStopIds.push(stopId);
  }
  renderStopsUI();
  recomputeRoutes();
}

function selectRouteKind(kind) {
  if (!currentRoutes[kind]) return;
  selectedRouteKind = kind;
  drawRouteLines();
  if (terrain3d) terrain3d.setRoutes(currentRoutes, selectedRouteKind);
  renderRouteCards();
  renderElevationProfile();
}

function stopIcon(order) {
  const selected = order >= 0;
  const size = selected ? 24 : 14;
  return L.divIcon({
    className: `map-stop${selected ? ' is-selected' : ''}`,
    html: selected ? String(order + 1) : '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function addStopMarkerToMap(stop) {
  if (!map) return;
  const order = selectedStopIds.indexOf(stop.id);
  const marker = L.marker(xyToLatLng(stop.x, stop.y), { icon: stopIcon(order), title: stop.name })
    .addTo(map)
    .bindTooltip(stop.description ? `${stop.name}: ${stop.description}` : stop.name);

  marker.on('click', (ev) => {
    L.DomEvent.stopPropagation(ev);
    if (isReportingObstacle) {
      addObstacleAtLatLng(marker.getLatLng());
      return;
    }
    if (isAddingStop) {
      addCustomStopAtLatLng(marker.getLatLng());
      return;
    }
    toggleStop(stop.id);
  });
  stopMarkers.set(stop.id, marker);
}

/**
 * 8-connected BFS from the Habitat to mark every grid cell that is reachable by foot.
 * Because ~32% of Mount Sharp boxwork cells have slope >= 20° (impassable) and ~18% sit inside
 * enclosed ridge hollows, snapping a map click to the nearest reachable cell guarantees that
 * clicking any random Boxwork ridge on the map places a stop at its nearest passable edge.
 */
function updateReachableMask() {
  if (!grid || !habitat) return;
  const n = grid.cols * grid.rows;
  const mask = new Uint8Array(n);
  const startCell = xyToCell(grid, habitat.x, habitat.y);
  if (!startCell) {
    reachableMask = mask;
    return;
  }
  const startIdx = cellIndex(grid, startCell.col, startCell.row);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  queue[tail++] = startIdx;
  mask[startIdx] = 1;

  const cols = grid.cols;
  const rows = grid.rows;
  while (head < tail) {
    const cur = queue[head++];
    const r = (cur / cols) | 0;
    const c = cur % cols;
    for (let dr = -1; dr <= 1; dr++) {
      const nr = r + dr;
      if (nr < 0 || nr >= rows) continue;
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nc = c + dc;
        if (nc < 0 || nc >= cols) continue;
        const ni = nr * cols + nc;
        if (!mask[ni] && grid.risk[ni] !== RISK_IMPASSABLE) {
          mask[ni] = 1;
          queue[tail++] = ni;
        }
      }
    }
  }
  reachableMask = mask;
}

/**
 * Given any (x, y) click on the map, return the exact point if its cell is reachable from the Habitat,
 * or snap to the closest cell reachable from the Habitat.
 */
function snapToReachablePoint(x, y) {
  const clampedX = Math.max(0.1, Math.min(grid.widthM - 0.1, x));
  const clampedY = Math.max(0.1, Math.min(grid.heightM - 0.1, y));
  const cell = xyToCell(grid, clampedX, clampedY);
  if (!cell) return null;

  if (!reachableMask) updateReachableMask();
  const idx = cellIndex(grid, cell.col, cell.row);
  if (reachableMask ? reachableMask[idx] : isPassable(grid, idx)) {
    return { x: clampedX, y: clampedY, snapped: false };
  }

  const maxRadius = Math.max(grid.cols, grid.rows);
  let bestCol = -1;
  let bestRow = -1;
  let bestDist2 = Infinity;

  for (let rad = 1; rad <= maxRadius; rad++) {
    const rMin = Math.max(0, cell.row - rad);
    const rMax = Math.min(grid.rows - 1, cell.row + rad);
    const cMin = Math.max(0, cell.col - rad);
    const cMax = Math.min(grid.cols - 1, cell.col + rad);

    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) {
        if (r !== rMin && r !== rMax && c !== cMin && c !== cMax) continue;
        const ni = r * grid.cols + c;
        if (reachableMask ? reachableMask[ni] : isPassable(grid, ni)) {
          const d2 = (r - cell.row) ** 2 + (c - cell.col) ** 2;
          if (d2 < bestDist2) {
            bestDist2 = d2;
            bestCol = c;
            bestRow = r;
          }
        }
      }
    }
    if (bestCol >= 0) break;
  }

  if (bestCol < 0) return null;
  const center = cellCenter(grid, bestCol, bestRow);
  return { x: center.x, y: center.y, snapped: true };
}

function setAddingStop(active) {
  isAddingStop = Boolean(active);
  if (isAddingStop && isReportingObstacle) {
    setReportingObstacle(false);
  }
  addStopBtn.setAttribute('aria-pressed', String(isAddingStop));
  addStopBtn.textContent = isAddingStop
    ? 'Adding Boxwork stops: ON (Click to lock)'
    : '+ Add Boxwork stop on map';
  addStopHintEl.hidden = !isAddingStop;
  addStopHintEl.classList.remove('is-error');
  addStopHintEl.textContent = 'Click on the map to add Boxwork stops. Press the button again to lock.';
  map2dEl.classList.toggle('is-adding-stop', isAddingStop);
  if (isAddingStop && viewMode === '3d') {
    setViewMode('2d');
  }
}

function addCustomStopAtLatLng(latlng) {
  const { x, y } = latLngToXy(latlng);
  const target = snapToReachablePoint(x, y);
  if (!target) return;

  const num = nextCustomStopId++;
  const rawName = customStopNameEl ? customStopNameEl.value.trim() : '';
  const name = rawName || `Custom Boxwork site ${num}`;
  if (customStopNameEl) customStopNameEl.value = '';

  const rx = Math.round(target.x * 10) / 10;
  const ry = Math.round(target.y * 10) / 10;
  const newStop = {
    id: `custom_bw_${num}`,
    name,
    type: 'science',
    x: rx,
    y: ry,
    description: target.snapped
      ? `Astronaut-selected Boxwork site, snapped to nearest passable edge (${Math.round(rx)} m E, ${Math.round(ry)} m N).`
      : `Astronaut-selected Boxwork site (${Math.round(rx)} m E, ${Math.round(ry)} m N).`,
    photo: null,
    custom: true,
  };

  allStops.push(newStop);
  selectedStopIds.push(newStop.id);
  addStopMarkerToMap(newStop);
  if (terrain3d) terrain3d.setStops(allStops);
  renderStopsUI();
  recomputeRoutes();
}

function removeCustomStop(stopId) {
  allStops = allStops.filter((s) => s.id !== stopId);
  selectedStopIds = selectedStopIds.filter((id) => id !== stopId);
  const marker = stopMarkers.get(stopId);
  if (marker) {
    marker.remove();
    stopMarkers.delete(stopId);
  }
  if (terrain3d) terrain3d.setStops(allStops);
  renderStopsUI();
  recomputeRoutes();
}

function renderStopsUI() {
  // The list is rebuilt on every change; keep keyboard focus on the stop that was just toggled.
  const focusedId = document.activeElement && document.activeElement.dataset
    ? document.activeElement.dataset.stopId
    : null;

  stopsListEl.replaceChildren();
  for (const stop of allStops) {
    const order = selectedStopIds.indexOf(stop.id);
    const selected = order >= 0;

    const row = h('button', 'stop');
    row.type = 'button';
    row.dataset.stopId = stop.id;
    row.setAttribute('aria-pressed', String(selected));
    row.title = `${Math.round(stop.x)} m east, ${Math.round(stop.y)} m north`;

    const marker = h('span', 'stop-marker', selected ? String(order + 1) : '');
    marker.setAttribute('aria-hidden', 'true');
    const text = h('span', 'stop-text');
    text.append(h('span', 'stop-name', stop.name), h('span', 'stop-desc', stop.description || ''));
    row.append(marker, text);
    row.addEventListener('click', () => toggleStop(stop.id));

    const item = h('li', stop.custom ? 'stop-item' : '');
    item.appendChild(row);
    if (stop.custom) {
      const delBtn = h('button', 'stop-remove', '×');
      delBtn.type = 'button';
      delBtn.title = `Remove ${stop.name}`;
      delBtn.setAttribute('aria-label', `Remove ${stop.name}`);
      delBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        removeCustomStop(stop.id);
      });
      item.appendChild(delBtn);
    }
    stopsListEl.appendChild(item);
    if (focusedId === stop.id) row.focus();

    const mapMarker = stopMarkers.get(stop.id);
    if (mapMarker) mapMarker.setIcon(stopIcon(order));
  }

  clearStopsBtn.hidden = selectedStopIds.length === 0;
  if (terrain3d) terrain3d.setSelectedStops(selectedStopIds);
}

/** True when a data layer contributes to route cost (non-zero weight). */
function hasCostEffect(layer) {
  return layer.weight != null && layer.weight !== 0;
}

/**
 * Rebuild grid.risk from the currently enabled data layers and stamp all user-reported obstacles
 * as RISK_IMPASSABLE (255).
 */
function rebuildRiskGrid() {
  const combined =
    dataLayers.length > 0
      ? new Uint8Array(combineRisk(grid, enabledLayerIds))
      : new Uint8Array(initialRiskCopy);

  for (const obs of reportedObstacles) {
    for (const idx of obs.cells) {
      combined[idx] = RISK_IMPASSABLE;
    }
  }
  grid.risk = combined;
  if (habitat) updateReachableMask();
}

/**
 * Compute all grid cell indices within radiusM of (x, y).
 */
function computeObstacleCells(x, y, radiusM = OBSTACLE_RADIUS_M) {
  const centerCell = xyToCell(grid, x, y);
  if (!centerCell) return [];
  const radiusCells = Math.max(1, Math.ceil(radiusM / grid.cellSize));
  const r2 = radiusM * radiusM;
  const cells = [];
  const rMin = Math.max(0, centerCell.row - radiusCells);
  const rMax = Math.min(grid.rows - 1, centerCell.row + radiusCells);
  const cMin = Math.max(0, centerCell.col - radiusCells);
  const cMax = Math.min(grid.cols - 1, centerCell.col + radiusCells);

  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      const cx = (c + 0.5) * grid.cellSize;
      const cy = grid.heightM - (r + 0.5) * grid.cellSize;
      const dx = cx - x;
      const dy = cy - y;
      if (dx * dx + dy * dy <= r2) {
        cells.push(cellIndex(grid, c, r));
      }
    }
  }
  if (cells.length === 0) {
    cells.push(cellIndex(grid, centerCell.col, centerCell.row));
  }
  return cells;
}

function setReportingObstacle(active) {
  isReportingObstacle = Boolean(active);
  if (isReportingObstacle && isAddingStop) {
    setAddingStop(false);
  }
  reportObstacleBtn.setAttribute('aria-pressed', String(isReportingObstacle));
  reportObstacleBtn.textContent = isReportingObstacle
    ? 'Click map to place (Cancel)'
    : 'Report new obstacle';
  obstacleHintEl.textContent = isReportingObstacle ? OBSTACLE_ACTIVE_HINT : OBSTACLE_DEFAULT_HINT;
  map2dEl.classList.toggle('is-reporting-obstacle', isReportingObstacle);
  if (isReportingObstacle && viewMode === '3d') {
    setViewMode('2d');
  }
}

function renderObstaclesOnMap() {
  if (!obstacleLayerGroup) return;
  obstacleLayerGroup.clearLayers();
  clearObstaclesBtn.hidden = reportedObstacles.length === 0;

  for (const obs of reportedObstacles) {
    const circle = L.circle(xyToLatLng(obs.x, obs.y), {
      radius: obs.radiusM,
      color: DANGER_COLOR,
      weight: 2,
      fillColor: DANGER_COLOR,
      fillOpacity: 0.38,
    })
      .addTo(obstacleLayerGroup)
      .bindTooltip('Reported obstacle (impassable) · click to remove');

    circle.on('click', (ev) => {
      L.DomEvent.stopPropagation(ev);
      if (isReportingObstacle) {
        addObstacleAtLatLng(ev.latlng);
        return;
      }
      removeObstacle(obs.id);
    });
  }
}

function addObstacleAtLatLng(latlng) {
  const { x, y } = latLngToXy(latlng);
  const cells = computeObstacleCells(x, y, OBSTACLE_RADIUS_M);
  if (cells.length === 0) return;

  reportedObstacles.push({
    id: nextObstacleId++,
    x,
    y,
    radiusM: OBSTACLE_RADIUS_M,
    cells,
  });

  setReportingObstacle(false);
  renderObstaclesOnMap();
  rebuildRiskGrid();
  recomputeRoutes();
}

function removeObstacle(id) {
  reportedObstacles = reportedObstacles.filter((o) => o.id !== id);
  renderObstaclesOnMap();
  rebuildRiskGrid();
  recomputeRoutes();
}

function clearAllObstacles() {
  reportedObstacles = [];
  setReportingObstacle(false);
  renderObstaclesOnMap();
  rebuildRiskGrid();
  recomputeRoutes();
}

/**
 * Update the note & opacity on "Estimated risk" when any cost-affecting data layer is switched off,
 * since risk.png represents all cost layers switched on. Map-only layers (weight 0) do not affect risk.png.
 */
function updateRiskLayerNote() {
  const costLayers = dataLayers.filter(hasCostEffect);
  const anyOff = costLayers.some((l) => !enabledLayerIds.includes(l.id));
  riskMapNoteEl.hidden = !anyOff;
  if (riskOverlay) {
    riskOverlay.setOpacity(anyOff ? 0.42 : 0.7);
  }
}

/**
 * Build checkboxes for every data layer in grid.meta.layers (independent of layer count or names).
 * Layers with weight === 0 (map-only layers such as radiation shelter) start unchecked by default.
 */
function setupDataLayersUI(bounds) {
  dataLayersListEl.replaceChildren();
  dataLayerOverlays.clear();

  if (!dataLayers.length) {
    dataLayersWrapEl.hidden = true;
    riskMapNoteEl.hidden = true;
    return;
  }

  dataLayersWrapEl.hidden = false;
  enabledLayerIds = dataLayers.filter(hasCostEffect).map((l) => l.id);

  for (const layer of dataLayers) {
    const defaultOn = hasCostEffect(layer);

    if (layer.img) {
      const ov = L.imageOverlay(grid.base + layer.img, bounds, { opacity: 0.85 });
      if (defaultOn) ov.addTo(map);
      dataLayerOverlays.set(layer.id, ov);
    }

    const item = h('div', 'data-layer-item');
    const label = h('label', 'data-layer-check');

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = defaultOn;
    input.dataset.layerId = layer.id;

    const body = h('span', 'data-layer-body');
    body.appendChild(h('span', 'data-layer-title', layer.label));

    const effectParts = [];
    if (layer.effect) effectParts.push(layer.effect);
    if (hasCostEffect(layer)) {
      effectParts.push(`${formatSignedWeight(layer.weight)} risk points · assumption`);
    } else if (!layer.effect) {
      effectParts.push('map only, not in the route cost');
    }
    if (effectParts.length) {
      body.appendChild(h('span', 'data-layer-effect', effectParts.join(' · ')));
    }

    label.append(input, body);
    item.appendChild(label);

    if (layer.description || layer.cannot_see) {
      const details = h('details', 'data-layer-details');
      details.appendChild(h('summary', '', 'What it shows & limits'));
      if (layer.description) {
        details.appendChild(h('p', '', layer.description));
      }
      if (layer.cannot_see) {
        details.appendChild(h('p', 'data-layer-limit', `Cannot show: ${layer.cannot_see}`));
      }
      item.appendChild(details);
    }

    input.addEventListener('change', () => {
      if (input.checked) {
        if (!enabledLayerIds.includes(layer.id)) enabledLayerIds.push(layer.id);
        const ov = dataLayerOverlays.get(layer.id);
        if (ov) ov.addTo(map);
      } else {
        enabledLayerIds = enabledLayerIds.filter((id) => id !== layer.id);
        const ov = dataLayerOverlays.get(layer.id);
        if (ov) ov.remove();
      }

      updateRiskLayerNote();
      rebuildRiskGrid();
      recomputeRoutes();
    });

    dataLayersListEl.appendChild(item);
  }

  updateRiskLayerNote();
  rebuildRiskGrid();
}

/**
 * One sentence comparing a route with the other alternative, e.g.
 * "46 m longer, mean estimated risk 16.0 lower, steepest slope 3° lower."
 */
function buildRationale(route, other) {
  const t = route.totals;
  const o = other.totals;
  const parts = [];

  const dDist = Math.round(t.distance_m - o.distance_m);
  parts.push(dDist === 0 ? 'same distance' : `${Math.abs(dDist)} m ${dDist > 0 ? 'longer' : 'shorter'}`);

  if (t.mean_risk != null && o.mean_risk != null) {
    const dRisk = t.mean_risk - o.mean_risk;
    parts.push(
      Math.abs(dRisk) < 0.05
        ? 'same mean estimated risk'
        : `mean estimated risk ${Math.abs(dRisk).toFixed(1)} ${dRisk < 0 ? 'lower' : 'higher'}`
    );
  }

  const dSlope = Math.round(t.max_slope_deg - o.max_slope_deg);
  if (dSlope !== 0) parts.push(`steepest slope ${Math.abs(dSlope)}° ${dSlope < 0 ? 'lower' : 'higher'}`);

  return `${parts.join(', ')}.`;
}

function drawRouteLines() {
  routeLayerGroup.clearLayers();
  if (!currentRoutes.shortest || !currentRoutes.low_risk) return;

  // Draw the selected route last so it sits on top.
  const order = ROUTE_ORDER.filter((k) => k !== selectedRouteKind).concat(selectedRouteKind);
  for (const kind of order) {
    const route = currentRoutes[kind];
    const style = ROUTE_STYLE[kind];
    const isSelected = kind === selectedRouteKind;
    const latlngs = route.points.map((p) => xyToLatLng(p.x, p.y));
    const weight = isSelected ? 5 : 3;

    // Dark casing keeps the line readable over both the image and the risk layer.
    L.polyline(latlngs, {
      color: CASING_COLOR,
      weight: weight + 3,
      opacity: isSelected ? 0.7 : 0.45,
      interactive: false,
    }).addTo(routeLayerGroup);

    const mean = route.totals.mean_risk;
    L.polyline(latlngs, {
      color: style.color,
      weight,
      opacity: isSelected ? 1 : 0.8,
      dashArray: style.dash,
      lineCap: style.dash ? 'butt' : 'round',
    })
      .addTo(routeLayerGroup)
      .bindTooltip(
        `${route.name}: ${formatMetres(route.totals.distance_m)}` +
          (mean != null ? `, mean estimated risk ${mean.toFixed(1)}` : ''),
        { sticky: true }
      )
      .on('click', (ev) => {
        if (isReportingObstacle) {
          L.DomEvent.stopPropagation(ev);
          addObstacleAtLatLng(ev.latlng);
          return;
        }
        if (isAddingStop) {
          L.DomEvent.stopPropagation(ev);
          addCustomStopAtLatLng(ev.latlng);
          return;
        }
        selectRouteKind(kind);
      });
  }
}

/** Percentage of route cells where a given data layer has score > 0. */
function routeLayerSharePct(cells, layerId) {
  const scores = grid.layerScores && grid.layerScores[layerId];
  if (!scores || !cells || !cells.length) return 0;
  let hits = 0;
  for (let i = 0; i < cells.length; i++) {
    if (scores[cells[i]] > 0) hits++;
  }
  return Math.round((hits / cells.length) * 100);
}

/** Rows of the comparison, in display order. Every number comes from buildRoute() totals + active layers. */
function routeRows(route, cells) {
  const t = route.totals;
  const rows = [
    { label: 'Total Marswalk time', value: formatDuration(totalEvaS(route)), className: 'route-total' },
    { label: 'Distance, one way', value: formatMetres(t.distance_m) },
    { label: 'Walk out', value: formatDuration(t.walk_s) },
    { label: 'Work at stops', value: formatDuration(t.work_s) },
    { label: 'Walk back', value: formatDuration(t.return_s) },
    { label: 'Steepest slope', value: `${Math.round(t.max_slope_deg)}°` },
    { label: 'Total ascent', value: formatMetres(t.ascent_m) },
    {
      label: 'Mean estimated risk',
      title: 'Scale 0 to 100. Cells without data are not counted in the mean.',
      value: t.mean_risk != null ? t.mean_risk.toFixed(1) : 'No data',
    },
    { label: 'Cells without data', value: String(t.nodata_cells) },
  ];

  // Add one row per currently enabled data layer (e.g. share of route cells on that layer)
  const activeLayers = dataLayers.filter((l) => enabledLayerIds.includes(l.id));
  for (const layer of activeLayers) {
    const pct = routeLayerSharePct(cells, layer.id);
    const title = hasCostEffect(layer)
      ? `${layer.label} (${formatSignedWeight(layer.weight)} risk points · assumption)`
      : `${layer.label} (${layer.effect || 'map only'})`;
    rows.push({
      label: layer.label,
      title,
      value: `${pct} %`,
    });
  }

  return rows;
}

function renderRouteCards() {
  // The cards are rebuilt on every change; remember which one had keyboard focus.
  const focusedKind = document.activeElement && document.activeElement.dataset
    ? document.activeElement.dataset.kind
    : null;
  routesContainerEl.replaceChildren();
  const { shortest, low_risk } = currentRoutes;

  if (!shortest || !low_risk) {
    if (routeAlertEl.hidden) {
      routesContainerEl.appendChild(
        h('p', 'empty', 'Select a stop to compare the shortest route with the lowest estimated risk route.')
      );
    }
    routeRationaleEl.hidden = true;
    startWalkBtn.disabled = true;
    return;
  }

  startWalkBtn.disabled = false;

  const labelRows = routeRows(low_risk, currentCells.low_risk);
  const compare = h('div', 'compare');
  compare.setAttribute('role', 'group');
  compare.setAttribute('aria-label', 'Route to walk');
  compare.style.setProperty('--rows', String(labelRows.length + 1));

  const labels = h('div', 'compare-labels');
  labels.setAttribute('aria-hidden', 'true');
  labels.appendChild(h('span'));
  for (const row of labelRows) {
    const label = h('span', '', row.label);
    if (row.title) label.title = row.title;
    labels.appendChild(label);
  }
  compare.appendChild(labels);

  ROUTE_ORDER.forEach((kind, i) => {
    const route = currentRoutes[kind];
    const cells = currentCells[kind];
    const other = currentRoutes[ROUTE_ORDER[1 - i]];
    const evaS = totalEvaS(route);
    const overLimit = evaS > ASSUMPTIONS.EVA_LIMIT_S;
    const isSelected = selectedRouteKind === kind;

    const card = h('button', `route-card${overLimit ? ' is-over-limit' : ''}`);
    card.type = 'button';
    card.dataset.kind = kind;
    card.style.gridColumn = String(i + 2);
    card.setAttribute('aria-pressed', String(isSelected));

    const head = h('span', 'route-head');
    const headTop = h('span', 'route-head-top');
    headTop.append(h('span', 'route-sample'), h('span', 'route-radio'));
    head.append(headTop, h('span', 'route-name', route.name));
    card.appendChild(head);

    const rationale = buildRationale(route, other);
    for (const row of routeRows(route, cells)) {
      const cell = h('span', row.className || '');
      cell.append(h('span', 'sr-only', `${row.label}: `), h('span', '', row.value));
      if (row.className === 'route-total' && overLimit) {
        cell.appendChild(h('span', 'over-limit', `Over the ${formatDuration(ASSUMPTIONS.EVA_LIMIT_S)} planning limit`));
      }
      card.appendChild(cell);
    }

    // Each card carries its one-sentence rationale; the selected route's sentence is shown below the cards.
    card.title = `Compared with ${other.name}: ${rationale}`;
    card.appendChild(h('span', 'sr-only', `Compared with ${other.name}: ${rationale}`));
    if (isSelected) {
      routeRationaleEl.textContent = `${route.name}, compared with ${other.name}: ${rationale}`;
      routeRationaleEl.hidden = false;
    }

    card.addEventListener('click', () => selectRouteKind(kind));
    compare.appendChild(card);
  });

  routesContainerEl.appendChild(compare);
  if (focusedKind) {
    const again = compare.querySelector(`[data-kind="${focusedKind}"]`);
    if (again) again.focus();
  }
}

/**
 * Step 4: SVG elevation profile of the selected route, with the habitat and the stops marked.
 */
function renderElevationProfile() {
  const route = currentRoutes[selectedRouteKind];
  profileSvgEl.replaceChildren();
  const oldEmpty = profileWrapEl.querySelector('.profile-empty');
  if (oldEmpty) oldEmpty.remove();
  if (hoverMapMarker) {
    hoverMapMarker.remove();
    hoverMapMarker = null;
  }
  if (terrain3d) terrain3d.setHoverPoint(null);

  if (!route || !route.points || route.points.length < 2) {
    profileRouteLabelEl.textContent = '';
    profileHoverInfoEl.textContent = '';
    profileWrapEl.appendChild(h('div', 'profile-empty', 'The profile appears once a route is planned.'));
    return;
  }

  const color = ROUTE_STYLE[route.kind].color;
  profileRouteLabelEl.textContent = route.name;
  profileHoverInfoEl.textContent = PROFILE_HINT;

  const W = profileSvgEl.clientWidth || 640;
  const H = profileSvgEl.clientHeight || 100;
  profileSvgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const padL = 58;
  const padR = 16;
  const padT = 20;
  const padB = 20;
  const plotW = Math.max(10, W - padL - padR);
  const plotH = Math.max(10, H - padT - padB);

  const pts = route.points;
  const maxDist = Math.max(1, route.totals.distance_m);

  let minElev = Infinity;
  let maxElev = -Infinity;
  for (const p of pts) {
    if (p.elev != null) {
      if (p.elev < minElev) minElev = p.elev;
      if (p.elev > maxElev) maxElev = p.elev;
    }
  }
  if (!Number.isFinite(minElev) || !Number.isFinite(maxElev)) {
    minElev = 0;
    maxElev = 10;
  }
  if (maxElev - minElev < 2) {
    minElev -= 1;
    maxElev += 1;
  } else {
    const margin = (maxElev - minElev) * 0.1;
    minElev -= margin;
    maxElev += margin;
  }

  const xOf = (dist) => padL + (dist / maxDist) * plotW;
  const yOf = (elev) => padT + (1 - (elev - minElev) / (maxElev - minElev)) * plotH;

  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, text = '') => {
    const node = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    if (text) node.textContent = text;
    return node;
  };

  // Elevation grid lines and labels at round values
  for (const elevVal of niceTicks(minElev, maxElev, 3)) {
    const y = yOf(elevVal);
    profileSvgEl.appendChild(el('line', { class: 'grid-line', x1: padL, y1: y, x2: W - padR, y2: y }));
    profileSvgEl.appendChild(
      el('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end' }, formatMetres(elevVal))
    );
  }

  // Distance labels at round values
  for (const dVal of niceTicks(0, maxDist, 5)) {
    const x = xOf(dVal);
    if (x > W - padR - 24) continue;
    profileSvgEl.appendChild(
      el('text', { x, y: H - 4, 'text-anchor': dVal === 0 ? 'start' : 'middle' }, formatMetres(dVal))
    );
  }

  // Stop positions: a vertical line with the stop name on top
  let lastLabelEnd = -Infinity;
  const stopMarks = [];
  route.stops.forEach((s, idx) => {
    const pt = pts[s.point_index];
    if (!pt || pt.elev == null) return;
    const sx = xOf(pt.dist);
    profileSvgEl.appendChild(el('line', { class: 'stop-line', x1: sx, y1: padT, x2: sx, y2: padT + plotH }));
    stopMarks.push({ x: sx, y: yOf(pt.elev), label: String(idx + 1) });

    const halfWidth = s.name.length * 3.1;
    const cx = Math.min(Math.max(sx, padL + halfWidth), W - padR - halfWidth);
    if (cx - halfWidth > lastLabelEnd + 8) {
      profileSvgEl.appendChild(
        el('text', { class: 'stop-label', x: cx, y: padT - 8, 'text-anchor': 'middle' }, s.name)
      );
      lastLabelEnd = cx + halfWidth;
    }
  });

  // Elevation line and a faint fill below it
  const validPts = pts.filter((p) => p.elev != null);
  if (validPts.length >= 2) {
    const lineCoords = validPts.map((p) => `${xOf(p.dist).toFixed(1)},${yOf(p.elev).toFixed(1)}`);
    const baseY = (padT + plotH).toFixed(1);
    profileSvgEl.appendChild(
      el('path', {
        d:
          `M ${xOf(validPts[0].dist).toFixed(1)},${baseY} L ${lineCoords.join(' L ')} ` +
          `L ${xOf(validPts[validPts.length - 1].dist).toFixed(1)},${baseY} Z`,
        fill: color,
        'fill-opacity': 0.1,
      })
    );
    profileSvgEl.appendChild(
      el('polyline', {
        points: lineCoords.join(' '),
        fill: 'none',
        stroke: color,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
      })
    );
  }

  // Markers use the same shapes as the map: square for the habitat, round and numbered for stops
  if (pts[0] && pts[0].elev != null) {
    const hx = xOf(0);
    const hy = yOf(pts[0].elev);
    profileSvgEl.appendChild(el('rect', { class: 'marker', x: hx - 7, y: hy - 7, width: 14, height: 14, rx: 3 }));
    profileSvgEl.appendChild(el('text', { class: 'marker-text', x: hx, y: hy + 3.5, 'text-anchor': 'middle' }, 'H'));
  }
  for (const m of stopMarks) {
    profileSvgEl.appendChild(el('circle', { class: 'marker', cx: m.x, cy: m.y, r: 7.5 }));
    profileSvgEl.appendChild(el('text', { class: 'marker-text', x: m.x, y: m.y + 3.5, 'text-anchor': 'middle' }, m.label));
  }

  // Hover cursor linked to a marker on the map
  const hoverLine = el('line', { class: 'cursor-line', x1: 0, y1: padT, x2: 0, y2: padT + plotH, visibility: 'hidden' });
  const hoverDot = el('circle', { cx: 0, cy: 0, r: 4.5, fill: '#ffffff', stroke: CASING_COLOR, 'stroke-width': 1.5, visibility: 'hidden' });
  profileSvgEl.append(hoverLine, hoverDot);

  const overlayRect = el('rect', { class: 'hit', x: padL, y: padT, width: plotW, height: plotH });

  overlayRect.addEventListener('mousemove', (ev) => {
    const rect = profileSvgEl.getBoundingClientRect();
    const relX = ev.clientX - rect.left - padL;
    const frac = Math.max(0, Math.min(1, relX / plotW));
    const targetDist = frac * maxDist;

    // Find nearest point by distance
    let bestPt = pts[0];
    let bestDiff = Infinity;
    for (const p of pts) {
      const diff = Math.abs(p.dist - targetDist);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestPt = p;
      }
    }
    if (!bestPt || bestPt.elev == null) return;

    const cx = xOf(bestPt.dist);
    const cy = yOf(bestPt.elev);
    hoverLine.setAttribute('x1', String(cx));
    hoverLine.setAttribute('x2', String(cx));
    hoverLine.setAttribute('visibility', 'visible');
    hoverDot.setAttribute('cx', String(cx));
    hoverDot.setAttribute('cy', String(cy));
    hoverDot.setAttribute('visibility', 'visible');

    profileHoverInfoEl.textContent =
      `${formatMetres(bestPt.dist)}: elevation ${formatMetres(bestPt.elev)}, ` +
      `slope ${bestPt.slope != null ? `${bestPt.slope}°` : 'no data'}, ` +
      `estimated risk ${bestPt.risk != null ? bestPt.risk : 'no data'}`;

    if (!hoverMapMarker) {
      hoverMapMarker = L.circleMarker(xyToLatLng(bestPt.x, bestPt.y), {
        radius: 6,
        color: CASING_COLOR,
        weight: 2,
        fillColor: '#ffffff',
        fillOpacity: 1,
        interactive: false,
      }).addTo(map);
    } else {
      hoverMapMarker.setLatLng(xyToLatLng(bestPt.x, bestPt.y));
    }
    if (terrain3d) terrain3d.setHoverPoint(bestPt);
  });

  overlayRect.addEventListener('mouseleave', () => {
    hoverLine.setAttribute('visibility', 'hidden');
    hoverDot.setAttribute('visibility', 'hidden');
    profileHoverInfoEl.textContent = PROFILE_HINT;
    if (hoverMapMarker) {
      hoverMapMarker.remove();
      hoverMapMarker = null;
    }
    if (terrain3d) terrain3d.setHoverPoint(null);
  });

  profileSvgEl.appendChild(overlayRect);
}

/**
 * Step 5: "Last measured conditions" and "Data and limits".
 */
function renderConditionsAndLimits(conditions) {
  if (conditions && conditions.mock) {
    conditionsMockTagEl.hidden = false;
  }
  if (conditions && conditions.note) {
    conditionsNoteEl.textContent = conditions.note;
  }

  // Rows that share an instrument and a measurement day sit under one heading,
  // so the day and the instrument are written once instead of on every row.
  conditionsListEl.replaceChildren();
  const items = conditions && Array.isArray(conditions.items) ? conditions.items : [];
  const groups = new Map();
  for (const item of items) {
    const key = `${item.instrument}|${item.measured}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  for (const groupItems of groups.values()) {
    const first = groupItems[0];
    const group = h('div', 'cond-group');

    const head = h('div', 'cond-group-head');
    head.appendChild(h('span', '', `${first.instrument}, ${first.measured}`));
    const sourceUrl = groupItems.map((it) => it.source_url).find(Boolean);
    if (sourceUrl) {
      const link = h('a', '', 'Source');
      link.href = sourceUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      head.appendChild(link);
    }
    group.appendChild(head);

    for (const item of groupItems) {
      const value = typeof item.value === 'number' ? String(item.value).replace('-', '\u2212') : String(item.value);
      const row = h('div', 'cond');
      row.append(h('span', 'cond-label', item.label), h('span', 'cond-value', `${value} ${item.unit || ''}`.trim()));
      group.appendChild(row);
      if (item.detail) group.appendChild(h('div', 'cond-detail', item.detail));
    }
    conditionsListEl.appendChild(group);
  }

  // Data sources and what each one cannot show
  sourcesListEl.replaceChildren();
  const sources = Array.isArray(grid.meta.sources) ? grid.meta.sources : [];
  for (const src of sources) {
    const block = h('div', 'source');

    const head = h('div', 'source-head');
    head.append(
      h('span', '', src.layer),
      h('span', '', src.resolution_m != null ? `${src.resolution_m} m per pixel` : '')
    );

    const origin = [...new Set([src.mission, src.instrument, src.product_id].filter(Boolean))].join(', ');
    const meta = h('div', 'source-meta', origin || 'Source not given');
    if (src.url) {
      meta.appendChild(document.createTextNode(' '));
      const a = h('a', '', 'Archive');
      a.href = src.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      meta.appendChild(a);
    }

    block.append(head, meta);
    if (src.cannot_see) block.appendChild(h('div', 'source-limit', `Cannot show: ${src.cannot_see}`));
    sourcesListEl.appendChild(block);
  }

  // Data layers inside "Data and limits" panel
  layersLimitsListEl.replaceChildren();
  if (dataLayers.length > 0) {
    layersLimitsSectionEl.hidden = false;
    for (const layer of dataLayers) {
      const block = h('div', 'source');
      const head = h('div', 'source-head');
      const effectText = hasCostEffect(layer)
        ? `${formatSignedWeight(layer.weight)} pts (${layer.effect || 'assumption'})`
        : layer.effect || 'map only';
      head.append(h('span', '', layer.label), h('span', '', effectText));
      block.appendChild(head);

      if (layer.description) {
        block.appendChild(h('div', 'source-meta', layer.description));
      }
      if (layer.source) {
        const srcDiv = h('div', 'source-meta');
        const urlMatch = String(layer.source).match(/https?:\/\/\S+/);
        if (urlMatch) {
          const url = urlMatch[0].replace(/[.,;)]$/, '');
          const prefix = String(layer.source).replace(url, '').replace(/[,\s]+$/, '');
          srcDiv.textContent = prefix ? `Source: ${prefix} ` : 'Source: ';
          const a = h('a', '', 'Archive');
          a.href = url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          srcDiv.appendChild(a);
        } else {
          srcDiv.textContent = `Source: ${layer.source}`;
        }
        block.appendChild(srcDiv);
      }
      if (layer.cannot_see) {
        block.appendChild(h('div', 'source-limit', `Cannot show: ${layer.cannot_see}`));
      }
      layersLimitsListEl.appendChild(block);
    }
  } else {
    layersLimitsSectionEl.hidden = true;
  }

  // Risk model
  const rm = grid.meta.risk_model || {};
  const rmParts = [];
  if (rm.description) rmParts.push(rm.description);
  // Add the limit only when the description does not already state it.
  const limitStated = rm.description && new RegExp(`\\b${rm.slope_limit_deg}\\s*(deg|°)`).test(rm.description);
  if (rm.slope_limit_deg != null && !limitStated) rmParts.push(`Slope limit: ${rm.slope_limit_deg}°.`);
  riskModelBoxEl.textContent = rmParts.join('. ').replace('..', '.') || 'Not described in the grid metadata.';

  // Planning assumptions: labels, values and sources come ready from shared/walk-model.js
  assumptionsListEl.replaceChildren();
  for (const note of ASSUMPTION_NOTES) {
    const block = h('div', 'source');
    const head = h('div', 'source-head');
    head.append(h('span', '', note.label), h('span', '', note.value));
    block.append(head, h('div', 'source-meta', note.source));
    assumptionsListEl.appendChild(block);
  }
}

function showNoRoute(stop) {
  const msg = `No passable route to ${stop.name}`;
  routeAlertEl.textContent = msg;
  routeAlertEl.hidden = false;
  if (terrain3d) terrain3d.setRoutes(currentRoutes, selectedRouteKind);
  renderRouteCards();
  renderElevationProfile();
}

function recomputeRoutes() {
  routeLayerGroup.clearLayers();
  routeAlertEl.hidden = true;
  routeAlertEl.textContent = '';
  currentRoutes = { shortest: null, low_risk: null };
  currentCells = { shortest: null, low_risk: null };
  setStatus(terrainSummary());

  const chosen = getSelectedStops();
  if (chosen.length === 0) {
    if (terrain3d) terrain3d.setRoutes(currentRoutes, selectedRouteKind);
    renderRouteCards();
    renderElevationProfile();
    return;
  }

  const shortestRes = findMultiStopPath(grid, habitat, chosen, 0);
  if (!shortestRes.ok) {
    showNoRoute(shortestRes.failedStop);
    return;
  }

  const lowRiskRes = findMultiStopPath(grid, habitat, chosen, 8);
  if (!lowRiskRes.ok) {
    showNoRoute(lowRiskRes.failedStop);
    return;
  }

  const shortestRoute = buildRoute(grid, shortestRes.cells, {
    name: 'Shortest',
    kind: 'shortest',
    weight: 0,
    stops: chosen,
  });

  const lowRiskRoute = buildRoute(grid, lowRiskRes.cells, {
    name: 'Lowest estimated risk',
    kind: 'low_risk',
    weight: 8,
    stops: chosen,
  });

  currentCells = { shortest: shortestRes.cells, low_risk: lowRiskRes.cells };
  currentRoutes = { shortest: shortestRoute, low_risk: lowRiskRoute };
  drawRouteLines();
  if (terrain3d) terrain3d.setRoutes(currentRoutes, selectedRouteKind);
  renderRouteCards();
  renderElevationProfile();
}

async function main() {
  grid = await loadGrid('../app_data/');
  initialRiskCopy = new Uint8Array(grid.risk);
  dataLayers = await loadLayers(grid);
  if (grid.meta.mock) {
    demoBadgeEl.hidden = false;
  }

  const bounds = mapBounds(grid);
  map = L.map('map', { crs: L.CRS.Simple, minZoom: -3, maxZoom: 3, zoomSnap: 0.25 });
  L.imageOverlay(fileUrl(grid, 'ortho'), bounds).addTo(map);
  riskOverlay = L.imageOverlay(fileUrl(grid, 'risk_img'), bounds, { opacity: 0.7 });
  const slopeOverlay = L.imageOverlay(fileUrl(grid, 'slope_img'), bounds, { opacity: 0.7 });
  riskOverlay.addTo(map);
  map.fitBounds(bounds);

  toggleRiskLayerEl.addEventListener('change', () => {
    if (toggleRiskLayerEl.checked) riskOverlay.addTo(map);
    else riskOverlay.remove();
    if (terrain3d) terrain3d.setLayers({ risk: toggleRiskLayerEl.checked });
  });
  toggleSlopeLayerEl.addEventListener('change', () => {
    if (toggleSlopeLayerEl.checked) slopeOverlay.addTo(map);
    else slopeOverlay.remove();
    if (terrain3d) terrain3d.setLayers({ slope: toggleSlopeLayerEl.checked });
  });

  setupDataLayersUI(bounds);

  routeLayerGroup = L.layerGroup().addTo(map);
  obstacleLayerGroup = L.layerGroup().addTo(map);

  map.on('click', (ev) => {
    if (isReportingObstacle) {
      addObstacleAtLatLng(ev.latlng);
      return;
    }
    if (isAddingStop) {
      addCustomStopAtLatLng(ev.latlng);
    }
  });

  addStopBtn.addEventListener('click', () => {
    setAddingStop(!isAddingStop);
  });

  reportObstacleBtn.addEventListener('click', () => {
    setReportingObstacle(!isReportingObstacle);
  });

  clearObstaclesBtn.addEventListener('click', () => {
    clearAllObstacles();
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      if (isReportingObstacle) setReportingObstacle(false);
      if (isAddingStop) setAddingStop(false);
    }
  });

  const [stopsData, conditionsData] = await Promise.all([
    loadJson(grid, 'stops'),
    loadJson(grid, 'conditions'),
  ]);
  habitat = stopsData.habitat;
  allStops = stopsData.stops;
  updateReachableMask();

  renderConditionsAndLimits(conditionsData);

  habitatNameEl.textContent = habitat.name;
  habitatNameEl.parentElement.parentElement.title =
    `${Math.round(habitat.x)} m east, ${Math.round(habitat.y)} m north`;

  L.marker(xyToLatLng(habitat.x, habitat.y), {
    icon: L.divIcon({ className: 'map-habitat', html: 'H', iconSize: [24, 24], iconAnchor: [12, 12] }),
    keyboard: false,
    zIndexOffset: 500,
  })
    .addTo(map)
    .bindTooltip(`${habitat.name}: start and return point`);

  for (const stop of allStops) {
    addStopMarkerToMap(stop);
  }

  // Initialize 3D terrain viewer (pure WebGL, shares the same grid, overlays, stops and routes)
  try {
    terrain3d = createTerrain3D({
      container: map3dEl,
      grid,
      habitat,
      stops: allStops,
      routeStyle: ROUTE_STYLE,
      casingColor: CASING_COLOR,
      onToggleStop: (stopId) => toggleStop(stopId),
      onSelectRouteKind: (kind) => selectRouteKind(kind),
    });
    terrain3d.setLayers({
      risk: toggleRiskLayerEl.checked,
      slope: toggleSlopeLayerEl.checked,
    });
  } catch (err) {
    console.warn('3D view unavailable:', err);
  }

  btnView2dEl.addEventListener('click', () => setViewMode('2d'));
  btnView3dEl.addEventListener('click', () => setViewMode('3d'));

  zScaleSliderEl.addEventListener('input', () => {
    const val = parseFloat(zScaleSliderEl.value) || 3;
    zScaleValEl.textContent = `${val}×`;
    if (terrain3d) terrain3d.setZScale(val);
  });

  btnReset3dEl.addEventListener('click', () => {
    if (terrain3d) terrain3d.resetCamera();
  });

  clearStopsBtn.addEventListener('click', () => {
    selectedStopIds = [];
    renderStopsUI();
    recomputeRoutes();
  });

  startWalkBtn.addEventListener('click', () => {
    const chosenRoute = currentRoutes[selectedRouteKind];
    if (!chosenRoute) return;
    saveRoute(chosenRoute);
    window.location.href = '../walk/';
  });

  window.addEventListener('resize', () => {
    renderElevationProfile();
    if (terrain3d) terrain3d.resize();
  });

  // Pre-select first two stops on load so two multi-stop routes are immediately visible
  if (allStops.length >= 2) {
    selectedStopIds = [allStops[0].id, allStops[1].id];
  } else if (allStops.length === 1) {
    selectedStopIds = [allStops[0].id];
  }

  renderStopsUI();
  recomputeRoutes();
}

main().catch((err) => {
  setStatus(`Could not load the planner: ${err.message}`, true);
  console.error(err);
});
