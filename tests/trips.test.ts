import { describe, expect, it } from 'vitest';
import { subgraph } from '../src/core/corridor';
import { decodeGraph } from '../src/core/routing';
import { TripRouter, searchTrips, type Trip } from '../src/core/trips';
import { fixture, latlon } from './graph-fixture';

const full = decodeGraph(
  fixture({ A: [0, 0], B: [10000, 0], C: [0, 30000], D: [10000, 30000] }, [
    { a: 'A', b: 'B', name: 'Zuid', obstacles: [{ pos: 5000, type: 'lock', name: 'Zuidsluis' }] },
    { a: 'C', b: 'D', name: 'Noord' },
  ]),
);
const trip = (id: string, y: number, savedAt: number): Trip => {
  const line = [latlon(0, y), latlon(10000, y)].map((p) => [p.lon, p.lat] as [number, number]);
  return {
    id,
    name: id,
    savedAt,
    bufferMeters: 1000,
    polyline: '',
    tileCount: 10,
    bytes: 1000,
    graph: subgraph(full, line, 1000, { built: 'b', source: 's' }),
    places: [{ name: `Haven ${id}`, kind: 'harbour', ...latlon(500, y) }],
  };
};
const south = trip('zuid', 0, 1);
const north = trip('noord', 30000, 2);

describe('TripRouter', () => {
  const router = new TripRouter();

  it('routes inside a saved corridor', () => {
    const r = router.route([south, north], latlon(500, 30), latlon(9500, -30), {})!;
    expect(r.trip.id).toBe('zuid');
    expect(r.result.ok && r.result.distance).toBeCloseTo(9000, -1);
    expect(r.result.ok && r.result.maneuvers.some((m) => m.text === 'Pass Zuidsluis (lock)')).toBe(true);
  });

  it('picks the trip that covers both ends', () => {
    const r = router.route([south, north], latlon(500, 30030), latlon(9500, 29970), {})!;
    expect(r.trip.id).toBe('noord');
  });

  it('returns null when no trip covers start and destination', () => {
    expect(router.route([south, north], latlon(500, 0), latlon(500, 30000), {})).toBeNull();
    expect(router.route([south], latlon(500, 0), latlon(500, 15000), {})).toBeNull();
    expect(router.route([], latlon(500, 0), latlon(9500, 0), {})).toBeNull();
  });
});

describe('searchTrips', () => {
  it('searches the places saved with the trips', () => {
    expect(searchTrips([south, north], 'haven no').map((p) => p.name)).toEqual(['Haven noord']);
    expect(searchTrips([south, north], 'haven').map((p) => p.name)).toEqual(['Haven zuid', 'Haven noord']);
  });
});
