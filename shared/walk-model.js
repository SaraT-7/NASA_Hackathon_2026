// shared/walk-model.js — FROZEN shared module. Do not edit without team agreement (see docs/CONTRACT.md).
// How fast a suited astronaut walks. Both the planner (plan/) and the walk view (walk/) use it,
// so the two screens always show the same times.

// Tobler's hiking function gives about 5.0 km/h for an unsuited walker on level ground.
const TOBLER_FLAT_KMH = 6 * Math.exp(-3.5 * 0.05);

/**
 * Planning assumptions. They are not measurements; show them as assumptions in the UI.
 * Sources are listed in ASSUMPTION_NOTES below and in docs/CONTRACT.md, section 6.
 * Change them only here, with the team's agreement.
 */
export const ASSUMPTIONS = {
  FLAT_SPEED_KMH: 2.0, // suited walking speed on level ground (NASA Artemis planning value)
  SUIT_SPEED_FACTOR: 2.0 / TOBLER_FLAT_KMH, // derived from FLAT_SPEED_KMH: fraction of unsuited hiking speed, about 0.4
  RETURN_FACTOR: 1.2, // safety margin: the planned walk back is given 20 % more time
  EVA_LIMIT_S: 6 * 3600, // planning limit for one Marswalk (NASA xEVA: 6 +/- 2 hours)
  STOP_WORK_S: 20 * 60, // time spent working at each science stop (our choice)
};

/** The same assumptions as text for a "Data and limits" panel. */
export const ASSUMPTION_NOTES = [
  {
    key: 'FLAT_SPEED_KMH',
    label: 'Walking speed on level ground',
    value: '2.0 km/h',
    source:
      'Planning value from a NASA study of Artemis walking range (NTRS 20210026296). Apollo planners assumed 2.7 km/h ' +
      "for walk-backs longer than an hour. On slopes the speed follows Tobler's hiking function.",
  },
  {
    key: 'EVA_LIMIT_S',
    label: 'Longest Marswalk',
    value: '6 h',
    source:
      'NASA Exploration EVA concept of operations summary (EVA-EXP-0075): EVAs of up to 8 hours, 6 ± 2 hours. ' +
      'Written for lunar missions.',
  },
  {
    key: 'RETURN_FACTOR',
    label: 'Safety margin on the walk back',
    value: '+20 %',
    source: 'Our choice. Extra time added to the planned return; it is not a measured slowdown.',
  },
  {
    key: 'STOP_WORK_S',
    label: 'Work time at each science stop',
    value: '20 min',
    source: 'Our choice.',
  },
];

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
