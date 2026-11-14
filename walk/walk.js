// walk/walk.js — the walk screen, for work stream C. It only draws what walk/state.js and walk/status.js report.
// See docs/tasks/C_WALK.md for the order of work.
import { loadRoute, loadMockRoute } from '../shared/route.js';
import { ASSUMPTIONS, formatDuration } from '../shared/walk-model.js';
import { createWalk, PHASE } from './state.js';
import { readout } from './status.js';

/** Longest step of real time one frame may add, so a stalled tab cannot jump the walk forward. */
const MAX_FRAME_S = 0.25;

/** Demo control: simulated seconds per real second. The first entry is the default. */
const DEMO_SPEEDS = [1, 30, 120];

const RETURN_SLOWER_PCT = Math.round((ASSUMPTIONS.RETURN_FACTOR - 1) * 100);
const RETURN_NOTE = `Same path, walked back. Return pace assumed ${RETURN_SLOWER_PCT} % slower.`;

const el = (id) => document.getElementById(id);

let route = null;
let walk = null;
let speed = DEMO_SPEEDS[0];
let lastFrameMs = null;

function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

function drawIndicators(s) {
  const r = readout(route, s);

  setText(el('status'), r.status.label);
  el('status').dataset.status = r.status.key;

  setText(el('next-name'), s.nextStop ? s.nextStop.name : 'Habitat');
  setText(el('next-dist'), `${Math.round(s.distanceToNextM)} m`);
  setText(el('elapsed'), formatDuration(s.elapsedS));

  if (r.habitatInS != null) {
    setText(el('limit-label'), 'Habitat in');
    setText(el('limit'), formatDuration(r.habitatInS));
  } else if (r.turnBackInS < 0) {
    setText(el('limit-label'), 'Overdue by');
    setText(el('limit'), formatDuration(-r.turnBackInS));
  } else {
    setText(el('limit-label'), 'Turn back in');
    setText(el('limit'), formatDuration(r.turnBackInS));
  }
}

function drawControls(s) {
  const headingHome = s.phase === PHASE.RETURNING || s.phase === PHASE.DONE;

  const run = el('btn-run');
  setText(run, s.phase === PHASE.READY ? 'Start' : s.phase === PHASE.DONE ? 'New walk' : s.running ? 'Pause' : 'Resume');

  // On the way home these two are removed, not greyed out: there is nothing left to decide.
  el('btn-done').hidden = headingHome;
  el('btn-back').hidden = headingHome;
  el('btn-done').disabled = s.phase !== PHASE.AT_STOP;
  el('btn-back').disabled = s.phase !== PHASE.WALKING && s.phase !== PHASE.AT_STOP;

  el('return-info').hidden = !headingHome;
  setText(el('return-title'), s.phase === PHASE.DONE ? 'Back at the habitat' : 'Returning to the habitat');
  setText(el('return-note'), s.phase === PHASE.DONE ? 'Marswalk complete.' : RETURN_NOTE);
}

function draw() {
  const s = walk.snapshot();
  drawIndicators(s);
  drawControls(s);
}

function frame(nowMs) {
  if (lastFrameMs != null) {
    const dtS = Math.min((nowMs - lastFrameMs) / 1000, MAX_FRAME_S);
    walk.tick(dtS * speed);
  }
  lastFrameMs = nowMs;
  draw();
  requestAnimationFrame(frame);
}

function bindControls() {
  el('btn-run').addEventListener('click', () => {
    const s = walk.snapshot();
    if (s.phase === PHASE.READY) walk.start();
    else if (s.phase === PHASE.DONE) walk = createWalk(route); // "New walk": back to the start, same route
    else if (s.running) walk.pause();
    else walk.resume();
    draw();
  });
  el('btn-done').addEventListener('click', () => {
    walk.doneHere();
    draw();
  });
  el('btn-back').addEventListener('click', () => {
    walk.turnBack();
    draw();
  });
}

/** Small speed switch for demos. It is not one of the astronaut's three buttons. */
function buildSpeedControl() {
  const group = el('speed');
  for (const value of DEMO_SPEEDS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'speed-btn';
    button.textContent = `×${value}`;
    button.setAttribute('aria-pressed', String(value === speed));
    button.addEventListener('click', () => {
      speed = value;
      for (const other of group.querySelectorAll('.speed-btn')) {
        other.setAttribute('aria-pressed', String(other === button));
      }
    });
    group.append(button);
  }
}

async function main() {
  route = loadRoute();
  let demo = false;
  if (!route) {
    route = await loadMockRoute('../app_data/');
    demo = true;
  }
  el('badge').textContent = demo ? 'DEMO ROUTE' : route.mock ? 'DEMO TERRAIN' : '';

  walk = createWalk(route);
  bindControls();
  buildSpeedControl();
  requestAnimationFrame(frame);
}

main().catch((err) => {
  el('status').textContent = 'ERROR';
  el('status').dataset.status = 'error';
  el('next-name').textContent = err.message;
  console.error(err);
});
