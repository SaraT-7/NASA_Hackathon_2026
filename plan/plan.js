// plan/plan.js — Mission Planner screen (Work stream B).
import { loadGrid, loadJson, fileUrl, mapBounds, xyToLatLng } from '../shared/data.js';
import { buildRoute, totalEvaS } from '../shared/route.js';
import { ASSUMPTIONS, formatDuration } from '../shared/walk-model.js';
import { findMultiStopPath } from './astar.js';

const statusEl = document.getElementById('status');
const demoBadgeEl = document.getElementById('demo-badge');
const habitatNameEl = document.getElementById('habitat-name');
const habitatCoordsEl = document.getElementById('habitat-coords');
const stopsListEl = document.getElementById('stops-list');
const clearStopsBtn = document.getElementById('clear-stops-btn');
const sequenceSummaryEl = document.getElementById('sequence-summary');
const routeAlertEl = document.getElementById('route-alert');
const routesContainerEl = document.getElementById('routes-container');

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

function recomputeRoutes() {
  routeLayerGroup.clearLayers();
  routeAlertEl.hidden = true;
  routeAlertEl.textContent = '';
  currentRoutes = { shortest: null, low_risk: null };

  const chosen = getSelectedStops();
  if (chosen.length === 0) {
    renderRouteCards();
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
    statusEl.textContent = msg;
    return;
  }

  const lowRiskRes = findMultiStopPath(grid, habitat, chosen, 8);
  if (!lowRiskRes.ok) {
    const msg = `No passable route to ${lowRiskRes.failedStop.name}`;
    routeAlertEl.textContent = msg;
    routeAlertEl.hidden = false;
    renderRouteCards();
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

  statusEl.textContent =
    `${grid.meta.mock ? 'DEMO TERRAIN · ' : ''}${chosen.length} stop(s) · ` +
    `Shortest: ${Math.round(shortestRoute.totals.distance_m)} m (risk ${shortestRoute.totals.mean_risk.toFixed(1)}) · ` +
    `Lowest estimated risk: ${Math.round(lowRiskRoute.totals.distance_m)} m (risk ${lowRiskRoute.totals.mean_risk.toFixed(1)}) [${elapsedMs} ms]`;
}

async function main() {
  grid = await loadGrid('../app_data/');
  if (grid.meta.mock) {
    demoBadgeEl.hidden = false;
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

  const stopsData = await loadJson(grid, 'stops');
  habitat = stopsData.habitat;
  allStops = stopsData.stops;

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
