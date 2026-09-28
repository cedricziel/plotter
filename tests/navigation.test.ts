import { describe, expect, it } from 'vitest';
import { destination, distance } from '../src/core/geo';
import { routeProgress } from '../src/core/navigation';

const a = { lat: 52.0, lon: 5.0 };
const b = destination(a, 90, 1000);
const c = destination(b, 0, 2000);

describe('routeProgress', () => {
  it('returns null for empty routes', () => {
    expect(routeProgress(a, [], 0, 1)).toBeNull();
  });

  it('computes distance to go through all remaining waypoints', () => {
    const pos = destination(a, 270, 500);
    const p = routeProgress(pos, [a, b, c], 0, 2)!;
    expect(p.nextIndex).toBe(0);
    expect(p.dtw).toBeCloseTo(500, 1);
    expect(p.btw).toBeCloseTo(90, 0);
    expect(p.remaining).toBeCloseTo(3500, 0);
    expect(p.ttg).toBeCloseTo(1750, 0);
    expect(p.ttgNext).toBeCloseTo(250, 0);
    expect(p.finished).toBe(false);
  });

  it('advances past reached waypoints', () => {
    const pos = destination(a, 90, 10); // within arrival radius of a
    const p = routeProgress(pos, [a, b, c], 0, 2)!;
    expect(p.nextIndex).toBe(1);
    expect(p.remaining).toBeCloseTo(distance(pos, b) + 2000, 0);
  });

  it('reports finished at the last waypoint', () => {
    const p = routeProgress(c, [a, b, c], 2, 2)!;
    expect(p.finished).toBe(true);
    expect(p.remaining).toBeCloseTo(0, 3);
  });

  it('has no ETA when stationary', () => {
    expect(routeProgress(a, [a, b], 0, 0)!.ttg).toBeNull();
  });
});

describe('guidance', () => {
  const start = { lat: 52.0, lon: 5.0 };
  const end = destination(start, 90, 2000);

  it('has no cross-track error on the first waypoint', () => {
    expect(routeProgress(start, [end], 0, 2, undefined, 90)!.xte).toBeNull();
  });

  it('reports signed cross-track error: positive when right of the leg', () => {
    const onLine = destination(start, 90, 1000);
    const right = destination(onLine, 180, 25);
    const left = destination(onLine, 0, 40);
    expect(routeProgress(onLine, [start, end], 1, 2)!.xte!).toBeCloseTo(0, 0);
    expect(routeProgress(right, [start, end], 1, 2)!.xte!).toBeCloseTo(25, 0);
    expect(routeProgress(left, [start, end], 1, 2)!.xte!).toBeCloseTo(-40, 0);
  });

  it('computes the steering cue as a normalised turn', () => {
    const pos = destination(start, 90, 500);
    expect(routeProgress(pos, [start, end], 1, 2, undefined, 60)!.steer!).toBeCloseTo(30, 0);
    expect(routeProgress(pos, [start, end], 1, 2, undefined, 120)!.steer!).toBeCloseTo(-30, 0);
    expect(routeProgress(pos, [start, end], 1, 2, undefined, 350)!.steer!).toBeCloseTo(100, 0);
    expect(routeProgress(pos, [start, end], 1, 2, undefined, 271)!.steer!).toBeCloseTo(179, 0);
    expect(routeProgress(pos, [start, end], 1, 2)!.steer).toBeNull();
  });

  it('computes VMG toward the waypoint', () => {
    const pos = destination(start, 90, 500);
    expect(routeProgress(pos, [start, end], 1, 4, undefined, 90)!.vmg!).toBeCloseTo(4, 3);
    expect(routeProgress(pos, [start, end], 1, 4, undefined, 0)!.vmg!).toBeCloseTo(0, 3);
    expect(routeProgress(pos, [start, end], 1, 4, undefined, 180 + 90)!.vmg!).toBeCloseTo(-4, 3);
    expect(routeProgress(pos, [start, end], 1, null, undefined, 90)!.vmg).toBeNull();
  });
});
