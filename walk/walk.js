// walk/walk.js — the walk screen, for work stream C. It only draws what walk/state.js and walk/status.js report.
// See docs/tasks/C_WALK.md for the order of work.
import { loadRoute, loadMockRoute, buildRoute } from '../shared/route.js';
import { ASSUMPTIONS, formatDuration } from '../shared/walk-model.js';
import { createWalk, PHASE } from './state.js';
import { readout } from './status.js';
import { nextStopCheck } from './check.js';
import { oxygenGauge, budgetPct } from './oxygen.js';
import { loadGridMeta, createWalkMap } from './map.js';
import { loadJson, loadGrid, xyToCell, cellIndex } from '../shared/data.js';
import { findPath } from '../plan/astar.js';

/** Longest step of real time one frame may add, so a stalled tab cannot jump the walk forward. */
const MAX_FRAME_S = 0.25;

/** Demo control: simulated seconds per real second. The first entry is the default. */
const DEMO_SPEEDS = [1, 30, 120];
// Demo control: how fast the simulated walker moves compared with the plan. Slower than planned shortens
// "Turn back in" (docs/tasks/C_WALK.md, "Çekirdekten sonra" 2); 30 % makes the strip turn yellow, then red.
const DEMO_PACES = [1, 0.6, 0.3];

const RETURN_MARGIN_PCT = Math.round((ASSUMPTIONS.RETURN_FACTOR - 1) * 100);
const RETURN_NOTE = `Same path, walked back. Planned time includes a ${RETURN_MARGIN_PCT}\u00a0% safety margin.`;

/** Under "Returning to the habitat": which path home, and why. */
function returnNote(s) {
  if (s.returnPath !== 'direct') return RETURN_NOTE;
  return `Direct path, ${formatDuration(s.returnSavedS)} shorter than the way you came. Planned on the risk map; includes a ${RETURN_MARGIN_PCT}\u00a0% safety margin.`;
}

const el = (id) => document.getElementById(id);

let route = null;
let walk = null;
let walkMap = null; // stays null if the map cannot be drawn; the walk still works without it
let stopInfo = new Map(); // stop id -> entry from stops.json (description, photo); empty if it cannot be read
let photoBase = '../app_data/';
let shownStopId = null;
let speed = DEMO_SPEEDS[0];
let pace = DEMO_PACES[0];
let lastFrameMs = null;
let fullGrid = null; // risk, slope and elevation rasters for planning a direct path home; null until loaded

/**
 * Direct path home from (x, y): the planner's A* on the same risk map, with the route's own risk weight, built into
 * route points with the shared buildRoute() (habitat first). null when the grid is not loaded or there is no path;
 * the walk then goes back the way it came.
 */
function planDirectReturn(x, y) {
  if (!fullGrid) return null;
  const home = route.points[0];
  const from = xyToCell(fullGrid, home.x, home.y);
  const to = xyToCell(fullGrid, x, y);
  if (!from || !to) return null;
  const weight = Number.isFinite(route.weight) ? route.weight : 0;
  const cells = findPath(fullGrid, cellIndex(fullGrid, from.col, from.row), cellIndex(fullGrid, to.col, to.row), weight);
  if (!cells || cells.length < 2) return null;
  return buildRoute(fullGrid, cells, { name: 'Direct path home', kind: route.kind, weight }).points;
}

const newWalk = () => createWalk(route, { planReturn: planDirectReturn });

function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

/** Under "Turn back in": whether the times still to walk are the planned ones or stretched to the measured pace. */
function paceNote(s) {
  // Shown only when it changes the answer: the astronaut is slower than planned.
  if (s.phase === PHASE.DONE || s.pacePct == null || s.slowdown <= 1) return '';
  return `pace ${Math.round(s.pacePct)}\u00a0% of plan`;
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
  setText(el('pace-note'), paceNote(s));
  return r.status.key;
}

function drawControls(s) {
  const headingHome = s.phase === PHASE.RETURNING || s.phase === PHASE.DONE;

  const run = el('btn-run');
  setText(run, s.phase === PHASE.READY ? 'Start' : s.phase === PHASE.DONE ? 'New walk' : s.running ? 'Pause' : 'Resume');
  // At a stop the clock already waits (the stop's work time is added by "Done here"), so Pause would do nothing.
  run.disabled = s.phase === PHASE.AT_STOP;

  // At the last stop "Done here" also starts the walk home: say so, so it is not mistaken for "Turn back"
  // (which leaves at once, without the stop's work, skipping any stops left).
  const lastStop = s.phase === PHASE.AT_STOP && s.stopsDone + 1 >= s.stopsTotal;
  setText(el('btn-done'), lastStop ? 'Done · go home' : 'Done here');

  // On the way home these two are removed, not greyed out: there is nothing left to decide.
  el('btn-done').hidden = headingHome;
  el('btn-back').hidden = headingHome;
  el('btn-done').disabled = s.phase !== PHASE.AT_STOP;
  el('btn-back').disabled = s.phase !== PHASE.WALKING && s.phase !== PHASE.AT_STOP;

  el('return-info').hidden = !headingHome;
  setText(el('return-title'), s.phase === PHASE.DONE ? 'Back at the habitat' : 'Returning to the habitat');
  setText(el('return-note'), s.phase === PHASE.DONE ? 'Marswalk complete.' : returnNote(s));
}

/** Whole percent for display; never shows 0 % while some budget is left. */
function pct(value) {
  if (value <= 0) return 0;
  return Math.max(1, Math.round(value));
}

/** Battery-style gauge: estimated oxygen left, with a line at what the walk back needs. */
function drawOxygen(s, statusKey) {
  const g = oxygenGauge(route, s);
  setText(el('o2-left'), `${pct(g.leftPct)}\u00a0%`);
  el('o2-fill').style.width = `${Math.min(100, g.leftPct)}%`;
  el('o2-fill').dataset.status = statusKey;
  el('o2-home').style.left = `${Math.min(100, g.homePct)}%`;
  el('o2-home').hidden = g.homePct <= 0;
  const budget = `100\u00a0% = ${Math.round((ASSUMPTIONS.EVA_LIMIT_S / 3600) * 10) / 10}\u00a0h suit budget`;
  let note;
  if (s.phase === PHASE.DONE) note = `${pct(g.leftPct)}\u00a0% left at the habitat`;
  else if (g.homePct <= 0) note = budget;
  else note = `line: walk back ${pct(g.homePct)}\u00a0% · ${budget}`;
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
    ? `Last stop. Finishing here and walking back needs ${need}\u00a0% of your ${have}\u00a0%.`
    : `Next: ${c.next.name} and back needs ${need}\u00a0% of your ${have}\u00a0%.`);
  setText(el('check-verdict'), c.verdict.label);
  setText(el('check-left'), leftAtHome >= 0 ? `${leftAtHome}\u00a0% left at the habitat` : `${-leftAtHome}\u00a0% short. Turn back from here.`);
}

function draw() {
  const s = walk.snapshot();
  if (walkMap) walkMap.update(s);
  document.body.dataset.phase = s.phase; // lets the small-screen layout give the stop card more room
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
    else if (s.phase === PHASE.DONE) { // "New walk": back to the start, same route, same demo pace
      walk = newWalk();
      walk.setSimPace(pace);
    }
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

/** One row of demo buttons; the pressed one is marked, and onPick receives its value. */
function buildDemoRow(rowId, values, label, current, onPick) {
  const row = el(rowId);
  for (const value of values) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'speed-btn';
    button.textContent = label(value);
    button.setAttribute('aria-pressed', String(value === current));
    button.addEventListener('click', () => {
      onPick(value);
      for (const other of row.querySelectorAll('.speed-btn')) {
        other.setAttribute('aria-pressed', String(other === button));
      }
    });
    row.append(button);
  }
}

const paceLabel = (v) => `${Math.round(v * 100)}\u00a0%`;

/**
 * Demo controls, folded into one small chip in the corner of the map so they do not cover the route.
 * The chip shows the current settings; tapping it opens the speed and pace rows. Not for the astronaut.
 */
function buildSpeedControl() {
  const toggle = el('demo-toggle');
  const rows = el('demo-rows');
  const showChip = () => setText(toggle, `demo ×${speed} · ${paceLabel(pace)}`);
  const setOpen = (open) => {
    rows.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(rows.hidden));
  buildDemoRow('speed-row', DEMO_SPEEDS, (v) => `×${v}`, speed, (v) => { speed = v; showChip(); });
  buildDemoRow('pace-row', DEMO_PACES, paceLabel, pace, (v) => {
    pace = v;
    walk.setSimPace(v);
    showChip();
  });
  showChip();
}

/** Size of the wide-screen panel (walk.css, min-width 520 px): scaled to fit the window, never wider than it. */
const FRAME_W = 402;
const FRAME_H = 874;
const FRAME_MAX_ZOOM = 1.2;

function fitFrame() {
  const wide = window.matchMedia('(min-width: 520px)').matches;
  const zoom = wide ? Math.min(FRAME_MAX_ZOOM, (window.innerHeight - 24) / FRAME_H, (window.innerWidth - 24) / FRAME_W) : 1;
  document.documentElement.style.setProperty('--frame-zoom', zoom.toFixed(3));
}
fitFrame();
window.addEventListener('resize', fitFrame);

async function main() {
  route = loadRoute();
  let demo = false;
  if (!route) {
    route = await loadMockRoute('../app_data/');
    demo = true;
  }
  el('badge').textContent = demo ? 'DEMO ROUTE' : route.mock ? 'DEMO TERRAIN' : '';

  walk = newWalk();
  walk.setSimPace(pace);
  // In the background: the rasters for a direct path home (a few MB, kept offline by sw.js). Until they arrive, or
  // if they cannot be read, Turn back walks the same path back.
  loadGrid('../app_data/')
    .then((grid) => {
      if (!route.grid_name || route.grid_name === grid.meta.name) fullGrid = grid;
    })
    .catch((err) => console.warn('Direct path home not available:', err.message));
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

// Offline: keep the screen and its data on the device after the first visit (walk/sw.js). Browsers allow this only
// on https:// or http://localhost; elsewhere the page simply works online as before.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Offline copy not available:', err.message));
  });
}
