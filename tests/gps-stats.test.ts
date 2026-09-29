import { describe, expect, it } from 'vitest';
import { GpsStats } from '../src/core/gps-stats';

const sample = (t: number, accuracy: number, speed: number | null = null, heading: number | null = null) => ({
  time: t * 1000,
  accuracy,
  speed,
  heading,
});

describe('GpsStats', () => {
  it('has nothing to report before the first fix', () => {
    expect(new GpsStats().summary()).toBeNull();
  });

  it('summarises accuracy, fix interval and what the device reports, never a position', () => {
    const s = new GpsStats();
    const accuracies = [5, 6, 7, 8, 9, 10, 11, 12, 30, 65];
    accuracies.forEach((a, i) => s.add(sample(i * 2, a, i < 5 ? 1.2 : null, i < 2 ? 80 : -1)));
    expect(s.summary()).toEqual({
      'plotter.gps.fixes': 10,
      'plotter.gps.window_s': 18,
      'plotter.gps.interval_p50_s': 2,
      'plotter.gps.accuracy_p50_m': 9,
      'plotter.gps.accuracy_p90_m': 30,
      'plotter.gps.accuracy_max_m': 65,
      'plotter.gps.device_speed_ratio': 0.5,
      'plotter.gps.device_course_ratio': 0.2,
    });
  });

  it('starts a fresh window after reset', () => {
    const s = new GpsStats();
    s.add(sample(0, 5));
    s.reset();
    expect(s.summary()).toBeNull();
    s.add(sample(10, 20));
    expect(s.summary()?.['plotter.gps.fixes']).toBe(1);
  });
});
