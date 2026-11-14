// walk/walk.js — the walk screen, for work stream C. It only draws what walk/state.js and walk/status.js report.
// See docs/tasks/C_WALK.md for the order of work.
import { loadRoute, loadMockRoute } from '../shared/route.js';
import { formatDuration } from '../shared/walk-model.js';
import { createWalk } from './state.js';
import { readout } from './status.js';

const el = (id) => document.getElementById(id);

function render(route, s) {
  const r = readout(route, s);

  el('status').textContent = r.status.label;
  el('status').dataset.status = r.status.key;

  el('next-name').textContent = s.nextStop ? s.nextStop.name : 'Habitat';
  el('next-dist').textContent = `${Math.round(s.distanceToNextM)} m`;
  el('elapsed').textContent = formatDuration(s.elapsedS);

  if (r.habitatInS != null) {
    el('limit-label').textContent = 'Habitat in';
    el('limit').textContent = formatDuration(r.habitatInS);
  } else if (r.turnBackInS < 0) {
    el('limit-label').textContent = 'Overdue by';
    el('limit').textContent = formatDuration(-r.turnBackInS);
  } else {
    el('limit-label').textContent = 'Turn back in';
    el('limit').textContent = formatDuration(r.turnBackInS);
  }
}

async function main() {
  let route = loadRoute();
  let demo = false;
  if (!route) {
    route = await loadMockRoute('../app_data/');
    demo = true;
  }
  el('badge').textContent = demo ? 'DEMO ROUTE' : route.mock ? 'DEMO TERRAIN' : '';

  const walk = createWalk(route);
  render(route, walk.snapshot());
}

main().catch((err) => {
  el('status').textContent = 'ERROR';
  el('status').dataset.status = 'error';
  el('next-name').textContent = err.message;
  console.error(err);
});
