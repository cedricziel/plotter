import { describe, expect, it } from 'vitest';
import { FLAG, OBSTACLE, type EdgeTuple, type WaterwayFile } from '../src/core/waterway-data';
import { buildWaterways } from '../tools/waterways/build.ts';
import { decodeOplValue, parseOplLine, type OplNode, type OplWay } from '../tools/waterways/opl.ts';

const esc = (s: string) => s.replace(/[ ,=%\n@]/g, (c) => `%${c.charCodeAt(0).toString(16)}%`);
type Pt = [id: number, lon: number, lat: number];
const tagStr = (t: Record<string, string>) =>
  Object.entries(t)
    .map(([k, v]) => `${esc(k)}=${esc(v)}`)
    .join(',');
const way = (id: number, tags: Record<string, string>, pts: Pt[]) =>
  `w${id} v1 dV c1 t2024-01-01T00:00:00Z i1 utest T${tagStr(tags)} N${pts.map(([n, x, y]) => `n${n}x${x}y${y}`).join(',')}`;
const node = (id: number, tags: Record<string, string>, lon: number, lat: number) =>
  `n${id} v1 dV c1 t2024-01-01T00:00:00Z i1 utest T${tagStr(tags)} x${lon} y${lat}`;

const canal = { waterway: 'canal' };
const build = (lines: string[]) => buildWaterways(lines, { source: 'test', built: '2026-01-01T00:00:00Z' });
const names = (f: WaterwayFile, e: EdgeTuple) => f.names[e[3]];
const ends = (f: WaterwayFile, e: EdgeTuple) => [e[0], e[1]].map((v) => [f.vertices[2 * v], f.vertices[2 * v + 1]]);

// a straight east-west canal of 4 nodes, 1 km/0.001° = 68 m per step
const straight = (
  id: number,
  first: number,
  tags: Record<string, string> = canal,
  lat = 52.0,
  lon0 = 5.0,
  n = 4,
): string =>
  way(
    id,
    tags,
    Array.from({ length: n }, (_, i) => [first + i, +(lon0 + i * 0.01).toFixed(6), lat] as Pt),
  );

describe('OPL parsing', () => {
  it('decodes %hex% escapes', () => {
    expect(decodeOplValue('Brug%20%1972%2c%%20%Buysbrug')).toBe('Brug 1972, Buysbrug');
  });

  it('parses ways with embedded locations and tags', () => {
    const p = parseOplLine(
      way(7, { name: 'A, B', waterway: 'canal' }, [
        [1, 5.1, 52.2],
        [2, 5.2, 52.3],
      ]),
    ) as OplWay;
    expect(p.type).toBe('w');
    expect(p.id).toBe(7);
    expect(p.tags.name).toBe('A, B');
    expect(p.nodes).toEqual([
      { id: 1, lon: 5100000, lat: 52200000 },
      { id: 2, lon: 5200000, lat: 52300000 },
    ]);
  });

  it('parses tagged nodes and skips untagged ones and relations', () => {
    const n = parseOplLine(node(3, { place: 'town', name: 'X' }, 4.9, 52.1)) as OplNode;
    expect(n.type).toBe('n');
    expect(n.lat).toBe(52100000);
    expect(n.lon).toBe(4900000);
    expect(parseOplLine('n5 v1 x1 y2')).toBeNull();
    expect(parseOplLine('r1 v1 Mw1@')).toBeNull();
  });
});

describe('graph topology', () => {
  it('contracts a plain chain into one edge that keeps its polyline', () => {
    const { file } = build([straight(1, 10, { ...canal, name: 'Kanaal' })]);
    expect(file.edges).toHaveLength(1);
    expect(file.vertices).toHaveLength(4);
    const e = file.edges[0];
    expect(names(file, e)).toBe('Kanaal');
    expect(e[10]).toHaveLength(4); // two interior points
    expect(e[2]).toBeGreaterThan(2000);
    expect(e[2]).toBeLessThan(2100);
    expect(ends(file, e)).toEqual([
      [52000000, 5000000],
      [52000000, 5030000],
    ]);
  });

  it('splits at junctions shared between ways', () => {
    const t = way(2, canal, [
      [12, 5.02, 52.0],
      [20, 5.02, 52.01],
    ]);
    const { file } = build([straight(1, 10, canal, 52.0, 5.0, 5), t]);
    expect(file.edges).toHaveLength(3);
    expect(file.vertices.length / 2).toBe(4);
  });

  it('keeps way attributes on separate edges when consecutive ways meet', () => {
    const w1 = way(1, { waterway: 'river', name: 'Zaan' }, [
      [1, 5.0, 52.0],
      [2, 5.01, 52.0],
    ]);
    const w2 = way(2, { waterway: 'canal', name: 'Kanaal', CEMT: 'IV' }, [
      [2, 5.01, 52.0],
      [3, 5.02, 52.0],
    ]);
    const { file } = build([w1, w2]);
    expect(file.edges.map((e) => names(file, e)).sort()).toEqual(['Kanaal', 'Zaan']);
    expect(file.edges.find((e) => names(file, e) === 'Kanaal')![5]).toBe(5);
  });

  it('records oneway, boat flags and dimension limits', () => {
    const { file } = build([
      straight(1, 10, { ...canal, oneway: 'yes', boat: 'yes', maxheight: '3.5', maxdraught: '1,2', maxwidth: '4 m' }),
    ]);
    const e = file.edges[0];
    expect(e[6]).toBe(FLAG.ONEWAY_FWD | FLAG.BOAT_YES);
    expect(e[7]).toBe(120);
    expect(e[8]).toBe(400);
    expect(e[9]).toBe(350);
  });

  it('drops culverts, boat=no and motorboat=no but keeps motorboat=yes overrides', () => {
    const { file, stats } = build([
      straight(1, 10, { ...canal, tunnel: 'culvert' }, 52.0),
      straight(2, 20, { ...canal, boat: 'no' }, 52.01),
      straight(3, 30, { ...canal, motorboat: 'no' }, 52.02),
      straight(4, 40, { ...canal, boat: 'no', motorboat: 'yes' }, 52.03),
      straight(5, 50, { waterway: 'ditch' }, 52.04),
    ]);
    expect(file.edges).toHaveLength(1);
    expect(stats.excluded).toEqual({ culvert: 1, 'boat=no': 1, 'motorboat=no': 1 });
  });

  it('keeps the largest component and components longer than 1 km only', () => {
    const big = straight(1, 10, canal, 52.0, 5.0, 30); // ~20 km
    const mid = straight(2, 100, canal, 52.1, 5.0, 20); // ~13 km
    const tiny = straight(3, 200, canal, 52.2, 5.0, 4); // ~2 km
    const small = way(4, canal, [
      [300, 5.0, 52.3],
      [301, 5.001, 52.3],
    ]); // ~70 m
    const { file, stats } = build([big, mid, tiny, small]);
    expect(file.edges).toHaveLength(3);
    expect(stats.components).toBe(4);
    expect(stats.droppedComponents).toBe(1);
  });
});

describe('obstacles', () => {
  const water = straight(1, 10, { ...canal, name: 'Vaart' }, 52.0, 5.0, 5); // x 5.00..5.04, ~2.7 km
  const roadAcross = (id: number, lon: number, tags: Record<string, string>) =>
    way(id, { highway: 'residential', ...tags }, [
      [id * 10, lon, 51.999],
      [id * 10 + 1, lon, 52.001],
    ]);

  it('detects a fixed bridge where a bridge way crosses the edge and records its position', () => {
    const { file } = build([water, roadAcross(2, 5.02, { bridge: 'yes', name: 'Brugstraat' })]);
    const obstacles = file.edges[0][11];
    expect(obstacles).toHaveLength(1);
    const [pos, type, clearance, name] = obstacles[0];
    expect(type).toBe(OBSTACLE.bridgeFixed);
    expect(clearance).toBe(0);
    expect(file.names[name]).toBe('Brugstraat');
    expect(pos).toBeGreaterThan(1300);
    expect(pos).toBeLessThan(1400);
  });

  it('ignores roads without bridge tag and bridges that do not cross the water', () => {
    const away = way(3, { highway: 'residential', bridge: 'yes' }, [
      [30, 5.02, 52.01],
      [31, 5.02, 52.02],
    ]);
    const { file } = build([water, roadAcross(2, 5.02, {}), away]);
    expect(file.edges[0][11]).toHaveLength(0);
  });

  it('classifies movable bridges by bridge=movable or bridge:movable', () => {
    const { file } = build([
      water,
      roadAcross(2, 5.01, { bridge: 'movable' }),
      roadAcross(3, 5.03, { bridge: 'yes', 'bridge:movable': 'bascule' }),
    ]);
    expect(file.edges[0][11].map((o) => o[1])).toEqual([OBSTACLE.bridgeMovable, OBSTACLE.bridgeMovable]);
  });

  it('keeps the road maxheight separate from the clearance', () => {
    const { file } = build([water, roadAcross(2, 5.02, { bridge: 'yes', maxheight: '3.6' })]);
    const o = file.edges[0][11][0];
    expect(o[2]).toBe(0);
    expect(o[4]).toBe(360);
  });

  it('reads physical clearance tags from the bridge way', () => {
    const { file } = build([water, roadAcross(2, 5.02, { bridge: 'yes', 'maxheight:physical': '4.2' })]);
    expect(file.edges[0][11][0][2]).toBe(420);
  });

  it('merges dual-carriageway bridges into one obstacle', () => {
    const a = roadAcross(2, 5.02, { bridge: 'yes' });
    const b = roadAcross(3, 5.0203, { bridge: 'yes' });
    expect(build([water, a, b]).file.edges[0][11]).toHaveLength(1);
  });

  it('uses seamark bridge nodes for clearance, category and name', () => {
    const sea = node(
      99,
      {
        'seamark:type': 'bridge',
        'seamark:bridge:category': 'opening',
        'seamark:bridge:clearance_height_closed': '3.8',
        'seamark:name': 'Nieuwe Amstelbrug',
      },
      5.0201,
      52.0,
    );
    const { file } = build([water, roadAcross(2, 5.02, { bridge: 'yes' }), sea]);
    const obstacles = file.edges[0][11];
    expect(obstacles).toHaveLength(1);
    expect(obstacles[0][1]).toBe(OBSTACLE.bridgeMovable);
    expect(obstacles[0][2]).toBe(380);
    expect(file.names[obstacles[0][3]]).toBe('Nieuwe Amstelbrug');
  });

  it('adds a lock obstacle for lock=yes ways with the lock name', () => {
    const chamber = way(2, { ...canal, lock: 'yes', lock_name: 'Oranjesluizen' }, [
      [11, 5.01, 52.0],
      [50, 5.015, 52.0],
      [12, 5.02, 52.0],
    ]);
    const { file } = build([straight(1, 10, canal, 52.0, 5.0, 4), chamber]);
    const locks = file.edges.flatMap((e) => e[11]).filter((o) => o[1] === OBSTACLE.lock);
    expect(locks.length).toBeGreaterThan(0);
    expect(file.names[locks[0][3]]).toBe('Oranjesluizen');
  });

  it('puts the lock on a through fairway that runs beside the chamber ways', () => {
    const fairway = straight(1, 10, { waterway: 'fairway', name: 'Buiten-IJ' }, 52.0, 5.0, 4);
    const chamber = way(2, { ...canal, lock: 'yes', name: 'Oranjesluizen' }, [
      [11, 5.01, 52.0],
      [50, 5.015, 52.0002],
      [12, 5.02, 52.0],
    ]);
    const { file } = build([fairway, chamber]);
    const through = file.edges.filter(
      (e) => file.names[e[3]] === 'Buiten-IJ' && e[11].some((o) => o[1] === OBSTACLE.lock),
    );
    expect(through).toHaveLength(1);
    expect(through[0][11].filter((o) => o[1] === OBSTACLE.lock)).toHaveLength(1);
  });

  it('counts a lock once when both gates are mapped', () => {
    const gate = (id: number, lon: number) => node(id, { waterway: 'lock_gate', name: 'Papenpadsluis' }, lon, 52.0);
    const { file } = build([water, gate(90, 5.0195), gate(91, 5.0205)]);
    const locks = file.edges[0][11];
    expect(locks).toHaveLength(1);
    expect(locks[0][1]).toBe(OBSTACLE.lock);
    expect(file.names[locks[0][3]]).toBe('Papenpadsluis');
  });
});

describe('places', () => {
  const water = straight(1, 10, { ...canal, name: 'Zaan' }, 52.0, 5.0, 5);

  it('indexes harbours, marinas, moorings, locks, named bridges, towns and waterways', () => {
    const { places } = build([
      water,
      way(2, { highway: 'residential', bridge: 'yes', name: 'Zaanbrug' }, [
        [20, 5.02, 51.999],
        [21, 5.02, 52.001],
      ]),
      way(3, { ...canal, lock: 'yes', lock_name: 'Zaansluis' }, [
        [11, 5.01, 52.0],
        [50, 5.015, 52.0],
        [12, 5.02, 52.0],
      ]),
      node(90, { leisure: 'marina', name: 'Jachthaven Zaan' }, 5.03, 52.005),
      node(91, { harbour: 'yes', name: 'Havenkom' }, 5.031, 52.006),
      node(92, { mooring: 'visitor', name: 'Bezoekersteiger' }, 5.032, 52.007),
      node(93, { place: 'town', name: 'Zaandam' }, 5.04, 52.008),
      node(94, { place: 'village', name: 'Koog' }, 5.041, 52.009),
      node(95, { place: 'city', name: 'Amsterdam' }, 5.05, 52.01),
    ]);
    const kinds = (n: string) => places.filter((p) => p.name === n).map((p) => p.kind);
    expect(kinds('Jachthaven Zaan')).toEqual(['marina']);
    expect(kinds('Havenkom')).toEqual(['harbour']);
    expect(kinds('Bezoekersteiger')).toEqual(['mooring']);
    expect(kinds('Zaandam')).toEqual(['town']);
    expect(kinds('Koog')).toEqual(['village']);
    expect(kinds('Amsterdam')).toEqual(['city']);
    expect(kinds('Zaansluis')).toEqual(['lock']);
    expect(kinds('Zaanbrug')).toEqual(['bridge']);
    expect(kinds('Zaan')).toEqual(['waterway']);
  });

  it('places waterway entries on the waterway', () => {
    const { places } = build([water]);
    const p = places.find((x) => x.kind === 'waterway')!;
    expect(p.lat).toBeCloseTo(52.0, 5);
    expect(p.lon).toBeGreaterThanOrEqual(5.0);
    expect(p.lon).toBeLessThanOrEqual(5.04);
  });

  it('deduplicates equal name and kind within 300 m but not further apart', () => {
    const { places } = build([
      node(90, { leisure: 'marina', name: 'Jachthaven' }, 5.0, 52.0),
      node(91, { leisure: 'marina', name: 'Jachthaven' }, 5.001, 52.0),
      node(92, { leisure: 'marina', name: 'Jachthaven' }, 5.1, 52.0),
      node(93, { harbour: 'yes', name: 'Jachthaven' }, 5.0, 52.0),
    ]);
    expect(places.filter((p) => p.kind === 'marina')).toHaveLength(2);
    expect(places.filter((p) => p.kind === 'harbour')).toHaveLength(1);
  });

  it('skips unnamed features', () => {
    const { places } = build([node(90, { leisure: 'marina' }, 5.0, 52.0)]);
    expect(places).toHaveLength(0);
  });

  describe('info', () => {
    const info = (lines: string[], name: string) => build(lines).places.find((p) => p.name === name)?.info;

    it('keeps VHF, contact, hours, berths and operator from the tags', () => {
      const tags = {
        leisure: 'marina',
        name: 'Jachthaven Zaan',
        'contact:vhf': '31',
        'contact:phone': '+31 75 123',
        url: 'https://haven.example/',
        opening_hours: 'Apr-Oct 08:00-20:00',
        'capacity:berths': '120 berths',
        operator: 'WSV Zaan',
      };
      expect(info([node(90, tags, 5.03, 52.005)], tags.name)).toEqual({
        vhf: '31',
        phone: '+31 75 123',
        website: 'https://haven.example/',
        openingHours: 'Apr-Oct 08:00-20:00',
        berths: 120,
        operator: 'WSV Zaan',
      });
    });

    it('omits info when no tag applies and drops non-http websites', () => {
      const bare = node(90, { leisure: 'marina', name: 'A' }, 5.0, 52.0);
      const js = node(91, { leisure: 'marina', name: 'B', website: 'javascript:alert(1)' }, 5.1, 52.0);
      const { places } = build([bare, js]);
      expect(places.every((p) => !('info' in p))).toBe(true);
    });

    it('adds clearance and opening hours to bridges and hours to locks', () => {
      const { places } = build([
        water,
        way(
          2,
          {
            highway: 'residential',
            bridge: 'movable',
            name: 'Zaanbrug',
            maxheight: '3',
            clearance: '4.5',
            opening_hours: 'Mo-Fr 06:00-22:00',
          },
          [
            [20, 5.02, 51.999],
            [21, 5.02, 52.001],
          ],
        ),
        way(3, { ...canal, lock: 'yes', lock_name: 'Zaansluis', opening_hours: '24/7', operator: 'Rijkswaterstaat' }, [
          [11, 5.01, 52.0],
          [50, 5.015, 52.0],
          [12, 5.02, 52.0],
        ]),
      ]);
      expect(places.find((p) => p.kind === 'bridge')?.info).toEqual({
        clearance: 4.5,
        openingHours: 'Mo-Fr 06:00-22:00',
      });
      expect(places.find((p) => p.kind === 'lock')?.info).toEqual({
        openingHours: '24/7',
        operator: 'Rijkswaterstaat',
      });
    });
  });
});
