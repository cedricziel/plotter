import { request } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  ApiCorridorResponse,
  ApiMeta,
  ApiPlacesResponse,
  ApiRouteResponse,
  ApiSearchResponse,
  ApiSeamarksResponse,
} from '../src/core/api';
import { decodePolyline, encodePolyline } from '../src/core/polyline';
import type { Place, Seamark } from '../src/core/waterway-data';
import { startServer, type RunningServer } from '../server/app';
import { RateLimiter } from '../server/http';
import { fixture, latlon } from './graph-fixture';

const vertices: Record<string, [number, number]> = {
  S: [0, 0],
  T: [10000, 0],
  M: [5000, 3000],
  U: [15000, 0],
  V: [10000, -5000],
};
const graph = fixture(vertices, [
  {
    a: 'S',
    b: 'T',
    name: 'Hoofdvaart',
    obstacles: [{ pos: 5000, type: 'fixed', name: 'Lage brug', clearance: 300 }],
  },
  { a: 'S', b: 'M', name: 'Omweg' },
  { a: 'M', b: 'T', name: 'Omweg' },
  { a: 'T', b: 'U', name: 'Spoor', obstacles: [{ pos: 100, type: 'fixed', clearance: 200 }] },
  { a: 'T', b: 'V', name: 'Eenrichting', oneway: 'rev' },
]);
const at = (x: number, y: number) => ({ ...latlon(x, y) });
const places: Place[] = [
  { name: 'Hoorn', kind: 'town', ...at(9000, 200) },
  {
    name: 'Jachthaven Hoorn',
    kind: 'marina',
    ...at(9500, 100),
    info: { vhf: '31', website: 'https://haven.example/', berths: 80 },
  },
  { name: 'Lage brug', kind: 'bridge', ...at(5000, 0), info: { clearance: 3 } },
  { name: 'Sluis Noord', kind: 'lock', ...at(9200, 50) },
  { name: 'Hoofdvaart', kind: 'waterway', ...at(5000, 0) },
  { name: 'Verweggistan', kind: 'town', ...at(0, 90000) },
];

const seamarks: Seamark[] = [
  { ...at(9000, 100), type: 'buoy_lateral', category: 'port', colour: 'red', name: 'IJ 1' },
  { ...at(2000, 50), type: 'buoy_cardinal', category: 'north', name: 'Noord' },
  { ...at(5000, 20), type: 'notice', name: 'Verbod' },
  { ...at(9500, -60), type: 'light_minor', light: 'Fl W 5s', name: 'Haventoren' },
  { ...at(0, 90000), type: 'buoy_lateral', name: 'Verweg' },
];

const write = (dir: string, tag: string, built: string, withSeamarks = true) => {
  writeFileSync(join(dir, `waterways-${tag}.json`), JSON.stringify({ ...graph, built }));
  writeFileSync(join(dir, `places-${tag}.json`), JSON.stringify(places));
  writeFileSync(join(dir, `seamarks-${tag}.json`), JSON.stringify(seamarks));
  writeFileSync(
    join(dir, 'current.json'),
    JSON.stringify({
      waterways: `./data/waterways-${tag}.json`,
      places: `./data/places-${tag}.json`,
      ...(withSeamarks ? { seamarks: `./data/seamarks-${tag}.json` } : {}),
      built,
      source: 'test',
    }),
  );
};

let dir: string;
let old: string;
let empty: string;
let srv: RunningServer;
let bare: RunningServer;
let legacy: RunningServer;
let limited: RunningServer;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'plotter-data-'));
  empty = mkdtempSync(join(tmpdir(), 'plotter-empty-'));
  old = mkdtempSync(join(tmpdir(), 'plotter-old-'));
  write(dir, 'a', '2026-01-01T00:00:00Z');
  write(old, 'a', '2026-01-01T00:00:00Z', false);
  srv = await startServer({
    dataDir: dir,
    port: 0,
    pollMs: 0,
    maxTiles: 3000,
    rateLimits: { search: 1000, route: 1000, corridor: 1000, places: 1000, seamarks: 1000 },
  });
  bare = await startServer({ dataDir: empty, port: 0, pollMs: 0 });
  legacy = await startServer({ dataDir: old, port: 0, pollMs: 0 });
  limited = await startServer({
    dataDir: dir,
    port: 0,
    pollMs: 0,
    rateLimits: { search: 3, places: 2, seamarks: 2 },
  });
});

afterAll(async () => {
  await Promise.all([srv.close(), bare.close(), legacy.close(), limited.close()]);
  rmSync(dir, { recursive: true, force: true });
  rmSync(old, { recursive: true, force: true });
  rmSync(empty, { recursive: true, force: true });
});

const get = (s: RunningServer, path: string, headers: Record<string, string> = {}) => fetch(s.url + path, { headers });
const post = (s: RunningServer, path: string, body: unknown, raw = false) =>
  fetch(s.url + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  });

describe('health and meta', () => {
  it('reports health and the loaded data', async () => {
    expect((await get(srv, '/api/health')).status).toBe(200);
    const meta = (await (await get(srv, '/api/meta')).json()) as ApiMeta;
    expect(meta).toMatchObject({ ready: true, built: '2026-01-01T00:00:00Z', source: 'test' });
    expect(meta.counts).toEqual({ vertices: 5, edges: 5, places: 6, seamarks: 5 });
  });

  it('stays healthy without data and answers 503 for data endpoints', async () => {
    expect((await get(bare, '/api/health')).status).toBe(200);
    expect(((await (await get(bare, '/api/meta')).json()) as ApiMeta).ready).toBe(false);
    expect((await get(bare, '/api/search?q=hoorn')).status).toBe(503);
    const r = await post(bare, '/api/route', { from: at(0, 0), to: at(10000, 0) });
    expect(r.status).toBe(503);
    expect(((await r.json()) as { error: string }).error).toMatch(/not available yet/);
  });

  it('answers 404 for unknown paths and 405 for wrong methods', async () => {
    expect((await get(srv, '/api/nope')).status).toBe(404);
    expect((await post(srv, '/api/search', {})).status).toBe(405);
    expect((await get(srv, '/api/route')).status).toBe(405);
  });
});

describe('GET /api/search', () => {
  it('returns ranked results with distances from near', async () => {
    const near = `${at(9000, 0).lat},${at(9000, 0).lon}`;
    const res = await get(srv, `/api/search?q=hoorn&near=${near}&limit=5`);
    const { results } = (await res.json()) as ApiSearchResponse;
    expect(results.map((r) => r.name)).toEqual(['Hoorn', 'Jachthaven Hoorn']);
    expect(results[0].distance).toBeGreaterThan(0);
    expect(results[0].distance).toBeLessThan(1000);
  });

  it('is case and diacritic insensitive and omits distance without near', async () => {
    const { results } = (await (await get(srv, '/api/search?q=JACHTHAVEN')).json()) as ApiSearchResponse;
    expect(results).toHaveLength(1);
    expect(results[0].distance).toBeUndefined();
  });

  it('validates its input', async () => {
    expect((await get(srv, '/api/search')).status).toBe(400);
    expect((await get(srv, '/api/search?q=')).status).toBe(400);
    expect((await get(srv, `/api/search?q=${'x'.repeat(100)}`)).status).toBe(400);
    expect((await get(srv, '/api/search?q=ho&near=abc')).status).toBe(400);
    expect((await get(srv, '/api/search?q=ho&near=10,5')).status).toBe(400);
    expect((await get(srv, '/api/search?q=ho&limit=0')).status).toBe(400);
  });

  it('clamps an oversized limit', async () => {
    const { results } = (await (await get(srv, '/api/search?q=h&limit=100000')).json()) as ApiSearchResponse;
    expect(results.length).toBeLessThanOrEqual(50);
  });

  it('rate limits per client', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await get(limited, '/api/search?q=hoorn')).status);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
    const res = await get(limited, '/api/search?q=hoorn');
    expect(res.headers.get('retry-after')).toBeTruthy();
  });

  it('keys the rate limit on X-Forwarded-For only when proxies are trusted', async () => {
    const trusted = await startServer({
      dataDir: dir,
      port: 0,
      pollMs: 0,
      trustProxy: true,
      rateLimits: { search: 1 },
    });
    try {
      const a = await get(trusted, '/api/search?q=hoorn', { 'x-forwarded-for': '203.0.113.1' });
      const b = await get(trusted, '/api/search?q=hoorn', { 'x-forwarded-for': '203.0.113.2' });
      const c = await get(trusted, '/api/search?q=hoorn', { 'x-forwarded-for': '203.0.113.1' });
      expect([a.status, b.status, c.status]).toEqual([200, 200, 429]);
    } finally {
      await trusted.close();
    }
  });
});

describe('GET /api/places', () => {
  const box = '4.99,51.99,5.2,52.01';
  const list = async (query: string) =>
    ((await (await get(srv, `/api/places?${query}`)).json()) as ApiPlacesResponse).places;

  it('returns the places inside the bbox, harbours first, without waterways', async () => {
    expect((await list(`bbox=${box}`)).map((p) => p.name)).toEqual([
      'Jachthaven Hoorn',
      'Sluis Noord',
      'Hoorn',
      'Lage brug',
    ]);
  });

  it('passes the details through and leaves them out when there are none', async () => {
    const found = await list(`bbox=${box}`);
    expect(found[0].info).toEqual({ vhf: '31', website: 'https://haven.example/', berths: 80 });
    expect('info' in found[1]).toBe(false);
  });

  it('caps the result at limit', async () => {
    expect((await list(`bbox=${box}&limit=2`)).map((p) => p.name)).toEqual(['Jachthaven Hoorn', 'Sluis Noord']);
  });

  it('is empty for a bbox without places and clamps to the Netherlands', async () => {
    expect(await list('bbox=6,52.5,6.1,52.6')).toEqual([]);
    expect(await list('bbox=0,0,1,1')).toEqual([]);
    expect(await list('bbox=4.99,49.5,5.2,52.01')).toHaveLength(4);
  });

  it('rejects a malformed, inverted, outside or oversized bbox and a bad limit', async () => {
    const status = async (q: string) => (await get(srv, `/api/places?${q}`)).status;
    expect(await status('')).toBe(400);
    expect(await status('bbox=1,2,3')).toBe(400);
    expect(await status('bbox=a,b,c,d')).toBe(400);
    expect(await status('bbox=5.2,51.99,4.99,52.01')).toBe(400);
    expect(await status(`bbox=${box}&limit=0`)).toBe(400);
    expect(await status('bbox=4,51,6,52')).toBe(422);
    expect(await status('bbox=4,51,5,53')).toBe(422);
  });

  it('rate limits per client', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await get(limited, `/api/places?bbox=${box}`)).status);
    expect(codes).toEqual([200, 200, 429]);
  });
});

describe('GET /api/seamarks', () => {
  const box = '4.99,51.99,5.2,52.01';
  const list = async (query: string) =>
    ((await (await get(srv, `/api/seamarks?${query}`)).json()) as ApiSeamarksResponse).seamarks;

  it('returns the seamarks inside the bbox, marks before lights before notices', async () => {
    expect((await list(`bbox=${box}`)).map((s) => s.name)).toEqual(['IJ 1', 'Noord', 'Haventoren', 'Verbod']);
  });

  it('passes the attributes through and leaves out what is missing', async () => {
    const [buoy, , light] = await list(`bbox=${box}`);
    expect(buoy).toMatchObject({ type: 'buoy_lateral', category: 'port', colour: 'red' });
    expect('light' in buoy).toBe(false);
    expect(light.light).toBe('Fl W 5s');
  });

  it('caps the result at limit', async () => {
    expect((await list(`bbox=${box}&limit=2`)).map((s) => s.name)).toEqual(['IJ 1', 'Noord']);
  });

  it('is empty for a bbox without seamarks and clamps to the Netherlands', async () => {
    expect(await list('bbox=6,52.5,6.1,52.6')).toEqual([]);
    expect(await list('bbox=0,0,1,1')).toEqual([]);
    expect(await list('bbox=4.99,49.5,5.2,52.01')).toHaveLength(4);
  });

  it('rejects a malformed, inverted, outside or oversized bbox and a bad limit', async () => {
    const status = async (q: string) => (await get(srv, `/api/seamarks?${q}`)).status;
    expect(await status('')).toBe(400);
    expect(await status('bbox=1,2,3')).toBe(400);
    expect(await status('bbox=a,b,c,d')).toBe(400);
    expect(await status('bbox=5.2,51.99,4.99,52.01')).toBe(400);
    expect(await status(`bbox=${box}&limit=0`)).toBe(400);
    expect(await status('bbox=4,51,6,52')).toBe(422);
    expect(await status('bbox=4,51,5,53')).toBe(422);
  });

  it('rate limits per client', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await get(limited, `/api/seamarks?bbox=${box}`)).status);
    expect(codes).toEqual([200, 200, 429]);
  });

  it('answers 503 without data and an empty list when the data has no seamark file', async () => {
    expect((await get(bare, `/api/seamarks?bbox=${box}`)).status).toBe(503);
    const res = await get(legacy, `/api/seamarks?bbox=${box}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ seamarks: [] });
    expect(((await (await get(legacy, '/api/meta')).json()) as ApiMeta).counts?.seamarks).toBe(0);
  });
});

describe('POST /api/route', () => {
  const req = { from: at(500, 20), to: at(9500, -20), destName: 'Hoorn' };

  it('returns polyline, maneuvers and snap distances', async () => {
    const res = await post(srv, '/api/route', req);
    expect(res.status).toBe(200);
    const r = (await res.json()) as ApiRouteResponse;
    expect(r.distance).toBeCloseTo(9000, -1);
    expect(r.duration).toBeGreaterThan(r.distance / 5);
    expect(decodePolyline(r.polyline).length).toBeGreaterThanOrEqual(2);
    expect(r.maneuvers[0].type).toBe('depart');
    expect(r.maneuvers.at(-1)).toMatchObject({ type: 'arrive', text: 'Arrive at Hoorn' });
    expect(r.snap.from).toBeCloseTo(20, 0);
    expect(r.snap.to).toBeCloseTo(20, 0);
  });

  it('takes the vessel profile and speed into account', async () => {
    const low = (await (await post(srv, '/api/route', { ...req, vessel: { airDraft: 4 } })).json()) as ApiRouteResponse;
    expect(low.distance).toBeGreaterThan(10500);
    const fast = (await (await post(srv, '/api/route', { ...req, speed: 5 })).json()) as ApiRouteResponse;
    expect(fast.duration).toBeCloseTo(fast.distance / 5, 0);
  });

  it('ends a route to a town at its harbour and says so', async () => {
    const body = { from: at(500, 20), to: { ...at(9000, 200) }, toKind: 'town', destName: 'Hoorn' };
    const r = (await (await post(srv, '/api/route', body)).json()) as ApiRouteResponse;
    expect(r.end?.name).toBe('Jachthaven Hoorn');
    expect(r.maneuvers.at(-1)?.text).toBe('Arrive at Jachthaven Hoorn');
    expect((await post(srv, '/api/route', { ...body, toKind: 'castle' })).status).toBe(400);
  });

  it('routes via intermediate stops', async () => {
    const r = (await (await post(srv, '/api/route', { ...req, via: [at(5000, 3000)] })).json()) as ApiRouteResponse;
    expect(r.maneuvers.some((m) => m.type === 'via')).toBe(true);
    expect(r.distance).toBeGreaterThan(10500);
  });

  it('answers 404 when the destination is unreachable and 422 outside the network', async () => {
    const trap = await post(srv, '/api/route', { from: at(0, 0), to: at(10000, -4000) });
    expect(trap.status).toBe(404);
    expect(((await trap.json()) as { error: string }).error).toMatch(/connection/i);
    const far = await post(srv, '/api/route', { from: at(0, 0), to: at(0, 40000) });
    expect(far.status).toBe(422);
    expect(((await far.json()) as { error: string }).error).toMatch(/waterway/);
  });

  it('answers 404 when no route fits the vessel', async () => {
    const to = at(14000, 0);
    expect((await post(srv, '/api/route', { from: at(0, 0), to })).status).toBe(200);
    const blocked = await post(srv, '/api/route', { from: at(0, 0), to, vessel: { airDraft: 4 } });
    expect(blocked.status).toBe(404);
    expect(((await blocked.json()) as { error: string }).error).toMatch(/vessel/);
  });

  it('validates the body', async () => {
    expect((await post(srv, '/api/route', '{nope', true)).status).toBe(400);
    expect((await post(srv, '/api/route', { from: at(0, 0) })).status).toBe(400);
    expect((await post(srv, '/api/route', { from: { lat: 'x', lon: 5 }, to: at(0, 0) })).status).toBe(400);
    expect((await post(srv, '/api/route', { from: { lat: 10, lon: 5 }, to: at(0, 0) })).status).toBe(422);
    expect((await post(srv, '/api/route', { ...req, vessel: { airDraft: -1 } })).status).toBe(400);
    expect((await post(srv, '/api/route', { ...req, speed: 0 })).status).toBe(400);
    expect((await post(srv, '/api/route', { ...req, via: Array(20).fill(at(1000, 0)) })).status).toBe(400);
    expect((await post(srv, '/api/route', { ...req, destName: 'x'.repeat(500) })).status).toBe(400);
  });

  it('rejects oversized bodies', async () => {
    const res = await post(srv, '/api/route', { ...req, destName: 'x'.repeat(100_000) });
    expect(res.status).toBe(413);
  });
});

describe('POST /api/corridor', () => {
  const shape = [at(0, 0), at(5000, 0), at(10000, 0)].map((p) => [p.lon, p.lat] as [number, number]);
  const polyline = encodePolyline(shape);

  it('returns tiles, a size estimate, the subgraph and places', async () => {
    const res = await post(srv, '/api/corridor', { polyline, bufferMeters: 500, minZoom: 10, maxZoom: 13 });
    expect(res.status).toBe(200);
    const c = (await res.json()) as ApiCorridorResponse;
    expect(c.tileCount).toBe(c.tiles.length);
    expect(new Set(c.tiles.map((t) => t.join('/'))).size).toBe(c.tiles.length);
    expect(c.tiles.every((t) => t[0] >= 10 && t[0] <= 13)).toBe(true);
    expect(c.estimate).toBe('average');
    expect(c.estimatedBytes).toBeGreaterThan(0);
    expect(c.graph.edges.length).toBeGreaterThan(0);
    expect(c.graph.names).toContain('Hoofdvaart');
    expect(c.places.map((p) => p.name)).toContain('Hoorn');
    expect(c.places.map((p) => p.name)).not.toContain('Verweggistan');
  });

  it('includes the seamarks along the course', async () => {
    const res = await post(srv, '/api/corridor', { polyline, bufferMeters: 500, minZoom: 10, maxZoom: 11 });
    const c = (await res.json()) as ApiCorridorResponse;
    expect(c.seamarks.map((s) => s.name).sort()).toEqual(['Haventoren', 'IJ 1', 'Noord', 'Verbod']);
  });

  it('has no seamarks when the data has none', async () => {
    const res = await post(legacy, '/api/corridor', { polyline, bufferMeters: 500, minZoom: 10, maxZoom: 11 });
    expect(((await res.json()) as ApiCorridorResponse).seamarks).toEqual([]);
  });

  it('clamps the buffer and zoom range', async () => {
    const c = (await (
      await post(srv, '/api/corridor', { polyline, bufferMeters: 50_000, minZoom: -4, maxZoom: 99 })
    ).json()) as ApiCorridorResponse;
    expect(c.tiles.every((t) => t[0] >= 0 && t[0] <= 15)).toBe(true);
  });

  it('applies defaults', async () => {
    const c = (await (await post(srv, '/api/corridor', { polyline })).json()) as ApiCorridorResponse;
    expect(Math.min(...c.tiles.map((t) => t[0]))).toBe(8);
    expect(Math.max(...c.tiles.map((t) => t[0]))).toBe(14);
  });

  it('caps the tile count with 422', async () => {
    const long = encodePolyline([
      [3.5, 51],
      [7, 53.5],
    ]);
    const res = await post(srv, '/api/corridor', { polyline: long, bufferMeters: 5000, maxZoom: 15 });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toMatch(/too large/);
  });

  it('rejects a polyline longer than 600 km', async () => {
    const zigzag = encodePolyline([
      [3.5, 51],
      [7, 53.5],
      [3.5, 51],
    ]);
    const res = await post(srv, '/api/corridor', { polyline: zigzag, minZoom: 0, maxZoom: 0 });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toMatch(/longer than 600 km/);
  });

  it('validates the polyline', async () => {
    expect((await post(srv, '/api/corridor', {})).status).toBe(400);
    expect((await post(srv, '/api/corridor', { polyline: '_' })).status).toBe(400);
    expect((await post(srv, '/api/corridor', { polyline: encodePolyline([[4, 52]]) })).status).toBe(400);
    expect(
      (
        await post(srv, '/api/corridor', {
          polyline: encodePolyline([
            [40, 10],
            [41, 10],
          ]),
        })
      ).status,
    ).toBe(422);
  });

  it('gzips large responses when the client accepts it', async () => {
    const encoding = await new Promise<string | undefined>((resolve, reject) => {
      const req = request(
        `${srv.url}/api/corridor`,
        { method: 'POST', headers: { 'content-type': 'application/json', 'accept-encoding': 'gzip' } },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const body = JSON.parse(gunzipSync(Buffer.concat(chunks)).toString()) as ApiCorridorResponse;
            expect(body.graph.edges.length).toBeGreaterThan(0);
            resolve(res.headers['content-encoding']);
          });
        },
      );
      req.on('error', reject);
      req.end(JSON.stringify({ polyline, bufferMeters: 2000 }));
    });
    expect(encoding).toBe('gzip');
  });
});

describe('data reload', () => {
  it('hot-swaps to a newer dataset', async () => {
    const d = mkdtempSync(join(tmpdir(), 'plotter-swap-'));
    write(d, 'a', '2026-01-01T00:00:00Z');
    const s = await startServer({ dataDir: d, port: 0, pollMs: 0 });
    try {
      expect(((await (await get(s, '/api/meta')).json()) as ApiMeta).built).toBe('2026-01-01T00:00:00Z');
      write(d, 'b', '2026-02-01T00:00:00Z');
      expect(await s.store.reload()).toBe(true);
      expect(((await (await get(s, '/api/meta')).json()) as ApiMeta).built).toBe('2026-02-01T00:00:00Z');
      expect(await s.store.reload()).toBe(false);
    } finally {
      await s.close();
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('keeps serving the old data when the new files are broken', async () => {
    const d = mkdtempSync(join(tmpdir(), 'plotter-broken-'));
    write(d, 'a', '2026-01-01T00:00:00Z');
    const s = await startServer({ dataDir: d, port: 0, pollMs: 0 });
    try {
      writeFileSync(join(d, 'waterways-c.json'), '{broken');
      writeFileSync(
        join(d, 'current.json'),
        JSON.stringify({
          waterways: './data/waterways-c.json',
          places: './data/places-a.json',
          built: 'x',
          source: 'x',
        }),
      );
      expect(await s.store.reload()).toBe(false);
      expect((await get(s, '/api/search?q=hoorn')).status).toBe(200);
    } finally {
      await s.close();
      rmSync(d, { recursive: true, force: true });
    }
  });
});

describe('RateLimiter', () => {
  it('keeps the key map bounded when every request uses a new key', () => {
    const rl = new RateLimiter(60_000);
    for (let i = 0; i < 25_000; i++) rl.check(`k${i}`, 5, 0);
    expect((rl as unknown as { hits: Map<string, unknown> }).hits.size).toBeLessThanOrEqual(10_000);
    expect(rl.check('k24999', 1, 0)).toBeGreaterThan(0);
  });
});
