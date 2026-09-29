import { describe, expect, it } from 'vitest';
import { decodeGraph, findRoute, findRouteVia, snapToGraph, type RouteResult } from '../src/core/routing';
import { fixture, latlon, type FixtureEdge } from './graph-fixture';

type Ok = Extract<RouteResult, { ok: true }>;
const ok = (r: RouteResult): Ok => {
  if (!r.ok) throw new Error(`expected a route, got ${r.reason}: ${r.message}`);
  return r;
};
const route = (
  edges: FixtureEdge[],
  vertices: Record<string, [number, number]>,
  from: [number, number],
  to: [number, number],
  opts = {},
) => findRoute(decodeGraph(fixture(vertices, edges)), latlon(...from), latlon(...to), opts);

const S: [number, number] = [0, 0];
const T: [number, number] = [10000, 0];

describe('snapping', () => {
  const g = decodeGraph(fixture({ A: [0, 0], B: [10000, 0] }, [{ a: 'A', b: 'B' }]));

  it('snaps to the nearest point on an edge, not to a vertex', () => {
    const s = snapToGraph(g, latlon(5000, 50))!;
    expect(s.pos).toBeGreaterThan(4990);
    expect(s.pos).toBeLessThan(5010);
    expect(s.dist).toBeGreaterThan(45);
    expect(s.dist).toBeLessThan(55);
  });

  it('snaps beyond the end of an edge to its end vertex', () => {
    const s = snapToGraph(g, latlon(-300, 0))!;
    expect(s.pos).toBe(0);
    expect(s.dist).toBeGreaterThan(290);
  });

  it('gives up when nothing is within reach', () => {
    expect(snapToGraph(g, latlon(0, 300_000))).toBeNull();
  });

  it('snaps to the largest component even when a small fragment is closer', () => {
    const gg = decodeGraph(
      fixture({ A: [0, 0], B: [20000, 0], C: [10000, 800], D: [11500, 800] }, [
        { a: 'A', b: 'B' },
        { a: 'C', b: 'D' },
      ]),
    );
    const s = snapToGraph(gg, latlon(10500, 700))!;
    expect(s.dist).toBeGreaterThan(650);
    expect(s.dist).toBeLessThan(750);
  });
});

describe('route cost', () => {
  const vertices: Record<string, [number, number]> = { S, T, M: [5000, 3000] };

  it('prefers a longer fairway over a shorter untagged canal', () => {
    const r = ok(
      route(
        [
          { a: 'S', b: 'T', kind: 'canal', name: 'Trekvaart' },
          { a: 'S', b: 'M', kind: 'fairway', name: 'Meer' },
          { a: 'M', b: 'T', kind: 'fairway', name: 'Meer' },
        ],
        vertices,
        S,
        T,
      ),
    );
    expect(r.distance).toBeGreaterThan(11000);
    expect(r.distance).toBeLessThan(12000);
  });

  it('takes the shortest way when both alternatives have the same class', () => {
    const r = ok(
      route(
        [
          { a: 'S', b: 'T', kind: 'canal' },
          { a: 'S', b: 'M', kind: 'canal' },
          { a: 'M', b: 'T', kind: 'canal' },
        ],
        vertices,
        S,
        T,
      ),
    );
    expect(r.distance).toBeCloseTo(10000, -1);
  });

  it('weights CEMT classes: IV+ 1.0, II-III 1.15, 0-I 1.5', () => {
    const cost = (cemt: number) =>
      route(
        [
          { a: 'S', b: 'T', kind: 'canal', cemt },
          { a: 'S', b: 'M', kind: 'fairway' },
          { a: 'M', b: 'T', kind: 'fairway' },
        ],
        vertices,
        S,
        T,
      );
    expect(ok(cost(5)).distance).toBeCloseTo(10000, -1);
    expect(ok(cost(4)).distance).toBeCloseTo(10000, -1);
    expect(ok(cost(2)).distance).toBeGreaterThan(11000);
  });

  const detour = (extra: number): Record<string, [number, number]> => ({
    S,
    T,
    M: [5000, Math.sqrt((5000 + extra / 2) ** 2 - 5000 ** 2)],
  });

  it('charges about ten minutes for a lock', () => {
    const edges = (): FixtureEdge[] => [
      { a: 'S', b: 'T', obstacles: [{ pos: 5000, type: 'lock', name: 'Sluis' }] },
      { a: 'S', b: 'M' },
      { a: 'M', b: 'T' },
    ];
    expect(ok(route(edges(), detour(1000), S, T, { speed: 2.5 })).distance).toBeCloseTo(11000, -2);
    expect(ok(route(edges(), detour(3000), S, T, { speed: 2.5 })).distance).toBeCloseTo(10000, -1);
  });

  it('charges about five minutes for a movable bridge', () => {
    const edges: FixtureEdge[] = [
      { a: 'S', b: 'T', obstacles: [{ pos: 5000, type: 'movable', name: 'Brug' }] },
      { a: 'S', b: 'M' },
      { a: 'M', b: 'T' },
    ];
    expect(ok(route(edges, detour(500), S, T, { speed: 2.5 })).distance).toBeCloseTo(10500, -2);
    expect(ok(route(edges, detour(1500), S, T, { speed: 2.5 })).distance).toBeCloseTo(10000, -1);
  });

  it('respects one-way edges', () => {
    const edges: FixtureEdge[] = [
      { a: 'S', b: 'T', oneway: 'rev' },
      { a: 'S', b: 'M' },
      { a: 'M', b: 'T' },
    ];
    expect(ok(route(edges, vertices, S, T)).distance).toBeGreaterThan(11000);
    expect(ok(route(edges, vertices, T, S)).distance).toBeCloseTo(10000, -1);
  });

  it('starts and ends on an edge between vertices', () => {
    const r = ok(route([{ a: 'S', b: 'T' }], { S, T }, [2000, 30], [7000, -40]));
    expect(r.distance).toBeCloseTo(5000, -1);
    expect(r.snapStart.dist).toBeCloseTo(30, 0);
    expect(r.snapEnd.dist).toBeCloseTo(40, 0);
  });

  it('routes backwards along an edge on the same edge', () => {
    const r = ok(route([{ a: 'S', b: 'T' }], { S, T }, [7000, 0], [2000, 0]));
    expect(r.distance).toBeCloseTo(5000, -1);
    expect(r.shape[0][0]).toBeGreaterThan(r.shape[r.shape.length - 1][0]);
  });

  it('fails cleanly when the destination cannot be reached', () => {
    const trap = route([{ a: 'S', b: 'T', oneway: 'rev' }], { S, T }, S, T);
    expect(trap).toMatchObject({ ok: false, reason: 'unreachable' });
    const far = route([{ a: 'S', b: 'T' }], { S, T }, S, [0, 400_000]);
    expect(far).toMatchObject({ ok: false, reason: 'no-snap' });
  });
});

describe('vessel profile', () => {
  const vertices: Record<string, [number, number]> = { S, T, M: [5000, 3000] };
  const bridge = (clearance: number): FixtureEdge[] => [
    { a: 'S', b: 'T', obstacles: [{ pos: 5000, type: 'fixed', name: 'Lage brug', clearance }] },
    { a: 'S', b: 'M' },
    { a: 'M', b: 'T' },
  ];

  it('avoids fixed bridges lower than the air draft', () => {
    expect(ok(route(bridge(300), vertices, S, T, { profile: { airDraft: 4 } })).distance).toBeGreaterThan(11000);
    expect(ok(route(bridge(300), vertices, S, T, { profile: { airDraft: 2.5 } })).distance).toBeCloseTo(10000, -1);
    expect(ok(route(bridge(300), vertices, S, T, {})).distance).toBeCloseTo(10000, -1);
  });

  it('reports blocked when the only way is too low', () => {
    const r = route([{ a: 'S', b: 'T', obstacles: [{ pos: 1, type: 'fixed', clearance: 300 }] }], { S, T }, S, T, {
      profile: { airDraft: 4 },
    });
    expect(r).toMatchObject({ ok: false, reason: 'blocked' });
  });

  it('warns about fixed bridges with unknown clearance but does not block', () => {
    const r = ok(route(bridge(0), vertices, S, T, { profile: { airDraft: 4 } }));
    expect(r.distance).toBeCloseTo(10000, -1);
    expect(r.warnings).toEqual(['1 fixed bridge with unknown clearance']);
    expect(ok(route(bridge(0), vertices, S, T, {})).warnings).toEqual([]);
  });

  it('does not block movable bridges that open', () => {
    const edges: FixtureEdge[] = [
      { a: 'S', b: 'T', obstacles: [{ pos: 5000, type: 'movable', clearance: 300 }] },
      { a: 'S', b: 'M' },
      { a: 'M', b: 'T' },
    ];
    expect(ok(route(edges, vertices, S, T, { profile: { airDraft: 6 } })).distance).toBeCloseTo(10000, -1);
  });

  it('avoids edges with a maxheight below the air draft', () => {
    const edges: FixtureEdge[] = [
      { a: 'S', b: 'T', maxHeight: 350 },
      { a: 'S', b: 'M' },
      { a: 'M', b: 'T' },
    ];
    expect(ok(route(edges, vertices, S, T, { profile: { airDraft: 4 } })).distance).toBeGreaterThan(11000);
  });

  it('avoids edges with a maxdraught below the draught', () => {
    const edges: FixtureEdge[] = [
      { a: 'S', b: 'T', maxDraught: 100 },
      { a: 'S', b: 'M' },
      { a: 'M', b: 'T' },
    ];
    expect(ok(route(edges, vertices, S, T, { profile: { draft: 1.5 } })).distance).toBeGreaterThan(11000);
    expect(ok(route(edges, vertices, S, T, { profile: { draft: 0.8 } })).distance).toBeCloseTo(10000, -1);
  });

  it('avoids edges narrower than the beam', () => {
    const edges: FixtureEdge[] = [
      { a: 'S', b: 'T', maxWidth: 400 },
      { a: 'S', b: 'M' },
      { a: 'M', b: 'T' },
    ];
    expect(ok(route(edges, vertices, S, T, { profile: { beam: 5 } })).distance).toBeGreaterThan(11000);
  });
});

describe('maneuvers', () => {
  const cross: Record<string, [number, number]> = {
    S,
    J: [2000, 0],
    A: [2000, 2000],
    B: [4000, 0],
    C: [2000, -2000],
    E: [3500, -1500],
  };
  const edges: FixtureEdge[] = [
    { a: 'S', b: 'J', name: 'Noordzeekanaal' },
    { a: 'J', b: 'B', name: 'Noordzeekanaal' },
    { a: 'J', b: 'A', name: 'Zaan' },
    { a: 'J', b: 'C', name: 'Vecht' },
    { a: 'J', b: 'E', name: 'Nauwe Vaart' },
  ];
  const texts = (to: [number, number], destName?: string) =>
    ok(route(edges, cross, S, to, { destName })).maneuvers.map((m) => m.text);

  it('starts with depart and ends with arrive', () => {
    const m = ok(route(edges, cross, S, cross.B, { destName: 'Beverwijk' })).maneuvers;
    expect(m[0]).toMatchObject({ type: 'depart' });
    expect(m[m.length - 1]).toMatchObject({ type: 'arrive', text: 'Arrive at Beverwijk' });
    expect(m[m.length - 1].dist).toBeCloseTo(4000, -1);
  });

  it('reports turns at junctions with the new waterway name', () => {
    expect(texts(cross.A)).toEqual(['Depart on Noordzeekanaal', 'Turn left into Zaan', 'Arrive']);
    expect(texts(cross.C)).toEqual(['Depart on Noordzeekanaal', 'Turn right into Vecht', 'Arrive']);
    expect(texts(cross.E)).toEqual(['Depart on Noordzeekanaal', 'Slight right into Nauwe Vaart', 'Arrive']);
  });

  it('stays silent when continuing straight on the same waterway', () => {
    expect(texts(cross.B)).toEqual(['Depart on Noordzeekanaal', 'Arrive']);
  });

  it('announces a name change without a turn', () => {
    const r = ok(
      route(
        [
          { a: 'S', b: 'J', name: 'Noordzeekanaal' },
          { a: 'J', b: 'B', name: 'Amsterdam-Rijnkanaal' },
        ],
        cross,
        S,
        cross.B,
      ),
    );
    expect(r.maneuvers.map((m) => m.text)).toEqual([
      'Depart on Noordzeekanaal',
      'Continue on Amsterdam-Rijnkanaal',
      'Arrive',
    ]);
    expect(r.maneuvers[1].dist).toBeCloseTo(2000, -1);
  });

  it('lists locks and bridges in order with their distance from the start', () => {
    const r = ok(
      route(
        [
          {
            a: 'S',
            b: 'T',
            name: 'Kanaal',
            obstacles: [
              { pos: 2000, type: 'lock', name: 'Oranjesluizen' },
              { pos: 4000, type: 'movable', name: 'Schellingwouderbrug' },
              { pos: 6000, type: 'fixed', name: 'Brug X', clearance: 520 },
              { pos: 8000, type: 'fixed' },
            ],
          },
        ],
        { S, T },
        [1000, 0],
        T,
      ),
    );
    expect(r.maneuvers.map((m) => m.text)).toEqual([
      'Depart on Kanaal',
      'Pass Oranjesluizen (lock)',
      'Opening bridge: Schellingwouderbrug',
      'Fixed bridge Brug X, clearance 5.2 m',
      'Fixed bridge, clearance unknown',
      'Arrive',
    ]);
    expect(r.maneuvers.map((m) => m.type)).toEqual([
      'depart',
      'lock',
      'bridge-open',
      'bridge-fixed',
      'bridge-fixed',
      'arrive',
    ]);
    expect(r.maneuvers[1].dist).toBeCloseTo(1000, -1);
    expect(r.maneuvers[4].dist).toBeCloseTo(7000, -1);
  });

  it('reports a lock once when it is mapped on consecutive edges', () => {
    const r = ok(
      route(
        [
          { a: 'S', b: 'J', obstacles: [{ pos: 1990, type: 'lock', name: 'Sluis' }] },
          { a: 'J', b: 'T', obstacles: [{ pos: 5, type: 'lock', name: 'Sluis' }] },
        ],
        { S, J: [2000, 0], T },
        S,
        T,
      ),
    );
    expect(r.maneuvers.filter((m) => m.type === 'lock')).toHaveLength(1);
  });

  it('skips obstacles behind the start point', () => {
    const r = ok(route([{ a: 'S', b: 'T', obstacles: [{ pos: 2000, type: 'lock' }] }], { S, T }, [5000, 0], T));
    expect(r.maneuvers.map((m) => m.type)).toEqual(['depart', 'arrive']);
  });

  it('follows the polyline of an edge', () => {
    const r = ok(route([{ a: 'S', b: 'T', via: [[5000, 2000]] }], { S, T }, S, T));
    expect(r.shape).toHaveLength(3);
    expect(r.distance).toBeGreaterThan(10500);
  });

  it('computes an ETA from the distance and speed', () => {
    const r = ok(route([{ a: 'S', b: 'T' }], { S, T }, S, T, { speed: 2.5 }));
    expect(r.duration).toBeCloseTo(4000, -1);
  });
});

describe('via stops', () => {
  const vertices: Record<string, [number, number]> = { S, J: [5000, 0], T };
  const edges: FixtureEdge[] = [
    { a: 'S', b: 'J', name: 'Eerste Vaart' },
    { a: 'J', b: 'T', name: 'Tweede Vaart', obstacles: [{ pos: 2000, type: 'fixed' }] },
  ];
  const g = decodeGraph(fixture(vertices, edges));

  it('chains legs into one route with a via maneuver at the stop', () => {
    const r = ok(findRouteVia(g, [latlon(...S), latlon(5000, 100), latlon(...T)], { destName: 'Einde', profile: { airDraft: 4 } }));
    expect(r.distance).toBeCloseTo(10000, -1);
    expect(r.maneuvers.map((m) => m.type)).toEqual(['depart', 'via', 'continue', 'bridge-fixed', 'arrive']);
    expect(r.maneuvers[1].dist).toBeCloseTo(5000, -1);
    expect(r.maneuvers[3].dist).toBeCloseTo(7000, -1);
    expect(r.maneuvers[4].text).toBe('Arrive at Einde');
    expect(r.warnings).toEqual(['1 fixed bridge with unknown clearance']);
  });

  it('reports the failing leg', () => {
    expect(findRouteVia(g, [latlon(...S), latlon(0, 400_000), latlon(...T)])).toMatchObject({ ok: false, reason: 'no-snap' });
  });
});
