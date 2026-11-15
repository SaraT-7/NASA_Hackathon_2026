// walk/state.js — the walk itself, for work stream C. Pure logic: no DOM, no timers, no storage.
// The screen (walk.js) advances it with tick() and draws what snapshot() returns; nothing else moves the walk.
// Every duration comes from the shared model: route.points[].time on the way out, returnTimeS() on the way back.

import { returnTimeS } from '../shared/route.js';
import { ASSUMPTIONS } from '../shared/walk-model.js';

export const PHASE = Object.freeze({
  READY: 'ready',
  WALKING: 'walking',
  AT_STOP: 'at_stop',
  RETURNING: 'returning',
  DONE: 'done',
});

const EPS = 1e-6;

/** The walker's pace is judged only after this much planned walking, so the first steps do not swing the estimate. */
export const PACE_MIN_PLANNED_S = 120;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, f) => a + (b - a) * f;

/**
 * Start a walk along a route object (docs/CONTRACT.md, section 4).
 * @param {Route} route  from loadRoute() or loadMockRoute()
 */
export function createWalk(route) {
  if (!route || !Array.isArray(route.points) || route.points.length < 2) {
    throw new Error('The route has no path to walk');
  }
  const points = route.points;
  const last = points.length - 1;
  const stops = Array.isArray(route.stops) ? route.stops : [];

  // Seconds needed to walk back to the habitat from each route point, return safety margin included.
  // Built one leg at a time with the shared returnTimeS(), so backS[i] equals returnTimeS(route, i).
  const backS = new Float64Array(points.length);
  for (let i = 1; i <= last; i++) {
    backS[i] = backS[i - 1] + returnTimeS({ points: [points[i - 1], points[i]] }, 1);
  }

  let phase = PHASE.READY;
  let running = false; // false = paused; pausing is not a phase, it only stops the clock
  let elapsedS = 0; // Marswalk clock: walking out, work at the stops, walking back
  let stopCursor = 0; // index in route.stops of the stop being walked to
  let seg = 0; // route point at or behind the position, counted from the habitat
  let frac = 0; // 0..1 of the way from point seg to point seg + 1
  let outS = 0; // outbound clock, in the same seconds as route.points[].time
  let backLeftS = 0; // while returning: planned seconds left to the habitat (return safety margin included)
  let walkedOutS = 0; // real seconds spent walking out, stops not counted: compared with outS to judge the pace
  let simPace = 1; // demo only: how fast the simulated walker moves compared with the plan (1 = as planned)

  /**
   * How much longer the walking takes than planned, judged from the walk so far: real walking seconds per
   * planned second. Never below 1: a faster walker keeps the planned times, a slower one gets less time.
   */
  function slowdown() {
    if (outS < PACE_MIN_PLANNED_S) return 1;
    return Math.max(1, walkedOutS / outS);
  }

  /** Value of a per-point quantity at the current position. */
  function here(valueAt) {
    return seg >= last ? valueAt(last) : lerp(valueAt(seg), valueAt(seg + 1), frac);
  }

  function placeAtPoint(index) {
    seg = index;
    frac = 0;
  }

  function targetIndex() {
    const stop = stops[stopCursor];
    if (!stop) return last;
    return Math.min(last, Math.max(0, Math.trunc(stop.point_index) || 0));
  }

  /** Position for a time on the outbound clock. The position only moves away from the habitat here. */
  function moveToOutboundTime(t) {
    while (seg < last && points[seg + 1].time <= t) seg++;
    if (seg >= last) return placeAtPoint(last);
    const span = points[seg + 1].time - points[seg].time;
    frac = span > 0 ? clamp01((t - points[seg].time) / span) : 0;
  }

  /** Position for a number of seconds left to the habitat. The position only moves towards the habitat here. */
  function moveToReturnTime(left) {
    while (seg > 0 && backS[seg] > left) seg--;
    if (seg >= last) return placeAtPoint(last);
    const span = backS[seg + 1] - backS[seg];
    frac = span > 0 ? clamp01((left - backS[seg]) / span) : 0;
  }

  function finish() {
    backLeftS = 0;
    placeAtPoint(0);
    phase = PHASE.DONE;
    running = false;
  }

  function beginReturn() {
    phase = PHASE.RETURNING;
    backLeftS = here((i) => backS[i]);
    if (backLeftS <= EPS) finish();
  }

  /** Stop at the target as soon as the outbound clock reaches it, so no tick size can walk past a stop. */
  function arriveIfThere() {
    const target = targetIndex();
    const targetT = points[target].time;
    if (outS < targetT - EPS) return;
    if (outS <= targetT + EPS) {
      outS = targetT;
      placeAtPoint(target);
    }
    if (stops[stopCursor]) phase = PHASE.AT_STOP;
    else beginReturn(); // a route without stops: walk to its end, then come back
  }

  // dtS is real time. The simulated walker covers dtS x simPace seconds of the plan in it.
  function advanceOut(dtS) {
    const planned = Math.min(dtS * simPace, Math.max(0, points[targetIndex()].time - outS));
    const real = planned / simPace;
    outS += planned;
    walkedOutS += real;
    elapsedS += real;
    moveToOutboundTime(outS);
    arriveIfThere();
  }

  function advanceBack(dtS) {
    const planned = Math.min(dtS * simPace, backLeftS);
    backLeftS -= planned;
    elapsedS += planned / simPace;
    if (backLeftS <= EPS) finish();
    else moveToReturnTime(backLeftS);
  }

  return {
    route,

    /** ready -> walking. Returns false when the walk has already started. */
    start() {
      if (phase !== PHASE.READY) return false;
      phase = PHASE.WALKING;
      running = true;
      arriveIfThere();
      return true;
    },

    /** Stop the clock in any phase. */
    pause() {
      if (phase === PHASE.READY || phase === PHASE.DONE) return false;
      running = false;
      return true;
    },

    resume() {
      if (phase === PHASE.READY || phase === PHASE.DONE) return false;
      running = true;
      return true;
    },

    /**
     * Advance the simulated clock by dtS seconds. While walking the position follows route.points[].time;
     * while returning it follows the same path backwards, timed with the return safety margin. At a stop the walk waits
     * for doneHere(), and nothing moves while paused.
     */
    tick(dtS) {
      if (!running || !(dtS > 0)) return;
      if (phase === PHASE.WALKING) advanceOut(dtS);
      else if (phase === PHASE.RETURNING) advanceBack(dtS);
    },

    /** Demo control: the simulated walker's pace compared with the plan (1 = as planned, 0.5 = half as fast). */
    setSimPace(pace) {
      if (!(pace > 0)) return false;
      simPace = pace;
      return true;
    },

    /** "Done here": adds the work time for this stop, then walks on, or starts the return after the last stop. */
    doneHere() {
      if (phase !== PHASE.AT_STOP) return false;
      elapsedS += ASSUMPTIONS.STOP_WORK_S;
      stopCursor++;
      running = true;
      if (stopCursor >= stops.length) beginReturn();
      else {
        phase = PHASE.WALKING;
        arriveIfThere();
      }
      return true;
    },

    /** "Turn back": from the walk or from a stop, return to the habitat along the same path. */
    turnBack() {
      if (phase !== PHASE.WALKING && phase !== PHASE.AT_STOP) return false;
      running = true;
      beginReturn();
      return true;
    },

    /** Everything the screen needs, as plain values. */
    snapshot() {
      const headingHome = phase === PHASE.RETURNING || phase === PHASE.DONE;
      const distHereM = here((i) => points[i].dist);
      return {
        phase,
        running,
        elapsedS,
        // The route point at or just beyond the position, so returnTimeS(route, pointIndex) never
        // promises a shorter walk home than the real one.
        pointIndex: frac > EPS ? seg + 1 : seg,
        nextStop: headingHome ? null : stops[stopCursor] || null,
        x: here((i) => points[i].x),
        y: here((i) => points[i].y),
        // Along the path: to the next stop on the way out, to the habitat on the way back.
        distanceToNextM: headingHome ? distHereM : Math.max(0, points[targetIndex()].dist - distHereM),
        // Planned return time stretched by the pace measured on the way out.
        habitatInS: phase === PHASE.RETURNING ? backLeftS * slowdown() : null,
        // Real walking seconds per planned second so far (1 until enough walking has been seen, never below 1).
        // Every time still to walk is multiplied by it: turn-back moment, oxygen line, stop check.
        slowdown: slowdown(),
        pacePct: outS >= PACE_MIN_PLANNED_S && walkedOutS > 0 ? (outS / walkedOutS) * 100 : null,
        stopsDone: Math.min(stopCursor, stops.length),
        stopsTotal: stops.length,
      };
    },
  };
}
