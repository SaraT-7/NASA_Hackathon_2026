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

/** A direct path home replaces the way back only when it saves at least this much planned time. */
export const DIRECT_MIN_GAIN_S = 60;

/** The walker's pace is judged only after this much planned walking, so the first steps do not swing the estimate. */
export const PACE_MIN_PLANNED_S = 120;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, f) => a + (b - a) * f;

/**
 * Start a walk along a route object (docs/CONTRACT.md, section 4).
 * @param {Route} route  from loadRoute() or loadMockRoute()
 * @param {object} [opts]
 * @param {(x: number, y: number) => object[]|null} [opts.planReturn]  route points of a direct path from the habitat
 *   to (x, y), or null. When the walk heads home (Turn back, or after the last stop) and walking this path backwards
 *   takes less time than the way the astronaut came, it is used instead. Without it, or if it is not shorter, the
 *   astronaut walks back along the same path.
 */
export function createWalk(route, opts = {}) {
  if (!route || !Array.isArray(route.points) || route.points.length < 2) {
    throw new Error('The route has no path to walk');
  }
  // The path being walked: route.points, until a shorter direct path home replaces it on the way back.
  let points = route.points;
  let last = points.length - 1;
  const stops = Array.isArray(route.stops) ? route.stops : [];
  const planReturn = typeof opts.planReturn === 'function' ? opts.planReturn : null;

  /**
   * Seconds needed to walk back to the start of a path (the habitat) from each of its points, return safety margin
   * included. Built one leg at a time with the shared returnTimeS(), so t[i] equals returnTimeS({ points }, i).
   */
  function returnTimes(pts) {
    const t = new Float64Array(pts.length);
    for (let i = 1; i < pts.length; i++) t[i] = t[i - 1] + returnTimeS({ points: [pts[i - 1], pts[i]] }, 1);
    return t;
  }
  let backS = returnTimes(points);
  let directReturn = false; // true once the walk home follows a direct path instead of the way out
  let returnSavedS = 0; // planned seconds the direct path saves (return safety margin included)

  let phase = PHASE.READY;
  let running = false; // false = paused; pausing is not a phase, it only stops the clock
  let elapsedS = 0; // Marswalk clock: walking out, work at the stops, walking back
  let stopCursor = 0; // index in route.stops of the stop being walked to
  let seg = 0; // route point at or behind the position, counted from the habitat
  let frac = 0; // 0..1 of the way from point seg to point seg + 1
  let outS = 0; // outbound clock, in the same seconds as route.points[].time
  let backLeftS = 0; // while returning: planned seconds left to the habitat (return safety margin included)
  let walkedOutS = 0; // real seconds spent walking out, stops not counted: compared with outS to judge the pace
  let backDoneS = 0; // planned return seconds already walked (return safety margin included)
  let walkedBackS = 0; // real seconds spent walking back: compared with backDoneS
  let simPace = 1; // demo only: how fast the simulated walker moves compared with the plan (1 = as planned)

  /**
   * Real walking seconds per planned second, measured on the way out and, once returning, on the way back too.
   * The slower of the two is used, so slowing down on the way home is noticed at once. Stops are not counted.
   * null until enough walking has been seen for the first steps not to swing it.
   */
  function paceRatio() {
    const out = outS >= PACE_MIN_PLANNED_S ? walkedOutS / outS : null;
    const back = backDoneS >= PACE_MIN_PLANNED_S ? walkedBackS / backDoneS : null;
    if (out == null) return back;
    return back == null ? out : Math.max(out, back);
  }

  /** How much longer the walking still to do will take than planned. Never below 1: a faster walker keeps the
   * planned times, a slower one gets less time. */
  function slowdown() {
    const ratio = paceRatio();
    return ratio == null ? 1 : Math.max(1, ratio);
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

  /**
   * Heading home: ask for a direct path from here to the habitat and take it only if it is shorter in planned time
   * than walking back the way the astronaut came. The way back stays the fallback (no path, no grid, not shorter).
   */
  function tryDirectReturn() {
    if (!planReturn || backLeftS <= DIRECT_MIN_GAIN_S) return;
    let path = null;
    try {
      path = planReturn(here((i) => points[i].x), here((i) => points[i].y));
    } catch (err) {
      path = null;
    }
    if (!Array.isArray(path) || path.length < 2) return;
    const times = returnTimes(path);
    const directS = times[path.length - 1];
    if (!(directS < backLeftS - DIRECT_MIN_GAIN_S)) return;
    returnSavedS = backLeftS - directS;
    points = path;
    last = path.length - 1;
    backS = times;
    placeAtPoint(last); // the path ends in the cell the astronaut is in
    backLeftS = directS;
    directReturn = true;
  }

  function beginReturn() {
    phase = PHASE.RETURNING;
    backLeftS = here((i) => backS[i]);
    tryDirectReturn();
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
    backDoneS += planned;
    walkedBackS += planned / simPace;
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

    /** "Turn back": from the walk or from a stop, return to the habitat (direct path if shorter, else the same path). */
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
      const index = frac > EPS ? seg + 1 : seg;
      return {
        phase,
        running,
        elapsedS,
        // The route point at or just beyond the position, so returnTimeS(route, pointIndex) never
        // promises a shorter walk home than the real one. On a direct path home it is 0: route.points no
        // longer describe the walk, and the time home comes from habitatInS.
        pointIndex: directReturn ? 0 : index,
        // On the way home: 'direct' (a shorter path planned on the risk map) or 'same' (the way out, walked back).
        returnPath: headingHome ? (directReturn ? 'direct' : 'same') : null,
        returnSavedS: directReturn ? returnSavedS : 0,
        // The direct path (habitat first) and the position on it, for the map; null on the way out and the same path.
        returnPoints: directReturn ? points : null,
        returnPointIndex: directReturn ? index : null,
        nextStop: headingHome ? null : stops[stopCursor] || null,
        x: here((i) => points[i].x),
        y: here((i) => points[i].y),
        // Along the path: to the next stop on the way out, to the habitat on the way back.
        distanceToNextM: headingHome ? distHereM : Math.max(0, points[targetIndex()].dist - distHereM),
        // Planned return time stretched by the measured pace (way out, and way back once returning).
        habitatInS: phase === PHASE.RETURNING ? backLeftS * slowdown() : null,
        // Real walking seconds per planned second so far (1 until enough walking has been seen, never below 1).
        // Every time still to walk is multiplied by it: turn-back moment, oxygen line, stop check, time home.
        slowdown: slowdown(),
        pacePct: paceRatio() ? 100 / paceRatio() : null,
        stopsDone: Math.min(stopCursor, stops.length),
        stopsTotal: stops.length,
      };
    },
  };
}
