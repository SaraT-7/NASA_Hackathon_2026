// walk/check.js — "Next stop check", for work stream C. Pure logic: no DOM.
// At a stop the astronaut can ask: if I finish here, walk on to the following stop and work there too,
// how much time will I still have before I must turn back? Every duration comes from the shared model:
// route.points[].time for the walk out, returnTimeS() for the walk back, ASSUMPTIONS for the limits.

import { returnTimeS } from '../shared/route.js';
import { ASSUMPTIONS } from '../shared/walk-model.js';
import { PHASE } from './state.js';
import { TURN_BACK_SOON_S } from './status.js';

export const VERDICT = Object.freeze({
  OK: { key: 'ok', label: 'ENOUGH OXYGEN' },
  TIGHT: { key: 'tight', label: 'TIGHT' },
  NO: { key: 'no', label: 'NOT ENOUGH OXYGEN' },
});

/** Same thresholds as the status strip, so the check and the strip never disagree. */
function verdictFor(spareS) {
  if (spareS < 0) return VERDICT.NO;
  if (spareS <= TURN_BACK_SOON_S) return VERDICT.TIGHT;
  return VERDICT.OK;
}

function pointIndexOf(route, stop) {
  const last = route.points.length - 1;
  return Math.min(last, Math.max(0, Math.trunc(stop.point_index) || 0));
}

/**
 * The check for one snapshot of the walk, or null when the astronaut is not at a stop.
 * spareS is the time left before the latest turn-back moment once the plan is done; negative means
 * the plan does not fit in ASSUMPTIONS.EVA_LIMIT_S.
 * haveS: suit budget left now; needS: what the plan uses; spareS = haveS - needS.
 * @returns {null | { last: boolean, here: object, next: object|null, distM: number, walkS: number, workS: number,
 *                    haveS: number, needS: number, spareS: number, verdict: {key: string, label: string} }}
 */
export function nextStopCheck(route, snapshot) {
  if (snapshot.phase !== PHASE.AT_STOP) return null;
  const stops = route.stops || [];
  const here = stops[snapshot.stopsDone];
  if (!here) return null;

  const points = route.points;
  const hereIndex = snapshot.pointIndex;
  const workS = ASSUMPTIONS.STOP_WORK_S;
  const next = stops[snapshot.stopsDone + 1] || null;

  const haveS = ASSUMPTIONS.EVA_LIMIT_S - snapshot.elapsedS; // suit budget still left

  if (!next) {
    // Last stop: finish the work here, then walk back to the habitat.
    const needS = workS + returnTimeS(route, hereIndex);
    const spareS = haveS - needS;
    return { last: true, here, next: null, distM: 0, walkS: 0, workS, haveS, needS, spareS, verdict: verdictFor(spareS) };
  }

  // Finish here, walk on to the next stop, work there, then walk back to the habitat from there.
  const nextIndex = pointIndexOf(route, next);
  const walkS = Math.max(0, points[nextIndex].time - points[hereIndex].time);
  const distM = Math.max(0, points[nextIndex].dist - points[hereIndex].dist);
  const needS = workS + walkS + workS + returnTimeS(route, nextIndex);
  const spareS = haveS - needS;
  return { last: false, here, next, distM, walkS, workS, haveS, needS, spareS, verdict: verdictFor(spareS) };
}
