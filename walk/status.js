// walk/status.js — what the main indicators say, for work stream C. Pure logic: no DOM.
// The latest moment to turn back comes from the shared model only (docs/tasks/C_WALK.md, "Turn back in").

import { returnTimeS } from '../shared/route.js';
import { ASSUMPTIONS } from '../shared/walk-model.js';
import { PHASE } from './state.js';

/** Below this many seconds left the status strip turns from GO to TURN BACK SOON. */
export const TURN_BACK_SOON_S = 30 * 60;

export const STATUS = Object.freeze({
  GO: { key: 'go', label: 'GO' },
  SOON: { key: 'soon', label: 'TURN BACK SOON' },
  NOW: { key: 'now', label: 'TURN BACK NOW' },
  RETURNING: { key: 'returning', label: 'RETURNING' },
  DONE: { key: 'done', label: 'AT HABITAT' },
});

/** Seconds left before the astronaut must start walking back. Negative once that moment has passed. */
export function turnBackInS(route, snapshot) {
  return ASSUMPTIONS.EVA_LIMIT_S - snapshot.elapsedS - returnTimeS(route, snapshot.pointIndex);
}

/**
 * Everything the indicators show for one snapshot of the walk.
 * @returns {{ status: {key: string, label: string}, turnBackInS: number, habitatInS: number|null }}
 */
export function readout(route, snapshot) {
  const left = turnBackInS(route, snapshot);
  let status;
  if (snapshot.phase === PHASE.DONE) status = STATUS.DONE;
  else if (snapshot.phase === PHASE.RETURNING) status = STATUS.RETURNING;
  else if (left < 0) status = STATUS.NOW;
  else if (left <= TURN_BACK_SOON_S) status = STATUS.SOON;
  else status = STATUS.GO;
  const headingHome = snapshot.phase === PHASE.RETURNING || snapshot.phase === PHASE.DONE;
  return { status, turnBackInS: left, habitatInS: headingHome ? snapshot.habitatInS || 0 : null };
}
