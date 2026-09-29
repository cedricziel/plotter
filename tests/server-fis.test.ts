import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiMeta, ApiPlacesResponse, ApiRouteResponse } from '../src/core/api';
import { FIS_FORMAT_VERSION, type FisFile } from '../src/core/fis';
import type { Place } from '../src/core/waterway-data';
import { startServer, type RunningServer } from '../server/app';
import { fixture, latlon } from './graph-fixture';

const graph = fixture({ S: [0, 0], T: [10000, 0], M: [5000, 3000] }, [
  {
    a: 'S',
    b: 'T',
    name: 'Hoofdvaart',
    obstacles: [{ pos: 5000, type: 'fixed' }],
  },
  { a: 'S', b: 'M', name: 'Omweg' },
  { a: 'M', b: 'T', name: 'Omweg' },
]);
const places: Place[] = [
  {
    name: 'Lage brug',
    kind: 'bridge',
    ...latlon(5000, 8),
    info: { clearance: 5, phone: '0123' },
  },
];
const fis: FisFile = {
  version: FIS_FORMAT_VERSION,
  generation: 4933,
  published: '2026-09-28T15:01:00Z',
  built: '2026-09-29T00:00:00Z',
  source: 'test',
  bridges: [
    {
      name: 'Brug 7',
      ...latlon(5000, 0),
      canOpen: false,
      clearance: 2.9,
      width: 12,
      vhf: '22',
    },
  ],
  locks: [{ name: 'Sluis Oost', ...latlon(8000, 0), hours: 'Dag en nacht' }],
  berths: [{ name: 'Passantenplaats', ...latlon(3000, 0) }],
};

const write = (dir: string, manifest: Record<string, unknown>, fisFile?: string) => {
  writeFileSync(join(dir, 'waterways-a.json'), JSON.stringify(graph));
  writeFileSync(join(dir, 'places-a.json'), JSON.stringify(places));
  if (fisFile !== undefined) writeFileSync(join(dir, 'fis-1.json'), fisFile);
  writeFileSync(
    join(dir, 'current.json'),
    JSON.stringify({
      waterways: './data/waterways-a.json',
      places: './data/places-a.json',
      built: 'a',
      source: 'test',
      ...manifest,
    }),
  );
};

const dirs: string[] = [];
const servers: RunningServer[] = [];
const serve = async (manifest: Record<string, unknown>, fisFile?: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'plotter-fis-'));
  dirs.push(dir);
  write(dir, manifest, fisFile);
  const s = await startServer({ dataDir: dir, port: 0, pollMs: 0 });
  servers.push(s);
  return { s, dir };
};

let withFis: RunningServer;
let without: RunningServer;

beforeAll(async () => {
  withFis = (await serve({ fis: './data/fis-1.json', fisGeneration: 4933 }, JSON.stringify(fis))).s;
  without = (await serve({})).s;
});

afterAll(async () => {
  await Promise.all(servers.map((s) => s.close()));
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const json = async <T>(s: RunningServer, path: string) => (await fetch(s.url + path)).json() as Promise<T>;
const route = async (s: RunningServer) =>
  (await (
    await fetch(s.url + '/api/route', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        from: latlon(0, 0),
        to: latlon(10000, 0),
        vessel: { airDraft: 4 },
      }),
    })
  ).json()) as ApiRouteResponse;
const bbox = '4.99,51.99,5.2,52.01';

describe('server with fairway data', () => {
  it('reports the generation and how many graph bridges were matched', async () => {
    const meta = await json<ApiMeta>(withFis, '/api/meta');
    expect(meta.fis).toEqual({
      generation: 4933,
      bridges: 1,
      locks: 1,
      berths: 1,
      matched: 1,
      obstacles: 1,
    });
    expect(meta.counts?.places).toBe(1);
  });

  it('still loads a manifest without a fairway file', async () => {
    const meta = await json<ApiMeta>(without, '/api/meta');
    expect(meta.ready).toBe(true);
    expect(meta.fis).toBeUndefined();
  });

  it('routes a tall vessel around a bridge the official clearance makes too low', async () => {
    const before = await route(without);
    expect(before.warnings).toEqual(['1 fixed bridge with unknown clearance']);
    expect(before.distance).toBeCloseTo(10000, -1);

    const after = await route(withFis);
    expect(after.warnings).toEqual([]);
    expect(after.distance).toBeGreaterThan(11000);
  });

  it('lists the official bridges, locks and berths with their details, merged with OSM places', async () => {
    const found = (await json<ApiPlacesResponse>(withFis, `/api/places?bbox=${bbox}`)).places;
    expect(found.map((p) => `${p.kind}:${p.name}`)).toEqual([
      'mooring:Passantenplaats',
      'lock:Sluis Oost',
      'bridge:Brug 7',
    ]);
    expect(found.find((p) => p.kind === 'bridge')!.info).toEqual({
      clearance: 2.9,
      width: 12,
      canOpen: false,
      vhf: '22',
      phone: '0123',
      source: 'vaarweginformatie',
    });
    expect(found.find((p) => p.kind === 'lock')!.info).toMatchObject({
      openingHours: 'Dag en nacht',
    });
  });

  it('keeps the previous ranking and cap', async () => {
    const found = (await json<ApiPlacesResponse>(withFis, `/api/places?bbox=${bbox}&limit=2`)).places;
    expect(found.map((p) => p.kind)).toEqual(['mooring', 'lock']);
  });

  it('serves OSM data alone when the fairway file is unreadable', async () => {
    const { s } = await serve({ fis: './data/fis-1.json', fisGeneration: 1 }, '{"version":99}');
    const meta = await json<ApiMeta>(s, '/api/meta');
    expect(meta.ready).toBe(true);
    expect(meta.fis).toBeUndefined();
    expect((await json<ApiPlacesResponse>(s, `/api/places?bbox=${bbox}`)).places.map((p) => p.name)).toEqual([
      'Lage brug',
    ]);
  });

  it('picks the fairway data up when the manifest gains it', async () => {
    const { s, dir } = await serve({});
    expect((await json<ApiMeta>(s, '/api/meta')).fis).toBeUndefined();
    write(dir, { fis: './data/fis-1.json', fisGeneration: 4933 }, JSON.stringify(fis));
    expect(await s.store.reload()).toBe(true);
    expect((await json<ApiMeta>(s, '/api/meta')).fis?.generation).toBe(4933);
  });
});
