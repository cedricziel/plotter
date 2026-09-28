import { describe, expect, it } from 'vitest';
import {
  bearing,
  circlePolygon,
  destination,
  distance,
  eta,
  normalizeBearing,
  routeLegs,
  timeToGo,
} from '../src/core/geo';

// Amsterdam Centraal and Utrecht Centraal (approx.)
const AMS = { lat: 52.3791, lon: 4.9003 };
const UTR = { lat: 52.0894, lon: 5.1101 };

describe('distance', () => {
  it('is zero for identical points', () => {
    expect(distance(AMS, AMS)).toBe(0);
  });

  it('matches one nautical mile per arc-minute of latitude', () => {
    const d = distance({ lat: 52, lon: 5 }, { lat: 52 + 1 / 60, lon: 5 });
    expect(d).toBeGreaterThan(1850);
    expect(d).toBeLessThan(1856);
  });

  it('computes Amsterdam – Utrecht (~35 km)', () => {
    const d = distance(AMS, UTR);
    expect(d).toBeGreaterThan(34_500);
    expect(d).toBeLessThan(35_500);
  });

  it('is symmetric', () => {
    expect(distance(AMS, UTR)).toBeCloseTo(distance(UTR, AMS), 6);
  });
});

describe('bearing', () => {
  it('returns cardinal directions', () => {
    const o = { lat: 52, lon: 5 };
    expect(bearing(o, { lat: 52.1, lon: 5 })).toBeCloseTo(0, 5);
    expect(bearing(o, { lat: 51.9, lon: 5 })).toBeCloseTo(180, 5);
    expect(bearing(o, { lat: 52, lon: 5.1 })).toBeCloseTo(90, 0);
    expect(bearing(o, { lat: 52, lon: 4.9 })).toBeCloseTo(270, 0);
  });

  it('is in [0, 360)', () => {
    const b = bearing(AMS, UTR);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
    // Utrecht is SSE of Amsterdam
    expect(b).toBeGreaterThan(150);
    expect(b).toBeLessThan(160);
  });

  it('normalises angles', () => {
    expect(normalizeBearing(-10)).toBe(350);
    expect(normalizeBearing(370)).toBe(10);
    expect(normalizeBearing(360)).toBe(0);
  });
});

describe('destination', () => {
  it('round-trips with distance and bearing', () => {
    const p = destination(AMS, 123, 5000);
    expect(distance(AMS, p)).toBeCloseTo(5000, 3);
    expect(bearing(AMS, p)).toBeCloseTo(123, 3);
  });

  it('builds a closed circle polygon of the requested radius', () => {
    const ring = circlePolygon(AMS, 50, 32);
    expect(ring).toHaveLength(33);
    expect(ring[0][0]).toBeCloseTo(ring[32][0], 9);
    expect(ring[0][1]).toBeCloseTo(ring[32][1], 9);
    for (const [lon, lat] of ring) expect(distance(AMS, { lat, lon })).toBeCloseTo(50, 3);
  });
});

describe('routeLegs', () => {
  it('returns no legs for fewer than two points', () => {
    expect(routeLegs([]).legs).toHaveLength(0);
    expect(routeLegs([AMS]).total).toBe(0);
  });

  it('sums leg distances', () => {
    const mid = { lat: 52.2, lon: 5.0 };
    const r = routeLegs([AMS, mid, UTR]);
    expect(r.legs).toHaveLength(2);
    expect(r.total).toBeCloseTo(distance(AMS, mid) + distance(mid, UTR), 6);
    expect(r.legs[1].bearing).toBeCloseTo(bearing(mid, UTR), 6);
  });
});

describe('ETA', () => {
  it('computes time to go from speed', () => {
    // 10 km at 10 km/h = 1 h
    expect(timeToGo(10_000, 10 / 3.6)).toBeCloseTo(3600, 6);
  });

  it('is undefined when stationary or speed unknown', () => {
    expect(timeToGo(1000, 0)).toBeNull();
    expect(timeToGo(1000, 0.05)).toBeNull();
    expect(timeToGo(1000, null)).toBeNull();
    expect(timeToGo(1000, NaN)).toBeNull();
    expect(eta(1000, 0)).toBeNull();
  });

  it('returns an absolute arrival time', () => {
    const now = new Date('2026-06-01T10:00:00Z');
    const arr = eta(18_000, 5, now); // 18 km at 18 km/h
    expect(arr?.toISOString()).toBe('2026-06-01T11:00:00.000Z');
  });
});
