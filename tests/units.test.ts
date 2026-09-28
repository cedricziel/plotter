import { describe, expect, it } from 'vitest';
import { formatBearing, formatCoord, formatDistance, formatSpeed } from '../src/core/units';
import { shouldLogPoint } from '../src/core/track';

describe('units', () => {
  it('formats speed', () => {
    expect(formatSpeed(10 / 3.6, 'kmh')).toBe('10.0');
    expect(formatSpeed(1852 / 3600, 'kn')).toBe('1.0');
    expect(formatSpeed(null, 'kmh')).toBe('--.-');
  });

  it('formats distance', () => {
    expect(formatDistance(250, 'metric')).toBe('250 m');
    expect(formatDistance(2500, 'metric')).toBe('2.50 km');
    expect(formatDistance(1852, 'nautical')).toBe('1.00 NM');
  });

  it('formats bearings and coordinates', () => {
    expect(formatBearing(5)).toBe('005°');
    expect(formatBearing(359.7)).toBe('000°');
    expect(formatCoord(52.5, 'lat')).toBe('52°30.000′N');
    expect(formatCoord(-4.25, 'lon')).toBe('004°15.000′W');
    expect(formatCoord(52.99999999, 'lat')).toBe('53°00.000′N');
  });
});

describe('track filter', () => {
  const p = (lat: number, time: number) => ({ lat, lon: 5, time });
  it('logs first point and after movement or interval', () => {
    expect(shouldLogPoint(undefined, p(52, 0), 5)).toBe(true);
    expect(shouldLogPoint(p(52, 0), p(52.00001, 1000), 5)).toBe(false);
    expect(shouldLogPoint(p(52, 0), p(52.001, 1000), 5)).toBe(true);
    expect(shouldLogPoint(p(52, 0), p(52, 61_000), 5)).toBe(true);
    expect(shouldLogPoint(undefined, p(52, 0), 500)).toBe(false);
  });
});
