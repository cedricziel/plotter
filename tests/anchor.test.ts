import { describe, expect, it } from 'vitest';
import { alarmDebounce, checkAnchor } from '../src/core/anchor';
import { destination } from '../src/core/geo';

const anchor = { position: { lat: 52.5, lon: 5.5 }, radius: 40 };
const at = (m: number) => destination(anchor.position, 45, m);

describe('checkAnchor', () => {
  it('is ok well inside the circle', () => {
    const r = checkAnchor(anchor, at(10));
    expect(r.state).toBe('ok');
    expect(r.distance).toBeCloseTo(10, 3);
  });

  it('warns when approaching the radius', () => {
    expect(checkAnchor(anchor, at(35)).state).toBe('warning');
  });

  it('alarms outside the radius', () => {
    expect(checkAnchor(anchor, at(41)).state).toBe('alarm');
    expect(checkAnchor(anchor, at(500)).state).toBe('alarm');
  });

  it('treats the exact radius as inside', () => {
    expect(checkAnchor(anchor, at(39.999)).state).not.toBe('alarm');
  });

  it('downgrades to warning when GPS error could explain the excursion', () => {
    expect(checkAnchor(anchor, at(45), 10).state).toBe('warning');
  });

  it('still alarms when even the best case is outside', () => {
    expect(checkAnchor(anchor, at(60), 10).state).toBe('alarm');
  });

  it('does not let a hopeless fix mask a drag', () => {
    expect(checkAnchor(anchor, at(80), 100).state).toBe('alarm');
  });
});

describe('alarmDebounce', () => {
  it('requires consecutive alarm fixes', () => {
    const alarm = checkAnchor(anchor, at(100));
    const ok = checkAnchor(anchor, at(1));
    let s = alarmDebounce(0, alarm);
    expect(s.sound).toBe(false);
    s = alarmDebounce(s.counter, ok);
    expect(s.counter).toBe(0);
    s = alarmDebounce(s.counter, alarm);
    s = alarmDebounce(s.counter, alarm);
    expect(s.sound).toBe(true);
  });
});
