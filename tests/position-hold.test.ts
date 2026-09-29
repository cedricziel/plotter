import { describe, expect, it } from 'vitest';
import { distance } from '../src/core/geo';
import { PositionHold } from '../src/core/position-hold';

const BASE = { lat: 53.0965, lon: 5.8418 };
/** A point `north` and `east` metres from BASE. */
const at = (north: number, east: number) => ({
  lat: BASE.lat + north / 111_320,
  lon: BASE.lon + east / (111_320 * Math.cos((BASE.lat * Math.PI) / 180)),
});
const fix = (north: number, east: number, sog: number | null, accuracy = 5) => ({ ...at(north, east), accuracy, sog });

describe('PositionHold', () => {
  it('shows the first fix as it is', () => {
    const hold = new PositionHold();
    expect(hold.update(fix(0, 0, 0))).toEqual(at(0, 0));
  });

  it('keeps a moored boat still while its fix wanders within the accuracy', () => {
    const hold = new PositionHold();
    hold.update(fix(0, 0, 0));
    const jitter = [
      [4, -3],
      [-5, 2],
      [3, 4],
      [-2, -4],
      [5, 1],
    ];
    for (const [n, e] of jitter) {
      const shown = hold.update(fix(n, e, 0.1));
      expect(distance(shown, at(0, 0))).toBeLessThan(1.5);
    }
  });

  it('treats an unknown speed like a stop', () => {
    const hold = new PositionHold();
    hold.update(fix(0, 0, null));
    expect(distance(hold.update(fix(4, 3, null)), at(0, 0))).toBeLessThan(1.5);
  });

  it('follows every fix while under way', () => {
    const hold = new PositionHold();
    hold.update(fix(0, 0, 2.5));
    expect(hold.update(fix(3, 0, 2.5))).toEqual(at(3, 0));
  });

  it('lets go when a stopped boat has really moved beyond the scatter', () => {
    const hold = new PositionHold();
    hold.update(fix(0, 0, 0));
    expect(hold.update(fix(15, 0, 0))).toEqual(at(15, 0));
  });

  it('drifts toward where a stopped boat keeps being reported', () => {
    const hold = new PositionHold();
    hold.update(fix(0, 0, 0));
    let shown = at(0, 0);
    for (let i = 0; i < 60; i++) shown = hold.update(fix(4, 0, 0));
    expect(distance(shown, at(4, 0))).toBeLessThan(0.5);
  });
});
