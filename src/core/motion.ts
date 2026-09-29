import { EARTH_RADIUS_M, normalizeBearing, type LatLon } from './geo';

export interface RawFix extends LatLon {
  /** metres, as reported by the device */
  accuracy: number;
  /** m/s from the device, null (or negative on iOS) when it has none */
  speed: number | null;
  /** degrees true from the device, null (or negative on iOS) when it has none */
  heading: number | null;
  /** epoch ms */
  time: number;
}

export interface Motion {
  /** speed over ground, m/s, null if unknown */
  sog: number | null;
  /** course over ground, degrees true, null if never known */
  cog: number | null;
}

/** Below this speed COG is meaningless noise (≈ 1 km/h). */
export const COG_MIN_SPEED = 0.28;
const WINDOW_MS = 60_000;
/** How many standard errors the fitted velocity must clear before its direction counts. */
const CONFIDENCE = 3;

const RAD = Math.PI / 180;

/**
 * Speed and course over ground from a stream of fixes. Prefers what the device
 * reports; otherwise fits a velocity to the recent fixes, using the shortest
 * stretch whose travel clears the position noise, so a slow boat with a
 * wandering fix gets a steady course and a fast one still turns promptly.
 */
export class MotionEstimator {
  private history: RawFix[] = [];
  private sog: number | null = null;
  private cog: number | null = null;

  update(f: RawFix): Motion {
    this.history = this.history.filter((h) => h.time < f.time && f.time - h.time <= WINDOW_MS);
    this.history.push(f);
    const fit = fitVelocity(this.history, f.accuracy);

    const deviceSpeed = f.speed != null && Number.isFinite(f.speed) && f.speed >= 0 ? f.speed : null;
    const rawSpeed = deviceSpeed ?? fit?.speed ?? null;
    if (rawSpeed != null)
      this.sog = this.sog == null || deviceSpeed == null ? rawSpeed : this.sog * 0.6 + rawSpeed * 0.4;

    const deviceCourse = f.heading != null && Number.isFinite(f.heading) && f.heading >= 0 ? f.heading : null;
    const rawCourse = deviceCourse ?? (fit?.reliable ? fit.course : null);
    // Keep the last course while (nearly) stopped, for the ship symbol.
    const moving = rawSpeed ?? this.sog;
    if (rawCourse != null && (moving == null || moving >= COG_MIN_SPEED)) this.cog = rawCourse;

    return { sog: this.sog, cog: this.cog };
  }
}

interface Fit {
  speed: number;
  course: number;
  reliable: boolean;
}

/**
 * Least-squares velocity over the newest fixes, growing the stretch backwards
 * until the fitted speed is `CONFIDENCE` standard errors clear of zero. Falls
 * back to the whole window, marked unreliable, for the speed alone.
 */
function fitVelocity(fixes: RawFix[], accuracy: number): Fit | null {
  const last = fixes[fixes.length - 1];
  const cosLat = Math.cos(last.lat * RAD);
  let n = 0;
  let st = 0,
    stt = 0,
    sx = 0,
    sxt = 0,
    sy = 0,
    syt = 0;
  let fit: Fit | null = null;
  for (let i = fixes.length - 1; i >= 0; i--) {
    const p = fixes[i];
    const t = (p.time - last.time) / 1000;
    const x = (p.lon - last.lon) * RAD * cosLat * EARTH_RADIUS_M;
    const y = (p.lat - last.lat) * RAD * EARTH_RADIUS_M;
    n++;
    st += t;
    stt += t * t;
    sx += x;
    sxt += x * t;
    sy += y;
    syt += y * t;
    if (n < 3) continue;
    const sxx = stt - (st * st) / n;
    if (sxx <= 0) continue;
    const vx = (sxt - (st * sx) / n) / sxx;
    const vy = (syt - (st * sy) / n) / sxx;
    const speed = Math.hypot(vx, vy);
    const course = normalizeBearing(Math.atan2(vx, vy) / RAD);
    const reliable = speed >= (CONFIDENCE * Math.max(accuracy, 1)) / Math.sqrt(sxx);
    fit = { speed, course, reliable };
    if (reliable) return fit;
  }
  return fit;
}
