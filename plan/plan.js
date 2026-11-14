// plan/plan.js — planning screen (work stream B).
import { loadGrid, loadJson, fileUrl, mapBounds, xyToLatLng } from '../shared/data.js';
import { buildRoute, saveRoute, totalEvaS } from '../shared/route.js';
import { ASSUMPTIONS, ASSUMPTION_NOTES, formatDuration } from '../shared/walk-model.js';
import { findMultiStopPath } from './astar.js';

const statusEl = document.getElementById('status');
const demoBadgeEl = document.getElementById('demo-badge');
const habitatNameEl = document.getElementById('habitat-name');
const stopsListEl = document.getElementById('stops-list');
const clearStopsBtn = document.getElementById('clear-stops-btn');
const toggleRiskLayerEl = document.getElementById('toggle-risk-layer');
const toggleSlopeLayerEl = document.getElementById('toggle-slope-layer');
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
const ROUTE_ORDER = ['low_risk', 'shortest'];

const PROFILE_HINT = 'Hover the chart to see the point on the map.';

let grid = null;
let habitat = null;
let allStops = [];
// Ordered array of selected stop IDs (selection order = visiting order)
let selectedStopIds = [];

// Currently computed routes and selected route kind ('low_risk' | 'shortest')
let currentRoutes = { shortest: null, low_risk: null };
let selectedRouteKind = 'low_risk';

let map = null;
let routeLayerGroup = null;
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

    const item = h('li');
    item.appendChild(row);
    stopsListEl.appendChild(item);
    if (focusedId === stop.id) row.focus();

    const mapMarker = stopMarkers.get(stop.id);
    if (mapMarker) mapMarker.setIcon(stopIcon(order));
  }

  clearStopsBtn.hidden = selectedStopIds.length === 0;
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
      .on('click', () => selectRouteKind(kind));
  }
}

/** Rows of the comparison, in display order. Every number comes from buildRoute() totals. */
function routeRows(route) {
  const t = route.totals;
  return [
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

  const labelRows = routeRows(low_risk);
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
    for (const row of routeRows(route)) {
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
  });

  overlayRect.addEventListener('mouseleave', () => {
    hoverLine.setAttribute('visibility', 'hidden');
    hoverDot.setAttribute('visibility', 'hidden');
    profileHoverInfoEl.textContent = PROFILE_HINT;
    if (hoverMapMarker) {
      hoverMapMarker.remove();
      hoverMapMarker = null;
    }
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
  renderRouteCards();
  renderElevationProfile();
}

function recomputeRoutes() {
  routeLayerGroup.clearLayers();
  routeAlertEl.hidden = true;
  routeAlertEl.textContent = '';
  currentRoutes = { shortest: null, low_risk: null };
  setStatus(terrainSummary());

  const chosen = getSelectedStops();
  if (chosen.length === 0) {
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

  currentRoutes = { shortest: shortestRoute, low_risk: lowRiskRoute };
  drawRouteLines();
  renderRouteCards();
  renderElevationProfile();
}

async function main() {
  grid = await loadGrid('../app_data/');
  if (grid.meta.mock) {
    demoBadgeEl.hidden = false;
  }

  const bounds = mapBounds(grid);
  map = L.map('map', { crs: L.CRS.Simple, minZoom: -3, maxZoom: 3, zoomSnap: 0.25 });
  L.imageOverlay(fileUrl(grid, 'ortho'), bounds).addTo(map);
  const riskOverlay = L.imageOverlay(fileUrl(grid, 'risk_img'), bounds, { opacity: 0.7 });
  const slopeOverlay = L.imageOverlay(fileUrl(grid, 'slope_img'), bounds, { opacity: 0.7 });
  riskOverlay.addTo(map);
  map.fitBounds(bounds);

  toggleRiskLayerEl.addEventListener('change', () => {
    if (toggleRiskLayerEl.checked) riskOverlay.addTo(map);
    else riskOverlay.remove();
  });
  toggleSlopeLayerEl.addEventListener('change', () => {
    if (toggleSlopeLayerEl.checked) slopeOverlay.addTo(map);
    else slopeOverlay.remove();
  });

  routeLayerGroup = L.layerGroup().addTo(map);

  const [stopsData, conditionsData] = await Promise.all([
    loadJson(grid, 'stops'),
    loadJson(grid, 'conditions'),
  ]);
  habitat = stopsData.habitat;
  allStops = stopsData.stops;

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
    const marker = L.marker(xyToLatLng(stop.x, stop.y), { icon: stopIcon(-1), title: stop.name })
      .addTo(map)
      .bindTooltip(stop.description ? `${stop.name}: ${stop.description}` : stop.name);

    marker.on('click', () => toggleStop(stop.id));
    stopMarkers.set(stop.id, marker);
  }

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
