// plan/ belongs to work stream B. Starter: shows the map, two overlays, the habitat and the stops.
// Replace and extend freely inside plan/. See docs/tasks/B_PLAN.md for the order of work.
import { loadGrid, loadJson, fileUrl, mapBounds, xyToLatLng } from '../shared/data.js';
import { buildRoute } from '../shared/route.js';
import { findPath, pointToIndex } from './astar.js';

const status = document.getElementById('status');

async function main() {
  const grid = await loadGrid('../app_data/');
  const bounds = mapBounds(grid);

  const map = L.map('map', { crs: L.CRS.Simple, minZoom: -3, maxZoom: 3, zoomSnap: 0.25 });
  L.imageOverlay(fileUrl(grid, 'ortho'), bounds).addTo(map);
  const overlays = {
    'Estimated risk': L.imageOverlay(fileUrl(grid, 'risk_img'), bounds, { opacity: 0.7 }),
    Slope: L.imageOverlay(fileUrl(grid, 'slope_img'), bounds, { opacity: 0.7 }),
  };
  overlays['Estimated risk'].addTo(map);
  L.control.layers(null, overlays, { collapsed: false }).addTo(map);
  map.fitBounds(bounds);

  const { habitat, stops } = await loadJson(grid, 'stops');
  L.circleMarker(xyToLatLng(habitat.x, habitat.y), { radius: 9, color: '#ffffff', fillColor: '#2f7ed8', fillOpacity: 1 })
    .addTo(map)
    .bindTooltip(habitat.name);
  for (const stop of stops) {
    L.circleMarker(xyToLatLng(stop.x, stop.y), { radius: 7, color: '#ffffff', fillColor: '#e2a66f', fillOpacity: 1 })
      .addTo(map)
      .bindTooltip(stop.name);
  }

  // Step 1 verification: compute shortest (weight=0) and lowest estimated risk (weight=8) routes to first stop
  const startIdx = pointToIndex(grid, habitat);
  const goalIdx = pointToIndex(grid, stops[0]);
  const t0 = performance.now();
  const shortestCells = findPath(grid, startIdx, goalIdx, 0);
  const lowRiskCells = findPath(grid, startIdx, goalIdx, 8);
  const elapsedMs = (performance.now() - t0).toFixed(1);

  const shortestRoute = buildRoute(grid, shortestCells, {
    name: 'Shortest',
    kind: 'shortest',
    weight: 0,
    stops: [stops[0]],
  });
  const lowRiskRoute = buildRoute(grid, lowRiskCells, {
    name: 'Lowest estimated risk',
    kind: 'low_risk',
    weight: 8,
    stops: [stops[0]],
  });

  L.polyline(
    shortestRoute.points.map((p) => xyToLatLng(p.x, p.y)),
    { color: '#60a5fa', weight: 3, dashArray: '6 4' }
  )
    .addTo(map)
    .bindTooltip(`Shortest: ${Math.round(shortestRoute.totals.distance_m)} m, mean risk ${shortestRoute.totals.mean_risk.toFixed(1)}`);

  L.polyline(
    lowRiskRoute.points.map((p) => xyToLatLng(p.x, p.y)),
    { color: '#34d399', weight: 4 }
  )
    .addTo(map)
    .bindTooltip(`Lowest estimated risk: ${Math.round(lowRiskRoute.totals.distance_m)} m, mean risk ${lowRiskRoute.totals.mean_risk.toFixed(1)}`);

  status.textContent =
    `${grid.meta.mock ? 'DEMO TERRAIN · ' : ''}${grid.cols} × ${grid.rows} cells of ${grid.cellSize} m · ` +
    `A* ${stops[0].id}: shortest ${Math.round(shortestRoute.totals.distance_m)} m (risk ${shortestRoute.totals.mean_risk.toFixed(1)}), ` +
    `lowest estimated risk ${Math.round(lowRiskRoute.totals.distance_m)} m (risk ${lowRiskRoute.totals.mean_risk.toFixed(1)}) [${elapsedMs} ms]`;
}

main().catch((err) => {
  status.textContent = `Error: ${err.message}`;
  console.error(err);
});
