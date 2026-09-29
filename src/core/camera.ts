export type Orientation = 'course' | 'north';

const MIN_ZOOM = 12;
const MAX_ZOOM = 17;
/** Metres per pixel at zoom 0 on the equator for MapLibre's 512 px tiles. */
const M_PER_PX_Z0 = 78271.51696;

/** How far ahead the chart should show: two minutes at the current speed, less when a maneuver is close. */
export function lookahead(sog: number | null, toManeuver: number | null): number {
  const ahead = Math.min(3000, Math.max(300, (sog ?? 0) * 120));
  if (toManeuver == null) return ahead;
  return Math.min(ahead, Math.max(200, toManeuver * 1.5));
}

/** Zoom at which `meters` covers `px` screen pixels at latitude `lat`. */
export function zoomForSpan(meters: number, lat: number, px: number): number {
  return Math.log2((M_PER_PX_Z0 * Math.cos((lat * Math.PI) / 180) * px) / meters);
}

export function navZoom(o: {
  sog: number | null;
  toManeuver: number | null;
  lat: number;
  screenPx: number;
  current: number;
}): number {
  const target = zoomForSpan(lookahead(o.sog, o.toManeuver), o.lat, o.screenPx);
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(target * 4) / 4));
  return Math.abs(z - o.current) < 0.25 + 1e-9 ? o.current : z;
}

/** Map bearing: 0 for north-up; COG for course-up, held while slow or when it only jitters. */
export function navBearing(mode: Orientation, cog: number | null, sog: number | null, current: number): number {
  if (mode === 'north') return 0;
  if (cog == null || (sog ?? 0) < 0.5) return current;
  const delta = Math.abs(((cog - current + 540) % 360) - 180);
  return delta < 5 ? current : cog;
}
