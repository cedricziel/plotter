import { describe, expect, it } from 'vitest';
import { FIS_FORMAT_VERSION, mergeFisIntoGraph, mergeFisPlaces, type FisBridge, type FisFile } from '../src/core/fis';
import { decodeGraph, findRoute, type VesselProfile } from '../src/core/routing';
import type { Place } from '../src/core/waterway-data';
import { fixture, latlon, type FixtureObstacle } from './graph-fixture';

const emptyFis: FisFile = {
  version: FIS_FORMAT_VERSION,
  generation: 1,
  published: '',
  built: '',
  source: 'test',
  bridges: [],
  locks: [],
  berths: [],
};
const fis = (over: Partial<FisFile>): FisFile => ({ ...emptyFis, ...over });
const bridge = (x: number, y: number, over: Partial<FisBridge> = {}): FisBridge => ({
  name: 'Brug',
  ...latlon(x, y),
  canOpen: false,
  ...over,
});

const vertices: Record<string, [number, number]> = {
  S: [0, 0],
  T: [10000, 0],
  M: [5000, 3000],
};
const network = (obstacle: FixtureObstacle) =>
  decodeGraph(
    fixture(vertices, [
      { a: 'S', b: 'T', name: 'Hoofdvaart', obstacles: [obstacle] },
      { a: 'S', b: 'M', name: 'Omweg' },
      { a: 'M', b: 'T', name: 'Omweg' },
    ]),
  );
const route = (g: ReturnType<typeof network>, profile: VesselProfile) => {
  const r = findRoute(g, latlon(0, 0), latlon(10000, 0), { profile });
  if (!r.ok) throw new Error(r.message);
  return r;
};
const unknownBridge: FixtureObstacle = { pos: 5000, type: 'fixed' };

describe('merging FIS into the routing graph', () => {
  it('turns a fixed bridge of unknown clearance into a blocker for a tall vessel', () => {
    const g = network(unknownBridge);
    expect(route(g, { airDraft: 4 }).warnings.map((w) => w.text)).toEqual(['1 fixed bridge with unknown clearance']);
    expect(route(g, { airDraft: 4 }).distance).toBeCloseTo(10000, -1);

    const merged = mergeFisIntoGraph(g, fis({ bridges: [bridge(5000, 12, { clearance: 2.9 })] }));
    expect(merged).toEqual({ matched: 1, total: 1 });
    const detour = route(g, { airDraft: 4 });
    expect(detour.distance).toBeGreaterThan(11000);
    expect(detour.warnings).toEqual([]);
    expect(route(g, { airDraft: 2.5 }).distance).toBeCloseTo(10000, -1);
  });

  it('lets FIS clearance replace the OSM value', () => {
    const g = network({ pos: 5000, type: 'fixed', clearance: 500 });
    mergeFisIntoGraph(g, fis({ bridges: [bridge(5000, 0, { clearance: 3.1 })] }));
    expect(g.obstacles[0][0][2]).toBe(310);
    expect(route(g, { airDraft: 4 }).distance).toBeGreaterThan(11000);
  });

  it('makes an opening bridge passable, at the price of a wait', () => {
    const g = network(unknownBridge);
    mergeFisIntoGraph(
      g,
      fis({
        bridges: [bridge(5000, 0, { name: 'Draaibrug', clearance: 2.9, canOpen: true })],
      }),
    );
    expect(g.eMovable[0]).toBe(1);
    const r = route(g, { airDraft: 4 });
    expect(r.distance).toBeCloseTo(10000, -1);
    expect(r.warnings).toEqual([]);
    expect(r.maneuvers.find((m) => m.type === 'bridge-open')).toMatchObject({
      text: 'Opening bridge: Draaibrug',
      clearance: 290,
    });
  });

  it('turns a bridge FIS calls fixed from movable back into a fixed one', () => {
    const g = network({ pos: 5000, type: 'movable', clearance: 400 });
    mergeFisIntoGraph(g, fis({ bridges: [bridge(5000, 0, { clearance: 2.5 })] }));
    expect(g.eMovable[0]).toBe(0);
    expect(route(g, { airDraft: 4 }).distance).toBeGreaterThan(11000);
  });

  it('keeps OSM values where FIS knows nothing', () => {
    const g = network({
      pos: 5000,
      type: 'fixed',
      clearance: 500,
      name: 'Osm',
    });
    mergeFisIntoGraph(g, fis({ bridges: [bridge(5000, 0, { name: '' })] }));
    expect(g.obstacles[0][0].slice(1, 3)).toEqual([1, 500]);
    expect(g.names[g.obstacles[0][0][3]]).toBe('Osm');
  });

  it('names an unnamed obstacle after its FIS bridge', () => {
    const g = network(unknownBridge);
    mergeFisIntoGraph(g, fis({ bridges: [bridge(5000, 0, { name: 'Brug 12', clearance: 2 })] }));
    expect(g.names[g.obstacles[0][0][3]]).toBe('Brug 12');
  });

  it('matches only within 40 m and picks the nearest bridge', () => {
    const g = network(unknownBridge);
    const far = mergeFisIntoGraph(g, fis({ bridges: [bridge(5000, 45, { clearance: 2 })] }));
    expect(far).toEqual({ matched: 0, total: 1 });
    expect(g.obstacles[0][0][2]).toBe(0);

    const both = mergeFisIntoGraph(
      g,
      fis({
        bridges: [bridge(5000, 30, { clearance: 9 }), bridge(5010, 5, { clearance: 2.2 })],
      }),
    );
    expect(both.matched).toBe(1);
    expect(g.obstacles[0][0][2]).toBe(220);
  });

  it('leaves locks alone and counts only bridge obstacles', () => {
    const g = decodeGraph(
      fixture(vertices, [
        {
          a: 'S',
          b: 'T',
          obstacles: [
            { pos: 2000, type: 'lock' },
            { pos: 5000, type: 'fixed' },
          ],
        },
      ]),
    );
    const merged = mergeFisIntoGraph(g, fis({ bridges: [bridge(2000, 0, { clearance: 1 })] }));
    expect(merged).toEqual({ matched: 0, total: 1 });
    expect(g.eLocks[0]).toBe(1);
  });
});

describe('merging FIS into places', () => {
  const osm: Place[] = [
    {
      name: 'Lage brug',
      kind: 'bridge',
      ...latlon(100, 100),
      info: { clearance: 3, phone: '0123' },
    },
    { name: 'Haven', kind: 'harbour', ...latlon(3000, 0) },
    {
      name: 'Sluis West',
      kind: 'lock',
      ...latlon(6000, 0),
      info: { vhf: '18' },
    },
  ];

  it('adds bridges, locks and berths with their details', () => {
    const merged = mergeFisPlaces(
      osm,
      fis({
        bridges: [
          bridge(9000, 0, {
            name: 'Draaibrug',
            clearance: 3.25,
            width: 19.9,
            canOpen: true,
            vhf: '22/69',
            hours: 'Op verzoek',
          }),
        ],
        locks: [
          {
            name: 'Sluis Oost',
            ...latlon(8000, 0),
            vhf: '20',
            hours: 'Dag en nacht',
          },
        ],
        berths: [{ name: 'Passantenhaven', ...latlon(7000, 0) }],
      }),
    );
    expect(merged.find((p) => p.name === 'Draaibrug')).toEqual({
      name: 'Draaibrug',
      kind: 'bridge',
      ...latlon(9000, 0),
      info: {
        clearance: 3.25,
        width: 19.9,
        canOpen: true,
        vhf: '22/69',
        openingHours: 'Op verzoek',
        source: 'vaarweginformatie',
      },
    });
    expect(merged.find((p) => p.name === 'Sluis Oost')).toMatchObject({
      kind: 'lock',
      info: {
        vhf: '20',
        openingHours: 'Dag en nacht',
        source: 'vaarweginformatie',
      },
    });
    expect(merged.find((p) => p.name === 'Passantenhaven')).toMatchObject({
      kind: 'mooring',
      info: { source: 'vaarweginformatie' },
    });
    expect(merged).toHaveLength(osm.length + 3);
  });

  it('merges a FIS bridge into the OSM bridge within 50 m, preferring FIS values', () => {
    const merged = mergeFisPlaces(
      osm,
      fis({
        bridges: [bridge(100, 130, { name: 'Officiële brug', clearance: 2.8 })],
      }),
    );
    const bridges = merged.filter((p) => p.kind === 'bridge');
    expect(bridges).toHaveLength(1);
    expect(bridges[0]).toMatchObject({
      name: 'Officiële brug',
      info: { clearance: 2.8, phone: '0123', source: 'vaarweginformatie' },
    });
  });

  it('keeps the OSM name when FIS has none and the OSM value where FIS is silent', () => {
    const merged = mergeFisPlaces(osm, fis({ bridges: [bridge(100, 100, { name: '' })] }));
    expect(merged.find((p) => p.kind === 'bridge')).toMatchObject({
      name: 'Lage brug',
      info: { clearance: 3 },
    });
  });

  it('does not merge across kinds or beyond 50 m', () => {
    const merged = mergeFisPlaces(
      osm,
      fis({
        bridges: [bridge(100, 170, { name: 'Nabij' })],
        locks: [{ name: 'Sluis in de haven', ...latlon(3000, 10) }],
      }),
    );
    expect(merged.filter((p) => p.kind === 'bridge').map((p) => p.name)).toEqual(['Lage brug', 'Nabij']);
    expect(merged.find((p) => p.name === 'Haven')).toBeTruthy();
    expect(merged.find((p) => p.name === 'Sluis in de haven')).toBeTruthy();
  });

  it('lets each OSM place absorb one FIS place only', () => {
    const merged = mergeFisPlaces(
      osm,
      fis({
        bridges: [bridge(100, 100, { name: 'Eerste' }), bridge(100, 110, { name: 'Tweede' })],
      }),
    );
    expect(merged.filter((p) => p.kind === 'bridge').map((p) => p.name)).toEqual(['Eerste', 'Tweede']);
  });

  it('returns the OSM places untouched without FIS data', () => {
    expect(mergeFisPlaces(osm, emptyFis)).toEqual(osm);
  });
});
