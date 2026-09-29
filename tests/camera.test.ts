import { describe, expect, it } from 'vitest';
import { lookahead, navBearing, navZoom, zoomForSpan } from '../src/core/camera';

describe('lookahead', () => {
  it('scales with speed over two minutes', () => {
    expect(lookahead(5, null)).toBe(600);
  });
  it('stays between 300 m and 3 km', () => {
    expect(lookahead(0, null)).toBe(300);
    expect(lookahead(null, null)).toBe(300);
    expect(lookahead(50, null)).toBe(3000);
  });
  it('tightens on a close maneuver but keeps it in view', () => {
    expect(lookahead(5, 150)).toBe(225);
    expect(lookahead(5, 100)).toBe(200);
    expect(lookahead(5, 2000)).toBe(600);
  });
});

describe('zoomForSpan', () => {
  it('fits the span into the given screen length', () => {
    const z = zoomForSpan(1000, 0, 500);
    const metresPerPx = (156543.03392 * Math.cos(0)) / 2 ** z / 2;
    expect(metresPerPx * 500).toBeCloseTo(1000, 3);
  });
  it('zooms further in at higher latitudes for the same span', () => {
    expect(zoomForSpan(1000, 52, 500)).toBeLessThan(zoomForSpan(1000, 0, 500));
  });
});

describe('navZoom', () => {
  it('zooms in near a maneuver and out at speed', () => {
    const near = navZoom({ sog: 4, toManeuver: 150, lat: 52.4, screenPx: 500, current: 13 });
    const fast = navZoom({ sog: 12, toManeuver: null, lat: 52.4, screenPx: 500, current: 13 });
    expect(near).toBeGreaterThan(fast);
  });
  it('is clamped to 12..17', () => {
    expect(navZoom({ sog: 40, toManeuver: null, lat: 52.4, screenPx: 100, current: 13 })).toBe(12);
    expect(navZoom({ sog: 0, toManeuver: 1, lat: 52.4, screenPx: 4000, current: 13 })).toBe(17);
  });
  it('keeps the current zoom for small changes', () => {
    const z = navZoom({ sog: 5, toManeuver: null, lat: 52.4, screenPx: 500, current: 13 });
    expect(navZoom({ sog: 5, toManeuver: null, lat: 52.4, screenPx: 500, current: z + 0.2 })).toBe(z + 0.2);
  });
});

describe('navBearing', () => {
  it('is 0 in north-up mode', () => {
    expect(navBearing('north', 120, 1, 90)).toBe(0);
  });
  it('follows COG in course-up mode', () => {
    expect(navBearing('course', 120, 2, 0)).toBe(120);
  });
  it('holds the last bearing while slow or without COG', () => {
    expect(navBearing('course', 120, 0.2, 80)).toBe(80);
    expect(navBearing('course', null, 3, 80)).toBe(80);
  });
  it('ignores jitter below 5 degrees, across north too', () => {
    expect(navBearing('course', 83, 2, 80)).toBe(80);
    expect(navBearing('course', 2, 2, 358)).toBe(358);
    expect(navBearing('course', 10, 2, 358)).toBe(10);
  });
});
