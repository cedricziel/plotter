/**
 * Spherical-earth geodesy helpers. Accuracy (~0.3 %) is far better than
 * consumer GPS for the distances involved in inland navigation.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

/** Mean earth radius in metres (IUGG). */
export const EARTH_RADIUS_M = 6_371_008.8;
export const METERS_PER_NM = 1852;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Normalise any angle to [0, 360). */
export function normalizeBearing(deg: number): number {
  const b = deg % 360;
  return b < 0 ? b + 360 : b;
}

/** Great-circle distance in metres (haversine). */
export function distance(a: LatLon, b: LatLon): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const dφ = φ2 - φ1;
  const dλ = toRad(b.lon - a.lon);
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial true bearing from a to b in degrees [0, 360). */
export function bearing(a: LatLon, b: LatLon): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const dλ = toRad(b.lon - a.lon);
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return normalizeBearing(toDeg(Math.atan2(y, x)));
}

/** Point reached travelling `dist` metres from `start` on initial bearing `brg`. */
export function destination(start: LatLon, brg: number, dist: number): LatLon {
  const δ = dist / EARTH_RADIUS_M;
  const θ = toRad(brg);
  const φ1 = toRad(start.lat);
  const λ1 = toRad(start.lon);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: toDeg(φ2), lon: ((toDeg(λ2) + 540) % 360) - 180 };
}

export interface Leg {
  from: LatLon;
  to: LatLon;
  /** metres */
  distance: number;
  /** true bearing, degrees */
  bearing: number;
}

export interface RouteSummary {
  legs: Leg[];
  /** metres */
  total: number;
}

export function routeLegs(points: LatLon[]): RouteSummary {
  const legs: Leg[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];
    const d = distance(from, to);
    legs.push({ from, to, distance: d, bearing: bearing(from, to) });
    total += d;
  }
  return { legs, total };
}

/** Minimum speed (m/s) below which ETA is considered undefined (~0.36 km/h). */
export const MIN_ETA_SPEED = 0.1;

/**
 * Time in seconds to cover `meters` at `speedMps`, or null when the vessel is
 * (almost) stationary or the speed is unknown.
 */
export function timeToGo(meters: number, speedMps: number | null | undefined): number | null {
  if (speedMps == null || !Number.isFinite(speedMps) || speedMps < MIN_ETA_SPEED) return null;
  if (!Number.isFinite(meters) || meters < 0) return null;
  return meters / speedMps;
}

/** Absolute ETA as a Date, or null when not computable. */
export function eta(meters: number, speedMps: number | null | undefined, now: Date = new Date()): Date | null {
  const t = timeToGo(meters, speedMps);
  return t == null ? null : new Date(now.getTime() + t * 1000);
}

/** Closed polygon ring approximating a circle, for map rendering. */
export function circlePolygon(center: LatLon, radius: number, steps = 64): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const p = destination(center, (i / steps) * 360, radius);
    ring.push([p.lon, p.lat]);
  }
  return ring;
}
