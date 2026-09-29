import { describe, expect, it } from 'vitest';
import { MotionEstimator, type RawFix } from '../src/core/motion';
import { destination } from '../src/core/geo';

const origin = { lat: 53.05, lon: 5.83 };
const at = (east: number, north: number) => destination(destination(origin, 90, east), 0, north);

/** A fix `t` seconds in, with the device reporting no speed or course (Wi-Fi iPad). */
function fix(t: number, east: number, north: number, extra: Partial<RawFix> = {}): RawFix {
  return {
    ...at(east, north),
    accuracy: 11,
    speed: null,
    heading: null,
    time: t * 1000,
    ...extra,
  };
}

const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('MotionEstimator', () => {
  it('ignores the -1 course iOS reports when it has none', () => {
    const m = new MotionEstimator();
    m.update(fix(0, 0, 0, { speed: 2, heading: 90 }));
    const out = m.update(fix(1, 2, 0, { speed: 2, heading: -1 }));
    expect(out.cog).toBe(90);
  });

  it('uses the course the device reports', () => {
    const m = new MotionEstimator();
    const out = m.update(fix(0, 0, 0, { speed: 1.5, heading: 12 }));
    expect(out.cog).toBe(12);
  });

  it('does not take a course from fixes that differ by less than their accuracy', () => {
    // Heading north at 0.6 m/s (2.2 km/h), but each fix scatters ±8 m east-west.
    const m = new MotionEstimator();
    let out = m.update(fix(0, 0, 0));
    for (let t = 1; t <= 12; t++) out = m.update(fix(t, t % 2 ? 8 : -8, 0.6 * t));
    expect(out.cog).toBeNull();
  });

  it('derives the course over a baseline long enough to beat the scatter', () => {
    const m = new MotionEstimator();
    let out = m.update(fix(0, 0, 0));
    for (let t = 1; t <= 60; t++) out = m.update(fix(t, t % 2 ? 8 : -8, 0.6 * t));
    expect(out.cog).not.toBeNull();
    expect(angleDiff(out.cog!, 0)).toBeLessThan(25);
    expect(out.sog!).toBeGreaterThan(0.4);
    expect(out.sog!).toBeLessThan(0.9);
  });

  it('follows a turn once the boat has run far enough on the new course', () => {
    const m = new MotionEstimator();
    for (let t = 0; t <= 30; t++) m.update(fix(t, 3 * t, 0, { accuracy: 5 }));
    let out = m.update(fix(31, 90, 3, { accuracy: 5 }));
    for (let t = 2; t <= 12; t++) out = m.update(fix(30 + t, 90, 3 * t, { accuracy: 5 }));
    expect(angleDiff(out.cog!, 0)).toBeLessThan(10);
  });

  it('keeps the last course while stopped', () => {
    const m = new MotionEstimator();
    m.update(fix(0, 0, 0, { speed: 2, heading: 45 }));
    const out = m.update(fix(1, 0, 0, { speed: 0, heading: 200 }));
    expect(out.cog).toBe(45);
  });
});
