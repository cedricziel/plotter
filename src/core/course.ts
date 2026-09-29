import { angleDiff, bearing, distance, timeToGo, type LatLon } from './geo';
import type { RouteProgress } from './navigation';

const M_PER_DEG = 111_195;
/** A maneuver counts as passed this far beyond its position along the course, metres. */
const PASSED_MARGIN = 10;
const LOOKAHEAD = 150;
const ARRIVAL = 30;
const HINT_BACK = 300;
const HINT_AHEAD = 3000;
const HINT_MAX_OFF = 400;

/** A polyline as [lon, lat] points with cumulative distances. */
export interface ShapeInfo {
  pts: [number, number][];
  cum: number[];
  total: number;
}

export function shapeInfo(pts: [number, number][]): ShapeInfo {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + distance({ lat: pts[i - 1][1], lon: pts[i - 1][0] }, { lat: pts[i][1], lon: pts[i][0] }));
  }
  return { pts, cum, total: cum[cum.length - 1] ?? 0 };
}

export function pointAlong(info: ShapeInfo, along: number): LatLon {
  const { pts, cum } = info;
  if (along <= 0) return { lat: pts[0][1], lon: pts[0][0] };
  if (along >= info.total) return { lat: pts[pts.length - 1][1], lon: pts[pts.length - 1][0] };
  let i = 1;
  while (cum[i] < along) i++;
  const t = (along - cum[i - 1]) / (cum[i] - cum[i - 1]);
  return {
    lat: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t,
    lon: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
  };
}

export interface ShapePos {
  /** metres from the start of the shape */
  along: number;
  /** signed distance from the shape, positive = starboard of the direction of travel */
  xte: number;
}

function nearest(info: ShapeInfo, pos: LatLon, from: number, to: number): (ShapePos & { off: number }) | null {
  const kx = Math.cos((pos.lat * Math.PI) / 180) * M_PER_DEG;
  let best: (ShapePos & { off: number }) | null = null as (ShapePos & { off: number }) | null;
  for (let i = Math.max(0, from); i < Math.min(info.pts.length - 1, to); i++) {
    const [x1, y1] = info.pts[i];
    const [x2, y2] = info.pts[i + 1];
    const sx = (x2 - x1) * kx;
    const sy = (y2 - y1) * M_PER_DEG;
    const px = (pos.lon - x1) * kx;
    const py = (pos.lat - y1) * M_PER_DEG;
    const len2 = sx * sx + sy * sy;
    const t = len2 > 0 ? Math.min(1, Math.max(0, (px * sx + py * sy) / len2)) : 0;
    const off = Math.hypot(px - t * sx, py - t * sy);
    if (!best || off < best.off) {
      const len = Math.sqrt(len2);
      const cross = len > 0 ? (sx * py - sy * px) / len : 0;
      best = { along: info.cum[i] + t * (info.cum[i + 1] - info.cum[i]), xte: -cross, off };
    }
  }
  return best;
}

/**
 * Where the position lies along the shape. With `hint` (the previous along
 * distance) the search stays near it, so a course that doubles back is not
 * confused with its other leg; it widens when nothing is close.
 */
export function projectOnShape(info: ShapeInfo, pos: LatLon, hint?: number): ShapePos {
  const n = info.pts.length;
  if (hint != null) {
    let lo = 0;
    while (lo < n - 2 && info.cum[lo + 1] < hint - HINT_BACK) lo++;
    let hi = lo;
    while (hi < n - 1 && info.cum[hi] < hint + HINT_AHEAD) hi++;
    const windowed = nearest(info, pos, lo, hi);
    if (windowed && windowed.off <= HINT_MAX_OFF) return windowed;
  }
  return nearest(info, pos, 0, n - 1)!;
}

export interface ShapeProgressOptions {
  speed: number | null;
  cog: number | null;
  /** index of the waypoint steered to before this fix; never goes backwards */
  index: number;
  /** previous along distance */
  hint?: number;
}

/**
 * Progress along a charted course. `maneuvers[i + 1]` is the i-th waypoint
 * after the departure, so `nextIndex` counts like the plain route progress.
 */
export function shapeProgress(
  info: ShapeInfo,
  maneuvers: { dist: number }[],
  pos: LatLon,
  opts: ShapeProgressOptions,
): (RouteProgress & { along: number }) | null {
  const stops = maneuvers.slice(1);
  if (stops.length === 0 || info.pts.length < 2) return null;
  const sp = projectOnShape(info, pos, opts.hint);
  let idx = Math.max(0, Math.min(opts.index, stops.length - 1));
  while (idx < stops.length - 1 && stops[idx].dist + PASSED_MARGIN < sp.along) idx++;
  const dtw = Math.max(0, stops[idx].dist - sp.along);
  const remaining = Math.max(0, info.total - sp.along);
  const finished = idx === stops.length - 1 && remaining <= ARRIVAL;
  const ahead = pointAlong(info, sp.along + Math.min(LOOKAHEAD, Math.max(dtw, 20)));
  const btw = bearing(pos, ahead);
  return {
    nextIndex: idx,
    dtw,
    btw,
    remaining,
    ttg: timeToGo(remaining, opts.speed),
    ttgNext: timeToGo(dtw, opts.speed),
    xte: sp.xte,
    vmg: opts.cog != null && opts.speed != null ? opts.speed * Math.cos(((opts.cog - btw) * Math.PI) / 180) : null,
    steer: opts.cog != null ? angleDiff(opts.cog, btw) : null,
    finished,
    along: sp.along,
  };
}

export interface OffCourseState {
  off: boolean;
  /** true once per episode when it is time to recalculate on its own */
  recalc: boolean;
}

/** Off course = further than `threshold` from the course for `after` ms; recalculates once after `autoAfter` ms. */
export class OffCourseMonitor {
  private since: number | null = null;
  private autoDone = false;
  private readonly threshold: number;
  private readonly after: number;
  private readonly autoAfter: number;

  constructor(threshold = 150, after = 20_000, autoAfter = 60_000) {
    this.threshold = threshold;
    this.after = after;
    this.autoAfter = autoAfter;
  }

  update(now: number, xte: number | null, realFix: boolean): OffCourseState {
    if (!realFix || xte == null) return { off: false, recalc: false };
    if (Math.abs(xte) <= this.threshold) {
      this.reset();
      return { off: false, recalc: false };
    }
    this.since ??= now;
    const dt = now - this.since;
    const recalc = dt >= this.autoAfter && !this.autoDone;
    if (recalc) this.autoDone = true;
    return { off: dt >= this.after, recalc };
  }

  reset(): void {
    this.since = null;
    this.autoDone = false;
  }
}

/** Decides when a spoken prompt for the next maneuver is due (about 500 m and 100 m ahead). */
export class Announcer {
  private key: string | null = null;
  private far = false;
  private near = false;

  update(key: string, dist: number, text: string): string | null {
    if (key !== this.key) {
      this.key = key;
      this.far = false;
      this.near = false;
    }
    if (dist <= 100 && !this.near) {
      this.near = this.far = true;
      return `In 100 metres, ${text}`;
    }
    if (dist <= 500 && dist > 100 && !this.far) {
      this.far = true;
      return `In 500 metres, ${text}`;
    }
    return null;
  }
}
