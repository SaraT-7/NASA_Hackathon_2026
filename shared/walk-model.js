// shared/walk-model.js — FROZEN shared module. Do not edit without team agreement (see docs/CONTRACT.md).
// How fast a suited astronaut walks. Both the planner (plan/) and the walk view (walk/) use it,
// so the two screens always show the same times.

/**
 * Every number here is an ASSUMPTION, not a NASA specification. Show them as assumptions in the UI.
 * Change them only here, with the team's agreement, and cite the source in docs/CONTRACT.md.
 */
export const ASSUMPTIONS = {
  SUIT_SPEED_FACTOR: 0.5, // suited walking speed as a fraction of unsuited hiking speed
  RETURN_FACTOR: 1.2, // the walk back is slower: fatigue and carried samples
  EVA_LIMIT_S: 6 * 3600, // planning limit for one Marswalk
  STOP_WORK_S: 20 * 60, // time spent working at each science stop
};

/**
 * Walking speed in m/s on a given grade, from Tobler's hiking function scaled for a suit.
 * @param {number} grade  rise / horizontal distance, positive uphill (0.1 = 10 %)
 */
export function speedMps(grade) {
  const kmh = 6 * Math.exp(-3.5 * Math.abs(grade + 0.05)) * ASSUMPTIONS.SUIT_SPEED_FACTOR;
  return kmh / 3.6;
}

/**
 * Seconds needed for one step.
 * @param {number} distM  horizontal distance in metres
 * @param {number} dzM    elevation change in metres, positive uphill
 */
export function stepTimeS(distM, dzM) {
  if (distM <= 0) return 0;
  return distM / speedMps(dzM / distM);
}

/** "1 h 05 min" style text for a duration in seconds. */
export function formatDuration(seconds) {
  const m = Math.round(seconds / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
}
