import { describe, expect, it } from 'vitest';
import {
  CorridorTooLarge,
  corridorTiles,
  lonLatToTile,
  placesInCorridor,
  subgraph,
  tileSizeMeters,
} from '../src/core/corridor';
import { destination } from '../src/core/geo';
import { decodeGraph, findRoute } from '../src/core/routing';
import { fixture, latlon } from './graph-fixture';

const line = (from: [number, number], km: number, bearing = 90): [number, number][] => {
  const a = { lat: from[1], lon: from[0] };
  return Array.from({ length: Math.ceil(km * 2) + 1 }, (_, i) => {
    const p = destination(a, bearing, i * 500);
    return [p.lon, p.lat] as [number, number];
  });
};

describe('tile math', () => {
  it('maps coordinates to slippy tiles', () => {
    expect(lonLatToTile(0, 0, 1)).toEqual({ x: 1, y: 1 });
    expect(lonLatToTile(-179.9, 84, 2)).toEqual({ x: 0, y: 0 });
    expect(lonLatToTile(4.9, 52.37, 0)).toEqual({ x: 0, y: 0 });
    const t = lonLatToTile(4.9, 52.37, 14);
    expect(t.x).toBeGreaterThan(8400);
    expect(t.x).toBeLessThan(8430);
  });

  it('shrinks tiles with zoom and latitude', () => {
    expect(tileSizeMeters(10, 52)).toBeCloseTo(tileSizeMeters(9, 52) / 2, 3);
    expect(tileSizeMeters(10, 52)).toBeLessThan(tileSizeMeters(10, 0));
  });
});

describe('corridorTiles', () => {
  const shape = line([4.9, 52.38], 20);
  const opts = { buffer: 1000, minZoom: 8, maxZoom: 14, cap: 20_000 };

  it('covers every polyline vertex at every zoom and has no duplicates', () => {
    const tiles = corridorTiles(shape, opts);
    const keys = new Set(tiles.map((t) => t.join('/')));
    expect(keys.size).toBe(tiles.length);
    for (let z = 8; z <= 14; z++) {
      for (const [lon, lat] of shape) {
        const { x, y } = lonLatToTile(lon, lat, z);
        expect(keys.has(`${z}/${x}/${y}`)).toBe(true);
      }
    }
  });

  it('respects the zoom range', () => {
    const zs = new Set(corridorTiles(shape, { ...opts, minZoom: 10, maxZoom: 12 }).map((t) => t[0]));
    expect([...zs].sort()).toEqual([10, 11, 12]);
  });

  it('grows with the buffer and with the zoom', () => {
    const narrow = corridorTiles(shape, { ...opts, buffer: 200 });
    const wide = corridorTiles(shape, { ...opts, buffer: 4000 });
    expect(wide.length).toBeGreaterThan(narrow.length);
    const z14 = narrow.filter((t) => t[0] === 14).length;
    const z10 = narrow.filter((t) => t[0] === 10).length;
    expect(z14).toBeGreaterThan(z10);
  });

  it('throws when the corridor exceeds the cap', () => {
    expect(() => corridorTiles(shape, { ...opts, cap: 50 })).toThrow(CorridorTooLarge);
  });

  it('handles a single point', () => {
    expect(corridorTiles([[4.9, 52.38]], { ...opts, minZoom: 10, maxZoom: 10 }).length).toBeGreaterThan(0);
  });
});

describe('subgraph', () => {
  const vertices: Record<string, [number, number]> = {
    A: [0, 0],
    B: [10000, 0],
    C: [5000, 30000],
    D: [10000, 30000],
    E: [5000, 2000],
  };
  const file = fixture(vertices, [
    { a: 'A', b: 'B', name: 'Hoofdvaart', obstacles: [{ pos: 5000, type: 'lock', name: 'Sluis' }] },
    { a: 'C', b: 'D', name: 'Ver weg' },
    { a: 'B', b: 'E', name: 'Zijtak' },
  ]);
  const g = decodeGraph(file);
  const shape = [latlon(0, 0), latlon(10000, 0)].map((p) => [p.lon, p.lat] as [number, number]);
  const meta = { built: 'b', source: 's' };

  it('keeps edges within the buffer and drops distant ones', () => {
    const sub = subgraph(g, shape, 1000, meta);
    const names = sub.edges.map((e) => sub.names[e[3]]).sort();
    expect(names).toContain('Hoofdvaart');
    expect(names).toContain('Zijtak');
    expect(names).not.toContain('Ver weg');
    expect(sub.vertices.length / 2).toBeLessThan(file.vertices.length / 2);
  });

  it('produces a graph the router decodes with the same result', () => {
    const sub = decodeGraph(subgraph(g, shape, 1000, meta));
    const full = findRoute(g, latlon(500, 20), latlon(9500, -20));
    const part = findRoute(sub, latlon(500, 20), latlon(9500, -20));
    expect(part.ok && full.ok).toBe(true);
    if (part.ok && full.ok) {
      expect(part.distance).toBeCloseTo(full.distance, 0);
      expect(part.maneuvers.map((m) => m.text)).toEqual(full.maneuvers.map((m) => m.text));
    }
  });

  it('records the built time and source of the parent data', () => {
    const sub = subgraph(g, shape, 1000, meta);
    expect(sub.built).toBe('b');
    expect(sub.source).toBe('s');
  });
});

describe('placesInCorridor', () => {
  it('selects places within the buffer of the polyline', () => {
    const shape = line([4.9, 52.38], 10);
    const near = destination({ lat: 52.38, lon: 4.9 }, 0, 500);
    const far = destination({ lat: 52.38, lon: 4.9 }, 0, 5000);
    const places = [
      { name: 'Dichtbij', kind: 'marina' as const, lat: near.lat, lon: near.lon },
      { name: 'Ver', kind: 'marina' as const, lat: far.lat, lon: far.lon },
    ];
    expect(placesInCorridor(places, shape, 1000).map((p) => p.name)).toEqual(['Dichtbij']);
  });
});
