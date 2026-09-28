import { angleDiff, bearing, crossTrack, distance, routeLegs, timeToGo, type LatLon } from './geo';

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
  /** signed cross-track error from the active leg, m (positive = right of course); null on the first waypoint */
  xte: number | null;
  /** velocity made good toward the next waypoint, m/s; null without speed and course */
  vmg: number | null;
  /** turn needed to head for the next waypoint, degrees in (-180, 180] (positive = starboard); null without course */
  steer: number | null;
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
  cog?: number | null,
): RouteProgress | null {
  if (points.length === 0) return null;
  let idx = Math.max(0, Math.min(nextIndex, points.length - 1));
  while (idx < points.length - 1 && distance(pos, points[idx]) <= arrivalRadius) idx++;
  const next = points[idx];
  const dtw = distance(pos, next);
  const remaining = dtw + routeLegs(points.slice(idx)).total;
  const finished = idx === points.length - 1 && dtw <= arrivalRadius;
  const btw = bearing(pos, next);
  return {
    nextIndex: idx,
    dtw,
    btw,
    remaining,
    ttg: timeToGo(remaining, speedMps),
    ttgNext: timeToGo(dtw, speedMps),
    xte: idx > 0 ? crossTrack(pos, points[idx - 1], next) : null,
    vmg: cog != null && speedMps != null ? speedMps * Math.cos(((cog - btw) * Math.PI) / 180) : null,
    steer: cog != null ? angleDiff(cog, btw) : null,
    finished,
  };
}
