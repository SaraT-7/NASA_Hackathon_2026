// walk/walk.js — the walk screen, for work stream C. It only draws what walk/state.js reports.
// See docs/tasks/C_WALK.md for the order of work.
import { loadRoute, loadMockRoute } from '../shared/route.js';
import { formatDuration } from '../shared/walk-model.js';
import { createWalk } from './state.js';

const el = (id) => document.getElementById(id);

function render(s) {
  const target = s.nextStop ? s.nextStop.name : 'Habitat';
  el('next').textContent = `${target} · ${Math.round(s.distanceToNextM)} m`;
  el('phase').textContent = `${s.phase} · stop ${s.stopsDone} of ${s.stopsTotal}`;
  el('elapsed').textContent = formatDuration(s.elapsedS);
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
  render(walk.snapshot());
}

main().catch((err) => {
  el('next').textContent = `Error: ${err.message}`;
  console.error(err);
});
