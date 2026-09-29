import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiRouteResponse } from '../src/core/api';
import { subgraph } from '../src/core/corridor';
import { encodePolyline } from '../src/core/polyline';
import { decodeGraph } from '../src/core/routing';
import { TripRouter, type Trip } from '../src/core/trips';
import { ApiError, api } from '../src/services/api';
import { planCourse, type CourseRequest, type PlanDeps } from '../src/services/courses';
import { fixture, latlon } from './graph-fixture';

const full = decodeGraph(
  fixture({ A: [0, 0], B: [10000, 0] }, [
    { a: 'A', b: 'B', name: 'Vaart', obstacles: [{ pos: 5000, type: 'lock', name: 'Sluis' }] },
  ]),
);
const line = [latlon(0, 0), latlon(10000, 0)].map((p) => [p.lon, p.lat] as [number, number]);
const trip: Trip = {
  id: 't',
  name: 'Vaart',
  savedAt: 1,
  bufferMeters: 1000,
  polyline: encodePolyline(line),
  tileCount: 1,
  bytes: 1,
  graph: subgraph(full, line, 1000, { built: 'b', source: 's' }),
  places: [{ name: 'Jachthaven Eind', kind: 'marina', ...latlon(9400, 150) }],
};
const req = (to: Partial<CourseRequest['to']> = {}): CourseRequest => ({
  from: latlon(500, 20),
  to: { ...latlon(9500, -20), name: 'Eind', ...to },
  via: [],
  vessel: {},
  speed: 2.5,
});
const online: ApiRouteResponse = {
  distance: 9000,
  duration: 3600,
  polyline: encodePolyline(line),
  maneuvers: [
    { type: 'depart', dist: 0, text: 'Depart', ...latlon(0, 0) },
    { type: 'arrive', dist: 9000, text: 'Arrive', ...latlon(9000, 0) },
  ],
  warnings: ['w'],
  snap: { from: 20, to: 20 },
};
const deps = (route: PlanDeps['route'], trips: Trip[] = [trip]): PlanDeps => ({
  route,
  trips,
  tripRouter: new TripRouter(),
});
const down = (status = 0) => vi.fn().mockRejectedValue(new ApiError('unavailable', status, 'down'));

describe('planCourse', () => {
  it('uses the routing service when it answers', async () => {
    const plan = await planCourse(deps(vi.fn().mockResolvedValue(online)), req());
    expect(plan).toMatchObject({ charted: { source: 'online', warnings: ['w'], snap: { from: 20, to: 20 } } });
  });

  it('keeps the coded warnings when the service sends them', async () => {
    const coded = { code: 'unknown-clearance', params: { count: 1 }, text: 'w' };
    const plan = await planCourse(deps(vi.fn().mockResolvedValue({ ...online, warningDetails: [coded] })), req());
    expect(plan).toMatchObject({ charted: { warnings: [coded] } });
  });

  it('passes the destination kind so the service can pick a harbour', async () => {
    const route = vi.fn().mockResolvedValue({ ...online, end: { name: 'Haven', lat: 52, lon: 5 } });
    const plan = await planCourse(deps(route), req({ kind: 'town' }));
    expect(route.mock.calls[0][0]).toMatchObject({ toKind: 'town', destName: 'Eind' });
    expect(plan).toMatchObject({ charted: { end: { name: 'Haven' } } });
  });

  it('falls back to a saved corridor when the service is unreachable', async () => {
    const plan = await planCourse(deps(down()), req());
    expect(plan).toMatchObject({ charted: { source: 'offline', tripId: 't' } });
    if ('charted' in plan) expect(plan.charted.maneuvers.some((m) => m.text === 'Pass Sluis (lock)')).toBe(true);
  });

  it('routes offline to the harbour of a town from the saved places', async () => {
    const plan = await planCourse(deps(down(503)), req({ kind: 'town' }));
    expect(plan).toMatchObject({ charted: { source: 'offline', end: { name: 'Jachthaven Eind' } } });
  });

  it('explains when nothing can chart the course', async () => {
    expect(await planCourse(deps(down(), []), req())).toEqual({ problem: 'Routing service not reachable' });
    expect(await planCourse(deps(down(503), []), req())).toEqual({ problem: 'Routing data not available yet' });
    const outside = req({ ...latlon(9500, 40000) });
    expect(await planCourse(deps(down()), outside)).toEqual({ problem: 'Routing service not reachable' });
  });

  it('reports a refusal from the service without trying the corridor', async () => {
    const route = vi.fn().mockRejectedValue(new ApiError('rejected', 404, 'No navigable connection'));
    expect(await planCourse(deps(route), req())).toEqual({ problem: 'No navigable connection' });
  });
});

describe('api client', () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (fn: typeof fetch) => {
    vi.stubGlobal('location', { href: 'http://plotter.test/' });
    vi.stubGlobal('fetch', fn);
  };
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('parses answers and builds the search query', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json(200, { results: [{ name: 'Hoorn', kind: 'town', lat: 1, lon: 2 }] }));
    stub(fetchMock);
    const r = await api.search('hoorn', { lat: 52.38, lon: 4.89 });
    expect(r[0].name).toBe('Hoorn');
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe('/api/search');
    expect(url.searchParams.get('q')).toBe('hoorn');
    expect(url.searchParams.get('near')).toBe('52.38000,4.89000');
  });

  it('tells an unreachable service from one that refuses', async () => {
    stub(vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(api.meta()).rejects.toMatchObject({ kind: 'unavailable' });
    stub(vi.fn().mockResolvedValue(json(503, { error: 'Routing data not available yet' })));
    await expect(api.meta()).rejects.toMatchObject({
      kind: 'unavailable',
      status: 503,
      message: 'Routing data not available yet',
    });
    stub(vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 })));
    await expect(api.meta()).rejects.toMatchObject({ kind: 'unavailable', status: 502 });
    stub(vi.fn().mockResolvedValue(json(422, { error: 'to is outside the Netherlands' })));
    await expect(api.route({ from: { lat: 1, lon: 1 }, to: { lat: 1, lon: 1 } })).rejects.toMatchObject({
      kind: 'rejected',
      message: 'to is outside the Netherlands',
    });
  });

  it('lets an abort through as an abort', async () => {
    stub(vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
    await expect(api.search('ho', null)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
