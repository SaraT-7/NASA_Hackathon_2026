// plan/ belongs to work stream B. Starter: shows the map, two overlays, the habitat and the stops.
// Replace and extend freely inside plan/. See docs/tasks/B_PLAN.md for the order of work.
import { loadGrid, loadJson, fileUrl, mapBounds, xyToLatLng } from '../shared/data.js';

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

  status.textContent = `${grid.meta.mock ? 'DEMO TERRAIN · ' : ''}${grid.cols} × ${grid.rows} cells of ${grid.cellSize} m`;
}

main().catch((err) => {
  status.textContent = `Error: ${err.message}`;
  console.error(err);
});
