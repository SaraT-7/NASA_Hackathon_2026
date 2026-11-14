// plan/plan.js — Mission Planner screen (Work stream B).
import { loadGrid, loadJson, fileUrl, mapBounds, xyToLatLng } from '../shared/data.js';
import { buildRoute, totalEvaS } from '../shared/route.js';
import { ASSUMPTIONS, formatDuration } from '../shared/walk-model.js';
import { findMultiStopPath } from './astar.js';

const statusEl = document.getElementById('status');
const demoBadgeEl = document.getElementById('demo-badge');
const mapDemoBannerEl = document.getElementById('map-demo-banner');
const habitatNameEl = document.getElementById('habitat-name');
const habitatCoordsEl = document.getElementById('habitat-coords');
const stopsListEl = document.getElementById('stops-list');
const clearStopsBtn = document.getElementById('clear-stops-btn');
const sequenceSummaryEl = document.getElementById('sequence-summary');
const routeAlertEl = document.getElementById('route-alert');
const routesContainerEl = document.getElementById('routes-container');
const profileSvgEl = document.getElementById('profile-svg');
const profileRouteLabelEl = document.getElementById('profile-route-label');
const profileHoverInfoEl = document.getElementById('profile-hover-info');
const conditionsMockTagEl = document.getElementById('conditions-mock-tag');
const conditionsNoteEl = document.getElementById('conditions-note');
const conditionsListEl = document.getElementById('conditions-list');
const sourcesListEl = document.getElementById('sources-list');
const riskModelBoxEl = document.getElementById('risk-model-box');
const assumptionsListEl = document.getElementById('assumptions-list');

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

function renderStopsUI() {
  stopsListEl.innerHTML = '';
  for (const stop of allStops) {
    const orderIdx = selectedStopIds.indexOf(stop.id);
    const isSelected = orderIdx >= 0;

    const item = document.createElement('div');
    item.className = `stop-item${isSelected ? ' selected' : ''}`;
    item.dataset.stopId = stop.id;

    const dot = document.createElement('span');
    dot.className = 'stop-dot';
    dot.textContent = isSelected ? String(orderIdx + 1) : stop.id.toUpperCase();

    const info = document.createElement('div');
    info.className = 'stop-info';

    const name = document.createElement('div');
    name.className = 'stop-name';
    name.textContent = stop.name;

    const desc = document.createElement('div');
    desc.className = 'stop-desc';
    desc.textContent = stop.description || '';

    const meta = document.createElement('div');
    meta.className = 'stop-meta';
    meta.textContent = `(${Math.round(stop.x)} m E, ${Math.round(stop.y)} m N)`;

    info.append(name, desc, meta);
    item.append(dot, info);
    item.addEventListener('click', () => toggleStop(stop.id));
    stopsListEl.appendChild(item);

    // Update corresponding map marker appearance
    const marker = stopMarkers.get(stop.id);
    if (marker) {
      const label = isSelected ? String(orderIdx + 1) : '';
      marker.setIcon(
        L.divIcon({
          className: `map-stop-badge${isSelected ? ' selected' : ''}`,
          html: label,
          iconSize: isSelected ? [22, 22] : [14, 14],
          iconAnchor: isSelected ? [11, 11] : [7, 7],
        })
      );
    }
  }

  const chosen = getSelectedStops();
  if (chosen.length === 0) {
    sequenceSummaryEl.textContent = 'Select at least one science stop to compute routes.';
  } else {
    const names = [habitat.name, ...chosen.map((s, i) => `${i + 1}. ${s.name}`), `${habitat.name} (return)`];
    sequenceSummaryEl.textContent = names.join(' → ');
  }
}

/**
 * Build a one-sentence comparison rationale for a route relative to the other alternative.
 */
function buildRationale(route, other) {
  const t = route.totals;
  const o = other.totals;
  const dDiff = Math.round(t.distance_m - o.distance_m);
  const riskA = t.mean_risk != null ? t.mean_risk : 0;
  const riskB = o.mean_risk != null ? o.mean_risk : 0;
  const slopeDiff = Math.round(o.max_slope_deg - t.max_slope_deg);

  if (route.kind === 'low_risk') {
    const distPart = dDiff > 0 ? `${dDiff} m longer` : 'Same distance';
    const riskDrop = (riskB - riskA).toFixed(1);
    const slopePart =
      slopeDiff > 0
        ? ` and reduces peak slope by ${slopeDiff}°`
        : `, max slope ${Math.round(t.max_slope_deg)}°`;
    return `${distPart}, lowers mean estimated risk by ${riskDrop} pts (${riskB.toFixed(1)} → ${riskA.toFixed(1)})${slopePart}.`;
  } else {
    const savedM = Math.max(0, Math.round(o.distance_m - t.distance_m));
    const riskRise = (riskA - riskB).toFixed(1);
    return `${savedM} m shorter direct path, with +${riskRise} pts higher mean estimated risk and ${Math.round(t.max_slope_deg)}° max slope.`;
  }
}

function drawRouteLines() {
  routeLayerGroup.clearLayers();
  const { shortest, low_risk } = currentRoutes;
  if (!shortest || !low_risk) return;

  const isLowRiskSelected = selectedRouteKind === 'low_risk';

  const lowRiskLine = L.polyline(
    low_risk.points.map((p) => xyToLatLng(p.x, p.y)),
    {
      color: '#34d399',
      weight: isLowRiskSelected ? 6 : 3.5,
      opacity: isLowRiskSelected ? 0.96 : 0.55,
    }
  )
    .addTo(routeLayerGroup)
    .bindTooltip(
      `Lowest estimated risk: ${Math.round(low_risk.totals.distance_m)} m · mean risk ${low_risk.totals.mean_risk.toFixed(1)}`
    );
  lowRiskLine.on('click', () => selectRouteKind('low_risk'));

  const shortestLine = L.polyline(
    shortest.points.map((p) => xyToLatLng(p.x, p.y)),
    {
      color: '#38bdf8',
      weight: !isLowRiskSelected ? 5 : 3,
      dashArray: '7 5',
      opacity: !isLowRiskSelected ? 0.96 : 0.65,
    }
  )
    .addTo(routeLayerGroup)
    .bindTooltip(
      `Shortest: ${Math.round(shortest.totals.distance_m)} m · mean risk ${shortest.totals.mean_risk.toFixed(1)}`
    );
  shortestLine.on('click', () => selectRouteKind('shortest'));

  if (isLowRiskSelected) {
    lowRiskLine.bringToFront();
  } else {
    shortestLine.bringToFront();
  }
}

function renderRouteCards() {
  routesContainerEl.innerHTML = '';
  const { shortest, low_risk } = currentRoutes;
  if (!shortest || !low_risk) {
    const empty = document.createElement('div');
    empty.className = 'route-empty';
    empty.textContent = 'Select at least one science stop on the left or on the map to compare routes.';
    routesContainerEl.appendChild(empty);
    return;
  }

  const pairs = [
    { route: low_risk, other: shortest },
    { route: shortest, other: low_risk },
  ];

  for (const { route, other } of pairs) {
    const t = route.totals;
    const evaS = totalEvaS(route);
    const overLimit = evaS > ASSUMPTIONS.EVA_LIMIT_S;
    const isSelected = selectedRouteKind === route.kind;

    const card = document.createElement('div');
    card.className = `route-card kind-${route.kind}${isSelected ? ' selected' : ''}`;
    card.dataset.kind = route.kind;

    const header = document.createElement('div');
    header.className = 'route-card-header';

    const title = document.createElement('div');
    title.className = 'route-card-title';
    const swatch = document.createElement('span');
    swatch.className = `route-swatch swatch-${route.kind}`;
    const titleText = document.createElement('span');
    titleText.textContent = route.name;
    title.append(swatch, titleText);

    const pill = document.createElement('span');
    pill.className = 'route-selected-pill';
    pill.textContent = isSelected ? 'Selected' : 'Select';

    header.append(title, pill);

    const metrics = document.createElement('div');
    metrics.className = 'route-metrics';

    const rows = [
      { label: 'Distance (one-way)', val: `${Math.round(t.distance_m)} m` },
      { label: 'Walk out time', val: formatDuration(t.walk_s) },
      { label: 'Stop work time', val: formatDuration(t.work_s) },
      { label: 'Return walk time', val: formatDuration(t.return_s) },
      { label: 'Total Marswalk (EVA)', val: formatDuration(evaS), className: 'total-eva' },
      { label: 'Max slope', val: `${Math.round(t.max_slope_deg)}°` },
      { label: 'Total ascent', val: `${Math.round(t.ascent_m)} m` },
      { label: 'Mean estimated risk', val: t.mean_risk != null ? t.mean_risk.toFixed(1) : 'N/A' },
      { label: 'No-data cells', val: String(t.nodata_cells) },
    ];

    for (const r of rows) {
      const rowEl = document.createElement('div');
      rowEl.className = `metric-row${r.className ? ' ' + r.className : ''}`;
      const lbl = document.createElement('span');
      lbl.className = 'metric-label';
      lbl.textContent = r.label;
      const val = document.createElement('span');
      val.className = 'metric-val';
      val.textContent = r.val;
      rowEl.append(lbl, val);
      metrics.appendChild(rowEl);
    }

    const rationale = document.createElement('div');
    rationale.className = 'route-rationale';
    rationale.textContent = buildRationale(route, other);

    card.append(header, metrics, rationale);

    if (overLimit) {
      const warn = document.createElement('div');
      warn.className = 'eva-limit-warning';
      warn.textContent = `Exceeds ${formatDuration(ASSUMPTIONS.EVA_LIMIT_S)} EVA planning limit (${formatDuration(evaS)}).`;
      card.appendChild(warn);
    }

    card.addEventListener('click', () => selectRouteKind(route.kind));
    routesContainerEl.appendChild(card);
  }
}

/**
 * Step 4: Render SVG elevation profile for the currently selected route, with habitat & stops marked.
 */
function renderElevationProfile() {
  const route = currentRoutes[selectedRouteKind];
  profileSvgEl.innerHTML = '';
  if (hoverMapMarker) {
    hoverMapMarker.remove();
    hoverMapMarker = null;
  }

  if (!route || !route.points || route.points.length < 2) {
    profileRouteLabelEl.textContent = '';
    profileHoverInfoEl.textContent = 'Select science stops to view elevation profile';
    return;
  }

  const color = route.kind === 'low_risk' ? '#34d399' : '#38bdf8';
  profileRouteLabelEl.textContent = `· ${route.name} (${Math.round(route.totals.distance_m)} m)`;
  profileHoverInfoEl.textContent = 'Hover over chart to inspect point on map';

  const W = profileSvgEl.clientWidth || 640;
  const H = profileSvgEl.clientHeight || 115;
  profileSvgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const padL = 52;
  const padR = 18;
  const padT = 18;
  const padB = 22;
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
    const margin = (maxElev - minElev) * 0.08;
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

  // Horizontal grid lines & elevation labels
  for (const frac of [0, 0.5, 1]) {
    const elevVal = minElev + frac * (maxElev - minElev);
    const y = yOf(elevVal);
    profileSvgEl.appendChild(
      el('line', { x1: padL, y1: y, x2: W - padR, y2: y, stroke: '#1f2b3d', 'stroke-width': 1 })
    );
    profileSvgEl.appendChild(
      el(
        'text',
        {
          x: padL - 6,
          y: y + 3.5,
          fill: '#7c90a8',
          'font-size': 10,
          'font-family': 'ui-monospace, monospace',
          'text-anchor': 'end',
        },
        `${elevVal.toFixed(0)} m`
      )
    );
  }

  // X-axis distance ticks
  for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
    const dVal = frac * maxDist;
    const x = xOf(dVal);
    profileSvgEl.appendChild(
      el(
        'text',
        {
          x,
          y: H - 5,
          fill: '#7c90a8',
          'font-size': 10,
          'font-family': 'ui-monospace, monospace',
          'text-anchor': frac === 0 ? 'start' : frac === 1 ? 'end' : 'middle',
        },
        `${Math.round(dVal)} m`
      )
    );
  }

  // Build path string for elevation line & area fill
  const validPts = pts.filter((p) => p.elev != null);
  if (validPts.length >= 2) {
    const lineCoords = validPts.map((p) => `${xOf(p.dist).toFixed(1)},${yOf(p.elev).toFixed(1)}`);
    const areaD =
      `M ${xOf(validPts[0].dist).toFixed(1)},${(padT + plotH).toFixed(1)} ` +
      `L ${lineCoords.join(' L ')} ` +
      `L ${xOf(validPts[validPts.length - 1].dist).toFixed(1)},${(padT + plotH).toFixed(1)} Z`;

    profileSvgEl.appendChild(
      el('path', {
        d: areaD,
        fill: color,
        'fill-opacity': 0.16,
      })
    );

    profileSvgEl.appendChild(
      el('polyline', {
        points: lineCoords.join(' '),
        fill: 'none',
        stroke: color,
        'stroke-width': 2.2,
      })
    );
  }

  // Mark Habitat at start (dist = 0)
  if (pts[0] && pts[0].elev != null) {
    const hx = xOf(0);
    const hy = yOf(pts[0].elev);
    profileSvgEl.appendChild(el('circle', { cx: hx, cy: hy, r: 4.5, fill: '#2f7ed8', stroke: '#ffffff', 'stroke-width': 1.5 }));
    profileSvgEl.appendChild(
      el('text', { x: hx + 4, y: padT + 10, fill: '#93c5fd', 'font-size': 10, 'font-weight': '700' }, 'H')
    );
  }

  // Mark each science stop along the route
  route.stops.forEach((s, idx) => {
    const pt = pts[s.point_index];
    if (!pt || pt.elev == null) return;
    const sx = xOf(pt.dist);
    const sy = yOf(pt.elev);

    profileSvgEl.appendChild(
      el('line', {
        x1: sx,
        y1: padT,
        x2: sx,
        y2: padT + plotH,
        stroke: '#e2a66f',
        'stroke-width': 1,
        'stroke-dasharray': '3 3',
      })
    );
    profileSvgEl.appendChild(
      el('circle', { cx: sx, cy: sy, r: 5, fill: '#e2a66f', stroke: '#10161f', 'stroke-width': 1.5 })
    );
    profileSvgEl.appendChild(
      el(
        'text',
        {
          x: sx,
          y: padT - 4,
          fill: '#fbbf24',
          'font-size': 10,
          'font-weight': '700',
          'text-anchor': idx === route.stops.length - 1 ? 'end' : 'middle',
        },
        `${idx + 1}. ${s.name}`
      )
    );
  });

  // Interactive hover cursor synchronized with map
  const hoverLine = el('line', {
    x1: 0,
    y1: padT,
    x2: 0,
    y2: padT + plotH,
    stroke: '#f8fafc',
    'stroke-width': 1,
    visibility: 'hidden',
  });
  const hoverDot = el('circle', {
    cx: 0,
    cy: 0,
    r: 4.5,
    fill: '#f8fafc',
    stroke: color,
    'stroke-width': 2,
    visibility: 'hidden',
  });
  profileSvgEl.append(hoverLine, hoverDot);

  const overlayRect = el('rect', {
    x: padL,
    y: padT,
    width: plotW,
    height: plotH,
    fill: 'transparent',
    style: 'cursor: crosshair;',
  });

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
      `Dist: ${Math.round(bestPt.dist)} m · Elev: ${bestPt.elev.toFixed(1)} m · ` +
      `Slope: ${bestPt.slope != null ? bestPt.slope + '°' : 'N/A'} · Risk: ${bestPt.risk != null ? bestPt.risk : 'no data'}`;

    if (!hoverMapMarker) {
      hoverMapMarker = L.circleMarker(xyToLatLng(bestPt.x, bestPt.y), {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
      }).addTo(map);
    } else {
      hoverMapMarker.setLatLng(xyToLatLng(bestPt.x, bestPt.y));
    }
  });

  overlayRect.addEventListener('mouseleave', () => {
    hoverLine.setAttribute('visibility', 'hidden');
    hoverDot.setAttribute('visibility', 'hidden');
    profileHoverInfoEl.textContent = 'Hover over chart to inspect point on map';
    if (hoverMapMarker) {
      hoverMapMarker.remove();
      hoverMapMarker = null;
    }
  });

  profileSvgEl.appendChild(overlayRect);
}

/**
 * Step 5: Render "Last measured conditions" and "Data and limits" panels.
 */
function renderConditionsAndLimits(conditions) {
  if (conditions && conditions.mock) {
    conditionsMockTagEl.hidden = false;
  }
  if (conditions && conditions.note) {
    conditionsNoteEl.textContent = conditions.note;
  }

  conditionsListEl.innerHTML = '';
  const items = (conditions && Array.isArray(conditions.items)) ? conditions.items : [];
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'condition-row';

    const left = document.createElement('div');
    left.className = 'cond-left';

    const label = document.createElement('div');
    label.className = 'cond-label';
    label.textContent = item.label;

    const meta = document.createElement('div');
    meta.className = 'cond-meta';
    meta.textContent = `Last measured: ${item.measured} · ${item.instrument}`;
    if (item.source_url) {
      meta.appendChild(document.createTextNode(' · '));
      const link = document.createElement('a');
      link.href = item.source_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Source';
      meta.appendChild(link);
    }

    left.append(label, meta);

    const val = document.createElement('div');
    val.className = 'cond-value';
    val.textContent = `${item.value} ${item.unit}`;

    row.append(left, val);
    conditionsListEl.appendChild(row);
  }

  // Data sources & cannot_see limits
  sourcesListEl.innerHTML = '';
  const sources = Array.isArray(grid.meta.sources) ? grid.meta.sources : [];
  for (const src of sources) {
    const card = document.createElement('div');
    card.className = 'source-card';

    const head = document.createElement('div');
    head.className = 'source-head';

    const layer = document.createElement('span');
    layer.className = 'source-layer';
    layer.textContent = src.layer;

    const res = document.createElement('span');
    res.className = 'source-res';
    res.textContent = src.resolution_m != null ? `${src.resolution_m} m/px` : '';

    head.append(layer, res);

    const meta = document.createElement('div');
    meta.className = 'source-meta';
    meta.textContent = `${src.mission || 'N/A'} · ${src.instrument || 'N/A'} (${src.product_id || 'N/A'})`;
    if (src.url) {
      meta.appendChild(document.createTextNode(' · '));
      const a = document.createElement('a');
      a.className = 'source-MetaLink';
      a.href = src.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'PDS/Archive';
      meta.appendChild(a);
    }

    const cannot = document.createElement('div');
    cannot.className = 'source-cannot';
    cannot.textContent = `Cannot resolve: ${src.cannot_see || 'Sub-pixel hazards must be checked visually.'}`;

    card.append(head, meta, cannot);
    sourcesListEl.appendChild(card);
  }

  // Risk model
  const rm = grid.meta.risk_model || {};
  riskModelBoxEl.textContent =
    `Slope limit: ${rm.slope_limit_deg != null ? rm.slope_limit_deg + '°' : 'N/A'} · ` +
    `${rm.description || 'Estimated risk model from grid metadata.'}`;

  // Planning assumptions from shared/walk-model.js
  assumptionsListEl.innerHTML = '';
  const assumptionEntries = [
    { label: 'Suit speed factor (vs. Tobler hiking)', val: `${ASSUMPTIONS.SUIT_SPEED_FACTOR}×` },
    { label: 'Return walk time factor (fatigue/samples)', val: `${ASSUMPTIONS.RETURN_FACTOR}×` },
    { label: 'Single Marswalk planning limit', val: formatDuration(ASSUMPTIONS.EVA_LIMIT_S) },
    { label: 'Science stop work duration', val: `${formatDuration(ASSUMPTIONS.STOP_WORK_S)} / stop` },
  ];
  for (const a of assumptionEntries) {
    const r = document.createElement('div');
    r.className = 'assumption-row';
    const l = document.createElement('span');
    l.textContent = a.label;
    const v = document.createElement('span');
    v.className = 'assumption-val';
    v.textContent = a.val;
    r.append(l, v);
    assumptionsListEl.appendChild(r);
  }
}

function recomputeRoutes() {
  routeLayerGroup.clearLayers();
  routeAlertEl.hidden = true;
  routeAlertEl.textContent = '';
  currentRoutes = { shortest: null, low_risk: null };

  const chosen = getSelectedStops();
  if (chosen.length === 0) {
    renderRouteCards();
    renderElevationProfile();
    statusEl.textContent = `${grid.meta.mock ? 'DEMO TERRAIN · ' : ''}${grid.cols} × ${grid.rows} cells of ${grid.cellSize} m · Select stops to plan route`;
    return;
  }

  const t0 = performance.now();
  const shortestRes = findMultiStopPath(grid, habitat, chosen, 0);
  if (!shortestRes.ok) {
    const msg = `No passable route to ${shortestRes.failedStop.name}`;
    routeAlertEl.textContent = msg;
    routeAlertEl.hidden = false;
    renderRouteCards();
    renderElevationProfile();
    statusEl.textContent = msg;
    return;
  }

  const lowRiskRes = findMultiStopPath(grid, habitat, chosen, 8);
  if (!lowRiskRes.ok) {
    const msg = `No passable route to ${lowRiskRes.failedStop.name}`;
    routeAlertEl.textContent = msg;
    routeAlertEl.hidden = false;
    renderRouteCards();
    renderElevationProfile();
    statusEl.textContent = msg;
    return;
  }
  const elapsedMs = (performance.now() - t0).toFixed(1);

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

  statusEl.textContent =
    `${grid.meta.mock ? 'DEMO TERRAIN · ' : ''}${chosen.length} stop(s) · ` +
    `Shortest: ${Math.round(shortestRoute.totals.distance_m)} m (risk ${shortestRoute.totals.mean_risk.toFixed(1)}) · ` +
    `Lowest estimated risk: ${Math.round(lowRiskRoute.totals.distance_m)} m (risk ${lowRiskRoute.totals.mean_risk.toFixed(1)}) [${elapsedMs} ms]`;
}

async function main() {
  grid = await loadGrid('../app_data/');
  if (grid.meta.mock) {
    demoBadgeEl.hidden = false;
    mapDemoBannerEl.hidden = false;
  }

  const bounds = mapBounds(grid);
  map = L.map('map', { crs: L.CRS.Simple, minZoom: -3, maxZoom: 3, zoomSnap: 0.25 });
  L.imageOverlay(fileUrl(grid, 'ortho'), bounds).addTo(map);
  const overlays = {
    'Estimated risk': L.imageOverlay(fileUrl(grid, 'risk_img'), bounds, { opacity: 0.7 }),
    Slope: L.imageOverlay(fileUrl(grid, 'slope_img'), bounds, { opacity: 0.7 }),
  };
  overlays['Estimated risk'].addTo(map);
  L.control.layers(null, overlays, { collapsed: false }).addTo(map);
  map.fitBounds(bounds);

  routeLayerGroup = L.layerGroup().addTo(map);

  const [stopsData, conditionsData] = await Promise.all([
    loadJson(grid, 'stops'),
    loadJson(grid, 'conditions'),
  ]);
  habitat = stopsData.habitat;
  allStops = stopsData.stops;

  renderConditionsAndLimits(conditionsData);

  habitatNameEl.textContent = habitat.name;
  habitatCoordsEl.textContent = `Origin & return · (${Math.round(habitat.x)} m E, ${Math.round(habitat.y)} m N)`;

  L.circleMarker(xyToLatLng(habitat.x, habitat.y), {
    radius: 9,
    color: '#ffffff',
    weight: 2,
    fillColor: '#2f7ed8',
    fillOpacity: 1,
  })
    .addTo(map)
    .bindTooltip(habitat.name);

  for (const stop of allStops) {
    const marker = L.marker(xyToLatLng(stop.x, stop.y), {
      icon: L.divIcon({
        className: 'map-stop-badge',
        html: '',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
    })
      .addTo(map)
      .bindTooltip(`${stop.name}: ${stop.description}`);

    marker.on('click', () => toggleStop(stop.id));
    stopMarkers.set(stop.id, marker);
  }

  clearStopsBtn.addEventListener('click', () => {
    selectedStopIds = [];
    renderStopsUI();
    recomputeRoutes();
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
  statusEl.textContent = `Error: ${err.message}`;
  console.error(err);
});
