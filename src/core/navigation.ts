import { bearing, distance, routeLegs, timeToGo, type LatLon } from './geo';

/** Waypoint counts as reached within this distance (m). */
export const ARRIVAL_RADIUS = 30;

export interface RouteProgress {
  /** index of the waypoint being steered to */
  nextIndex: number;
  /** distance to next waypoint, m */
  dtw: number;
  /** bearing to next waypoint, degrees true */
  btw: number;
  /** distance to go to the final waypoint via all remaining waypoints, m */
  remaining: number;
  /** seconds to final waypoint at the given speed, or null */
  ttg: number | null;
  /** seconds to next waypoint at the given speed, or null */
  ttgNext: number | null;
  /** true when the final waypoint has been reached */
  finished: boolean;
}

/**
 * Progress along a route from the current position. Advances `nextIndex`
 * past every waypoint that lies within ARRIVAL_RADIUS.
 */
export function routeProgress(
  pos: LatLon,
  points: LatLon[],
  nextIndex: number,
  speedMps: number | null,
  arrivalRadius = ARRIVAL_RADIUS,
): RouteProgress | null {
  if (points.length === 0) return null;
  let idx = Math.max(0, Math.min(nextIndex, points.length - 1));
  while (idx < points.length - 1 && distance(pos, points[idx]) <= arrivalRadius) idx++;
  const next = points[idx];
  const dtw = distance(pos, next);
  const remaining = dtw + routeLegs(points.slice(idx)).total;
  const finished = idx === points.length - 1 && dtw <= arrivalRadius;
  return {
    nextIndex: idx,
    dtw,
    btw: bearing(pos, next),
    remaining,
    ttg: timeToGo(remaining, speedMps),
    ttgNext: timeToGo(dtw, speedMps),
    finished,
  };
}
