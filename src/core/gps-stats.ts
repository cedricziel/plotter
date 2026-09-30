export interface FixSample {
  /** epoch ms */
  time: number;
  /** metres, as reported by the device */
  accuracy: number;
  /** as reported by the device: null, or negative on iOS, when it has none */
  speed: number | null;
  heading: number | null;
}

const valid = (v: number | null) => v != null && Number.isFinite(v) && v >= 0;

/** Nearest-rank percentile of an ascending list. */
const percentile = (sorted: number[], p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];

const round = (v: number, digits = 1) => Math.round(v * 10 ** digits) / 10 ** digits;

/**
 * How good the position source is over a stretch of time — accuracy, fix
 * rate, and whether the device supplies its own speed and course — without
 * keeping any position.
 */
export class GpsStats {
  private samples: FixSample[] = [];
  /** Times the location watch was restarted because the device kept repeating a fix. */
  restarts = 0;

  add(s: FixSample): void {
    this.samples.push(s);
  }

  reset(): void {
    this.samples = [];
    this.restarts = 0;
  }

  summary(): Record<string, number> | null {
    const s = this.samples;
    if (s.length === 0) return null;
    const accuracy = s.map((x) => x.accuracy).sort((a, b) => a - b);
    const intervals = s
      .slice(1)
      .map((x, i) => (x.time - s[i].time) / 1000)
      .sort((a, b) => a - b);
    return {
      'plotter.gps.fixes': s.length,
      'plotter.gps.window_s': round((s[s.length - 1].time - s[0].time) / 1000),
      ...(intervals.length ? { 'plotter.gps.interval_p50_s': round(percentile(intervals, 0.5)) } : {}),
      'plotter.gps.accuracy_p50_m': round(percentile(accuracy, 0.5)),
      'plotter.gps.accuracy_p90_m': round(percentile(accuracy, 0.9)),
      'plotter.gps.accuracy_max_m': round(accuracy[accuracy.length - 1]),
      'plotter.gps.device_speed_ratio': round(s.filter((x) => valid(x.speed)).length / s.length, 2),
      'plotter.gps.device_course_ratio': round(s.filter((x) => valid(x.heading)).length / s.length, 2),
      'plotter.gps.restarts': this.restarts,
    };
  }
}
