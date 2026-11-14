// plan/plan.js — Mission Planner screen (Work stream B).
import { loadGrid, loadJson, fileUrl, mapBounds, xyToLatLng } from '../shared/data.js';
import { buildRoute } from '../shared/route.js';
import { findMultiStopPath } from './astar.js';

const statusEl = document.getElementById('status');
const demoBadgeEl = document.getElementById('demo-badge');
const habitatNameEl = document.getElementById('habitat-name');
const habitatCoordsEl = document.getElementById('habitat-coords');
const stopsListEl = document.getElementById('stops-list');
const clearStopsBtn = document.getElementById('clear-stops-btn');
const sequenceSummaryEl = document.getElementById('sequence-summary');
const routeAlertEl = document.getElementById('route-alert');

let grid = null;
let habitat = null;
let allStops = [];
// Ordered array of selected stop IDs (selection order = visiting order)
let selectedStopIds = [];

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

function recomputeRoutes() {
  routeLayerGroup.clearLayers();
  routeAlertEl.hidden = true;
  routeAlertEl.textContent = '';

  const chosen = getSelectedStops();
  if (chosen.length === 0) {
    statusEl.textContent = `${grid.meta.mock ? 'DEMO TERRAIN · ' : ''}${grid.cols} × ${grid.rows} cells of ${grid.cellSize} m · Select stops to plan route`;
    return;
  }

  const t0 = performance.now();
  const shortestRes = findMultiStopPath(grid, habitat, chosen, 0);
  if (!shortestRes.ok) {
    const msg = `No passable route to ${shortestRes.failedStop.name}`;
    routeAlertEl.textContent = msg;
    routeAlertEl.hidden = false;
    statusEl.textContent = msg;
    return;
  }

  const lowRiskRes = findMultiStopPath(grid, habitat, chosen, 8);
  if (!lowRiskRes.ok) {
    const msg = `No passable route to ${lowRiskRes.failedStop.name}`;
    routeAlertEl.textContent = msg;
    routeAlertEl.hidden = false;
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

  // Draw Lowest estimated risk line first (thicker green) and Shortest line (dashed blue) on top
  L.polyline(
    lowRiskRoute.points.map((p) => xyToLatLng(p.x, p.y)),
    { color: '#34d399', weight: 5, opacity: 0.92 }
  )
    .addTo(routeLayerGroup)
    .bindTooltip(
      `Lowest estimated risk: ${Math.round(lowRiskRoute.totals.distance_m)} m · mean risk ${lowRiskRoute.totals.mean_risk.toFixed(1)}`
    );

  L.polyline(
    shortestRoute.points.map((p) => xyToLatLng(p.x, p.y)),
    { color: '#38bdf8', weight: 3, dashArray: '7 5', opacity: 0.95 }
  )
    .addTo(routeLayerGroup)
    .bindTooltip(
      `Shortest: ${Math.round(shortestRoute.totals.distance_m)} m · mean risk ${shortestRoute.totals.mean_risk.toFixed(1)}`
    );

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
