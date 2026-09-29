import { describe, expect, it } from 'vitest';
import { decodePolyline, encodePolyline } from '../src/core/polyline';

describe('polyline', () => {
  it('matches the reference encoding (precision 5, lat/lon order)', () => {
    const pts: [number, number][] = [
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ];
    expect(encodePolyline(pts, 5)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });

  it('round-trips at precision 6 including negative coordinates', () => {
    const pts: [number, number][] = [
      [4.890512, 52.381234],
      [4.9, 52.4],
      [-0.000001, -0.5],
    ];
    const back = decodePolyline(encodePolyline(pts));
    back.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(pts[i][0], 6);
      expect(p[1]).toBeCloseTo(pts[i][1], 6);
    });
  });

  it('handles an empty polyline and rejects garbage', () => {
    expect(decodePolyline('')).toEqual([]);
    expect(() => decodePolyline('_')).toThrow();
    expect(() => decodePolyline('\u0001\u0001')).toThrow();
  });
});
