import { describe, expect, it } from 'vitest';
import type { DataManifest } from '../src/core/waterway-data';
import { buildFis, fetchAll, parseWkt, publishedManifest, shouldSkip, type FisRaw } from '../tools/fis/build.ts';

const meta = {
  generation: 4933,
  published: '2026-09-28T15:01:00Z',
  built: '2026-09-29T00:00:00Z',
  source: 'test',
};
const empty: FisRaw = {
  bridge: [],
  opening: [],
  lock: [],
  operatingtimes: [],
  radiocallinpoint: [],
  berth: [],
};

describe('WKT', () => {
  it('reads points as lon lat', () => {
    expect(parseWkt('POINT (4.910907298444726 52.376176894184425)')).toEqual({
      lat: 52.376177,
      lon: 4.910907,
    });
  });

  it('places polygons at their centroid', () => {
    const p = parseWkt('POLYGON ((5 52, 5.002 52, 5.002 52.001, 5 52.001, 5 52))')!;
    expect(p.lon).toBeCloseTo(5.001, 6);
    expect(p.lat).toBeCloseTo(52.0005, 6);
  });

  it('gives up on anything else', () => {
    expect(parseWkt('')).toBeNull();
    expect(parseWkt('POINT EMPTY')).toBeNull();
  });
});

describe('joining', () => {
  const raw: FisRaw = {
    ...empty,
    bridge: [
      {
        Id: 1,
        Name: 'Draaibrug',
        Geometry: 'POINT (4.9109 52.3762)',
        CanOpen: true,
        OperatingTimesId: 10,
      },
      {
        Id: 2,
        Name: 'Vaste brug',
        Geometry: 'POINT (5.1 52.1)',
        CanOpen: false,
      },
      {
        Id: 3,
        Name: 'Duitse brug',
        Geometry: 'POINT (7.5 53.0)',
        CanOpen: false,
      },
      { Id: 4, Name: 'Onbekend', Geometry: 'POINT (5.2 52.2)' },
    ],
    opening: [
      {
        Id: 11,
        ParentId: 1,
        ParentGeoType: 'bridge',
        Type: 'DR',
        Width: 19.9,
        ClearanceHeightClosed: 3.25,
        HeightClosed: 2.85,
      },
      {
        Id: 12,
        ParentId: 1,
        ParentGeoType: 'bridge',
        Type: 'DR',
        Width: 15.5,
        ClearanceHeightClosed: 3.4,
      },
      {
        Id: 13,
        ParentId: 2,
        ParentGeoType: 'bridge',
        Type: 'VST',
        Width: 5,
        HeightClosed: 2.4,
      },
      {
        Id: 14,
        ParentId: 2,
        ParentGeoType: 'bridge',
        Type: 'VST',
        Width: 6.123,
        ClearanceHeightClosed: 2.9199999,
      },
      {
        Id: 15,
        ParentId: 1,
        ParentGeoType: 'exceptionalnavigationalstructure',
        Type: 'VST',
        ClearanceHeightClosed: 0.5,
      },
      { Id: 16, ParentId: 4, ParentGeoType: 'bridge', Type: 'OPH', Width: 8 },
    ],
    radiocallinpoint: [
      {
        Id: 21,
        ParentId: 1,
        ParentGeoType: 'bridge',
        VhfChannels: ['22 of 69'],
      },
      {
        Id: 22,
        ParentId: 1,
        ParentGeoType: 'bridge',
        VhfChannels: ['22', '18'],
      },
      { Id: 23, ParentId: 5, ParentGeoType: 'lock', VhfChannels: ['20'] },
      { Id: 24, ParentId: 2, ParentGeoType: 'vinharbour', VhfChannels: ['9'] },
    ],
    operatingtimes: [
      { Id: 10, Note: `${'x'.repeat(400)}` },
      { Id: 50, Note: 'Sluis bediend op verzoek.\r\nTel 0900' },
    ],
    lock: [
      {
        Id: 5,
        Name: 'Sluis',
        Geometry: 'POLYGON ((5 52, 5.002 52, 5.002 52.001, 5 52.001, 5 52))',
        NumberOfChambers: 2,
        OperatingTimesId: 50,
      },
      { Id: 6, Name: 'Ver weg', Geometry: 'POINT (9 53)' },
    ],
    berth: [
      {
        Id: 31,
        Name: 'Ligplaats A',
        Geometry: 'POINT (5.3 52.3)',
        Status: ['PUBLIC'],
      },
      { Id: 32, Name: 'Ligplaats B', Geometry: 'POINT (2 52.3)' },
      {
        Id: 33,
        Name: 'Privé',
        Geometry: 'POINT (5.4 52.3)',
        Status: ['PRIVATE', 'UN_WATCHED'],
      },
      { Id: 34, Name: 'Kade Havenbedrijf', Geometry: 'POINT (5.5 52.3)', Category: 'LOADING_AND_UNLOADING' },
    ],
  };
  const fis = buildFis(raw, meta);

  it('keeps the lowest clearance and the widest passage of a bridge', () => {
    const b = fis.bridges.find((x) => x.name === 'Draaibrug')!;
    expect(b).toMatchObject({
      lat: 52.3762,
      lon: 4.9109,
      canOpen: true,
      clearance: 3.25,
      width: 19.9,
    });
  });

  it('falls back to the structural height and rounds to centimetres', () => {
    const b = fis.bridges.find((x) => x.name === 'Vaste brug')!;
    expect(b).toMatchObject({ canOpen: false, clearance: 2.4, width: 6.12 });
  });

  it('derives canOpen from the passages when the bridge does not say', () => {
    expect(fis.bridges.find((x) => x.name === 'Onbekend')).toMatchObject({
      canOpen: true,
    });
    expect(fis.bridges.find((x) => x.name === 'Onbekend')!.clearance).toBeUndefined();
  });

  it('drops bridges outside the Netherlands', () => {
    expect(fis.bridges.map((b) => b.name)).not.toContain('Duitse brug');
    expect(fis.locks.map((l) => l.name)).toEqual(['Sluis']);
    expect(fis.berths.map((b) => b.name)).toEqual(['Ligplaats A']);
  });

  it('joins VHF channels from call-in points of bridges and locks only', () => {
    expect(fis.bridges.find((x) => x.name === 'Draaibrug')!.vhf).toBe('22/69/18');
    expect(fis.locks[0].vhf).toBe('20');
    expect(fis.bridges.find((x) => x.name === 'Vaste brug')!.vhf).toBeUndefined();
  });

  it('attaches operating notes, trimmed', () => {
    expect(fis.bridges.find((x) => x.name === 'Draaibrug')!.hours).toHaveLength(300);
    expect(fis.locks[0].hours).toBe('Sluis bediend op verzoek.\nTel 0900');
  });

  it('places locks at the centroid and keeps the chamber count', () => {
    expect(fis.locks[0]).toMatchObject({
      lat: 52.0005,
      lon: 5.001,
      chambers: 2,
    });
  });

  it('skips private berths and industrial quays', () => {
    expect(fis.berths.map((b) => b.name)).toEqual(['Ligplaats A']);
  });

  it('records the generation', () => {
    expect(fis).toMatchObject({
      version: 1,
      generation: 4933,
      published: meta.published,
    });
  });
});

describe('fetching', () => {
  const page = (offset: number, total: number, count: number) =>
    Response.json({
      TotalCount: total,
      Result: Array.from({ length: count }, (_, i) => ({ Id: offset + i })),
    });

  it('pages until TotalCount, at most 4 requests at once', async () => {
    let active = 0;
    let peak = 0;
    const urls: string[] = [];
    const fetcher = (async (url: string) => {
      urls.push(url);
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      const offset = Number(new URL(url).searchParams.get('offset'));
      return page(offset, 3200, Math.min(500, 3200 - offset));
    }) as unknown as typeof fetch;
    const all = await fetchAll('bridge', {
      base: 'https://x/api',
      generation: 7,
      fetch: fetcher,
      backoffMs: 0,
    });
    expect(all).toHaveLength(3200);
    expect(all.map((o) => o.Id)).toEqual(Array.from({ length: 3200 }, (_, i) => i));
    expect(urls[0]).toBe('https://x/api/7/bridge?offset=0&count=500');
    expect(urls).toHaveLength(7);
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('retries a failing page three times, then gives up', async () => {
    let calls = 0;
    const flaky = (async () => {
      calls++;
      return calls < 3 ? new Response('busy', { status: 503 }) : page(0, 2, 2);
    }) as unknown as typeof fetch;
    expect(
      await fetchAll('lock', {
        base: 'https://x',
        generation: 1,
        fetch: flaky,
        backoffMs: 0,
      }),
    ).toHaveLength(2);
    expect(calls).toBe(3);

    calls = 0;
    const down = (async () => {
      calls++;
      return new Response('no', { status: 500 });
    }) as unknown as typeof fetch;
    await expect(
      fetchAll('lock', {
        base: 'https://x',
        generation: 1,
        fetch: down,
        backoffMs: 0,
      }),
    ).rejects.toThrow(/500/);
    expect(calls).toBe(4);
  });
});

describe('publishing', () => {
  const manifest: DataManifest = {
    waterways: './data/w.json',
    places: './data/p.json',
    built: 'b',
    source: 's',
  };

  it('skips an unchanged generation unless forced', () => {
    const published = {
      ...manifest,
      fis: './data/fis-4933.json',
      fisGeneration: 4933,
    };
    expect(shouldSkip(4933, published, false)).toBe(true);
    expect(shouldSkip(4934, published, false)).toBe(false);
    expect(shouldSkip(4933, published, true)).toBe(false);
    expect(shouldSkip(4933, manifest, false)).toBe(false);
    expect(shouldSkip(4933, null, false)).toBe(false);
  });

  it('adds or replaces the fis entry and keeps the rest', () => {
    const next = publishedManifest(manifest, 'fis-4933.json', 4933);
    expect(next).toEqual({
      ...manifest,
      fis: './data/fis-4933.json',
      fisGeneration: 4933,
    });
    expect(publishedManifest(next, 'fis-4934.json', 4934)).toMatchObject({
      fis: './data/fis-4934.json',
      fisGeneration: 4934,
    });
  });
});
