import { describe, expect, it } from 'vitest';
import { subgraph } from '../src/core/corridor';
import { decodeGraph } from '../src/core/routing';
import { TripRouter, searchTrips, seamarksFromTrips, type Trip } from '../src/core/trips';
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

describe('seamarksFromTrips', () => {
  const buoy = (name: string, x: number, y: number, type = 'buoy_lateral') => ({ ...latlon(x, y), type, name });
  const withMarks = (t: Trip, seamarks?: Trip['seamarks']): Trip => ({ ...t, seamarks });
  const box = (w: number, s: number, e: number, n: number) => {
    const [sw, ne] = [latlon(w, s), latlon(e, n)];
    return [sw.lon, sw.lat, ne.lon, ne.lat] as [number, number, number, number];
  };

  it('collects the saved seamarks inside the box, without duplicates', () => {
    const shared = buoy('gedeeld', 100, 0);
    const trips = [
      withMarks(south, [shared, buoy('binnen', 200, 0), buoy('buiten', 9000, 0)]),
      withMarks(north, [shared, buoy('noord', 200, 30000)]),
    ];
    expect(seamarksFromTrips(trips, box(0, -100, 1000, 100), 10).map((s) => s.name)).toEqual(['gedeeld', 'binnen']);
  });

  it('keeps marks before lights before notices when the limit cuts the list', () => {
    const trips = [
      withMarks(south, [
        buoy('bord', 100, 0, 'notice'),
        buoy('licht', 200, 0, 'light_minor'),
        buoy('ton', 300, 0),
        buoy('baken', 400, 0, 'beacon_lateral'),
      ]),
    ];
    expect(seamarksFromTrips(trips, box(0, -100, 1000, 100), 3).map((s) => s.name)).toEqual(['ton', 'baken', 'licht']);
  });

  it('skips trips saved before seamarks were stored', () => {
    expect(seamarksFromTrips([south, north], box(-1000, -1000, 20000, 40000), 10)).toEqual([]);
  });
});

describe('searchTrips', () => {
  it('searches the places saved with the trips', () => {
    expect(searchTrips([south, north], 'haven no').map((p) => p.name)).toEqual(['Haven noord']);
    expect(searchTrips([south, north], 'haven').map((p) => p.name)).toEqual(['Haven zuid', 'Haven noord']);
  });
});
