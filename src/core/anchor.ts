import { distance, type LatLon } from './geo';

export interface AnchorWatch {
  position: LatLon;
  /** swing radius in metres */
  radius: number;
}

export type AnchorState = 'ok' | 'warning' | 'alarm';

export interface AnchorCheck {
  state: AnchorState;
  /** distance from the anchor position, metres */
  distance: number;
}

/** Fraction of the radius at which a (silent) warning is shown. */
export const ANCHOR_WARNING_RATIO = 0.8;

/**
 * Evaluate a fix against the anchor circle.
 *
 * The alarm triggers once the reported position is outside the radius.
 * When `accuracy` (metres, 1σ as reported by the Geolocation API) is given,
 * a position that is outside the radius but could plausibly still be inside
 * it given the GPS error is reported as a warning instead of an alarm, so a
 * single noisy fix does not wake the crew. A fix whose best case is still
 * outside the circle always alarms.
 */
export function checkAnchor(watch: AnchorWatch, pos: LatLon, accuracy?: number | null): AnchorCheck {
  const d = distance(watch.position, pos);
  const acc = accuracy != null && Number.isFinite(accuracy) && accuracy > 0 ? accuracy : 0;
  let state: AnchorState;
  if (d > watch.radius) {
    // Only trust the tolerance when the error is smaller than the circle itself;
    // a hopeless fix must not mask a real drag.
    state = acc > 0 && acc < watch.radius && d - acc <= watch.radius ? 'warning' : 'alarm';
  } else if (d > watch.radius * ANCHOR_WARNING_RATIO) {
    state = 'warning';
  } else {
    state = 'ok';
  }
  return { state, distance: d };
}

/**
 * Debounce helper: require `needed` consecutive alarm fixes before sounding.
 * Returns the new counter and whether the alarm should sound.
 */
export function alarmDebounce(counter: number, check: AnchorCheck, needed = 2): { counter: number; sound: boolean } {
  const next = check.state === 'alarm' ? counter + 1 : 0;
  return { counter: next, sound: next >= needed };
}
