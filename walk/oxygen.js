// walk/oxygen.js — estimated oxygen gauge, for work stream C. Pure logic: no DOM.
// There is no oxygen sensor and no measured consumption rate in this project. The gauge re-expresses the
// suit's life-support budget (ASSUMPTIONS.EVA_LIMIT_S, NASA xEVA: 6 +/- 2 hours) as a percentage:
// 100 % at the start, falling at a steady rate with the Marswalk clock. The screen labels it "estimated".

import { returnTimeS } from '../shared/route.js';
import { ASSUMPTIONS } from '../shared/walk-model.js';
import { PHASE } from './state.js';

/** Seconds of suit budget as a percentage of the whole budget. */
export function budgetPct(seconds) {
  return (seconds / ASSUMPTIONS.EVA_LIMIT_S) * 100;
}

/**
 * The gauge for one snapshot of the walk.
 * leftPct: estimated oxygen left now. homePct: what the walk back from here needs (the line on the gauge).
 */
export function oxygenGauge(route, snapshot) {
  const leftS = Math.max(0, ASSUMPTIONS.EVA_LIMIT_S - snapshot.elapsedS);
  let homeS;
  if (snapshot.phase === PHASE.DONE) homeS = 0;
  else if (snapshot.phase === PHASE.RETURNING) homeS = snapshot.habitatInS || 0;
  else homeS = returnTimeS(route, snapshot.pointIndex);
  return { leftPct: budgetPct(leftS), homePct: budgetPct(homeS) };
}
