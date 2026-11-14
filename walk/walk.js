// walk/walk.js — the walk screen, for work stream C. It only draws what walk/state.js and walk/status.js report.
// See docs/tasks/C_WALK.md for the order of work.
import { loadRoute, loadMockRoute } from '../shared/route.js';
import { ASSUMPTIONS, formatDuration } from '../shared/walk-model.js';
import { createWalk, PHASE } from './state.js';
import { readout } from './status.js';
import { nextStopCheck } from './check.js';
import { oxygenGauge, budgetPct } from './oxygen.js';
import { loadGridMeta, createWalkMap } from './map.js';
import { loadJson } from '../shared/data.js';

/** Longest step of real time one frame may add, so a stalled tab cannot jump the walk forward. */
const MAX_FRAME_S = 0.25;

/** Demo control: simulated seconds per real second. The first entry is the default. */
const DEMO_SPEEDS = [1, 30, 120];

const RETURN_MARGIN_PCT = Math.round((ASSUMPTIONS.RETURN_FACTOR - 1) * 100);
const RETURN_NOTE = `Same path, walked back. Planned time includes a ${RETURN_MARGIN_PCT} % safety margin.`;

const el = (id) => document.getElementById(id);

let route = null;
let walk = null;
let walkMap = null; // stays null if the map cannot be drawn; the walk still works without it
let stopInfo = new Map(); // stop id -> entry from stops.json (description, photo); empty if it cannot be read
let photoBase = '../app_data/';
let shownStopId = null;
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
  return r.status.key;
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

/** Whole percent for display; never shows 0 % while some budget is left. */
function pct(value) {
  if (value <= 0) return 0;
  return Math.max(1, Math.round(value));
}

/** Battery-style gauge: estimated oxygen left, with a line at what the walk back needs. */
function drawOxygen(s, statusKey) {
  const g = oxygenGauge(route, s);
  setText(el('o2-left'), `${pct(g.leftPct)} %`);
  el('o2-fill').style.width = `${Math.min(100, g.leftPct)}%`;
  el('o2-fill').dataset.status = statusKey;
  el('o2-home').style.left = `${Math.min(100, g.homePct)}%`;
  el('o2-home').hidden = g.homePct <= 0;
  const budget = `100 % = ${Math.round((ASSUMPTIONS.EVA_LIMIT_S / 3600) * 10) / 10} h suit budget.`;
  let note;
  if (s.phase === PHASE.DONE) note = `Back inside with ${pct(g.leftPct)} % left.`;
  else if (g.homePct <= 0) note = budget;
  else note = `Line: walk back needs ${pct(g.homePct)} %. ${budget}`;
  setText(el('o2-note'), note);
}

/** Credit line under a Curiosity photo, from the fields stops.json provides. */
function photoCredit(photo) {
  return [`Curiosity ${photo.instrument || ''}`.trim(), photo.sol != null ? `sol ${photo.sol}` : null, photo.credit].filter(Boolean).join(' · ');
}

/** At a stop the stop card covers the map: name, description and Curiosity's photo from that spot. */
function drawStopCard(s) {
  const atStop = s.phase === PHASE.AT_STOP && s.nextStop;
  el('stop-card').hidden = !atStop;
  if (!atStop) {
    shownStopId = null;
    return;
  }
  if (shownStopId === s.nextStop.id) return; // filled once per stop
  shownStopId = s.nextStop.id;
  const info = stopInfo.get(s.nextStop.id) || {};
  setText(el('stop-num'), String(s.stopsDone + 1)); // same number as on the map
  el('stop-num').title = `Stop ${s.stopsDone + 1} of ${s.stopsTotal}`;
  setText(el('stop-name'), info.name || s.nextStop.name);
  setText(el('stop-desc'), info.description || '');
  const photo = info.photo;
  el('stop-photo-wrap').hidden = !photo;
  el('stop-credit').hidden = !photo;
  if (photo) {
    el('stop-photo').src = photoBase + photo.file;
    el('stop-photo').alt = photo.caption || `Curiosity photo at ${info.name || s.nextStop.name}`;
    setText(el('stop-credit'), photoCredit(photo));
  }
}

/** At a stop: is there enough oxygen to go on to the next stop, work there and walk back? */
function drawCheck(s) {
  const c = nextStopCheck(route, s);
  const box = el('stop-check');
  box.hidden = !c;
  if (!c) return;
  box.dataset.verdict = c.verdict.key;
  const have = pct(budgetPct(c.haveS));
  const leftAtHome = Math.round(budgetPct(c.spareS));
  const need = have - leftAtHome; // so the three numbers on screen always add up
  setText(el('check-plan'), c.last
    ? `Last stop. Finishing here and walking back needs ${need} % of your ${have} %.`
    : `Next: ${c.next.name} and back needs ${need} % of your ${have} %.`);
  setText(el('check-verdict'), c.verdict.label);
  setText(el('check-left'), leftAtHome >= 0 ? `${leftAtHome} % left at the habitat` : `${-leftAtHome} % short. Turn back from here.`);
}

function draw() {
  const s = walk.snapshot();
  if (walkMap) walkMap.update(s);
  el('speed').hidden = s.phase === PHASE.AT_STOP; // the clock waits at a stop, and the stop card covers the map
  const statusKey = drawIndicators(s);
  drawOxygen(s, statusKey);
  drawStopCard(s);
  drawCheck(s);
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
  try {
    const grid = await loadGridMeta('../app_data/');
    photoBase = grid.base;
    try {
      const { stops } = await loadJson(grid, 'stops');
      stopInfo = new Map(stops.map((stop) => [stop.id, stop]));
      for (const stop of stops) if (stop.photo) new Image().src = grid.base + stop.photo.file; // ready before arrival
    } catch (err) {
      console.warn('Stop details not available:', err.message);
    }
    walkMap = createWalkMap(el('stage'), grid, route);
    window.addEventListener('resize', () => walkMap.resize());
  } catch (err) {
    el('stage').classList.add('map-missing');
    console.warn('Map not available:', err.message);
  }
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
