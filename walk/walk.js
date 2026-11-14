// walk/ belongs to work stream C. Starter: loads the chosen route (or the demo route) and shows its totals.
// Replace and extend freely inside walk/. See docs/tasks/C_WALK.md for the order of work.
import { loadRoute, loadMockRoute, totalEvaS } from '../shared/route.js';
import { formatDuration } from '../shared/walk-model.js';

async function main() {
  let route = loadRoute();
  let demo = false;
  if (!route) {
    route = await loadMockRoute('../app_data/');
    demo = true;
  }
  document.getElementById('badge').textContent = demo ? 'DEMO ROUTE' : route.mock ? 'DEMO TERRAIN' : '';
  document.getElementById('next').textContent = route.stops.length ? route.stops[0].name : 'No stops';
  document.getElementById('distance').textContent =
    `${Math.round(route.totals.distance_m)} m out · ${route.stops.length} stops`;
  document.getElementById('time').textContent = formatDuration(totalEvaS(route));
}

main().catch((err) => {
  document.getElementById('next').textContent = `Error: ${err.message}`;
  console.error(err);
});
