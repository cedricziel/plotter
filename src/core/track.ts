import { distance, type LatLon } from './geo';

export interface TrackFilterOptions {
  /** minimum movement in metres before a new point is logged */
  minDistance: number;
  /** log at least every N ms even when not moving much (0 = never) */
  maxInterval: number;
  /** discard fixes with worse accuracy than this (metres) */
  maxAccuracy: number;
}

export const DEFAULT_TRACK_FILTER: TrackFilterOptions = {
  minDistance: 10,
  maxInterval: 60_000,
  maxAccuracy: 50,
};

/** Decide whether a new fix should be appended to the track. */
export function shouldLogPoint(
  last: (LatLon & { time: number }) | undefined,
  next: LatLon & { time: number },
  accuracy: number | null | undefined,
  opts: TrackFilterOptions = DEFAULT_TRACK_FILTER,
): boolean {
  if (accuracy != null && accuracy > opts.maxAccuracy) return false;
  if (!last) return true;
  if (distance(last, next) >= opts.minDistance) return true;
  return opts.maxInterval > 0 && next.time - last.time >= opts.maxInterval;
}

export function trackLength(points: LatLon[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += distance(points[i - 1], points[i]);
  return d;
}
