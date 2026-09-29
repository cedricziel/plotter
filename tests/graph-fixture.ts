import { EARTH_RADIUS_M } from '../src/core/geo';
import {
  FLAG,
  FORMAT_VERSION,
  KIND,
  OBSTACLE,
  type EdgeTuple,
  type ObstacleTuple,
  type WaterwayFile,
} from '../src/core/waterway-data';

const LAT0 = 52;
const LON0 = 5;
const M_PER_DEG = (Math.PI / 180) * EARTH_RADIUS_M;

/** Metres east/north of the fixture origin to 1e-6° integers. */
export const at = (x: number, y: number): [number, number] => [
  Math.round((LAT0 + y / M_PER_DEG) * 1e6),
  Math.round((LON0 + x / (M_PER_DEG * Math.cos((LAT0 * Math.PI) / 180))) * 1e6),
];

export const latlon = (x: number, y: number) => {
  const [lat, lon] = at(x, y);
  return { lat: lat / 1e6, lon: lon / 1e6 };
};

export interface FixtureObstacle {
  /** metres from the edge's first vertex */
  pos: number;
  type: 'lock' | 'fixed' | 'movable';
  name?: string;
  /** cm */
  clearance?: number;
}

export interface FixtureEdge {
  a: string;
  b: string;
  via?: [number, number][];
  name?: string;
  kind?: keyof typeof KIND;
  cemt?: number;
  oneway?: 'fwd' | 'rev';
  maxDraught?: number;
  maxWidth?: number;
  maxHeight?: number;
  obstacles?: FixtureObstacle[];
}

/** Builds a WaterwayFile from vertices in metres and edges between them. */
export function fixture(vertices: Record<string, [number, number]>, edges: FixtureEdge[]): WaterwayFile {
  const ids = Object.keys(vertices);
  const names = [''];
  const nameIdx = (n?: string) => {
    if (!n) return 0;
    let i = names.indexOf(n);
    if (i < 0) i = names.push(n) - 1;
    return i;
  };
  const flat: number[] = [];
  for (const id of ids) flat.push(...at(...vertices[id]));
  const dist = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const out: EdgeTuple[] = edges.map((e) => {
    const a = vertices[e.a];
    const b = vertices[e.b];
    const pts = [a, ...(e.via ?? []), b];
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += dist(pts[i - 1], pts[i]);
    const poly: number[] = [];
    let prev = at(...a);
    for (const p of e.via ?? []) {
      const q = at(...p);
      poly.push(q[0] - prev[0], q[1] - prev[1]);
      prev = q;
    }
    const obstacles: ObstacleTuple[] = (e.obstacles ?? []).map((o) => [
      o.pos,
      o.type === 'lock' ? OBSTACLE.lock : o.type === 'fixed' ? OBSTACLE.bridgeFixed : OBSTACLE.bridgeMovable,
      o.clearance ?? 0,
      nameIdx(o.name),
      0,
    ]);
    return [
      ids.indexOf(e.a),
      ids.indexOf(e.b),
      Math.round(length),
      nameIdx(e.name),
      KIND[e.kind ?? 'fairway'],
      e.cemt ?? 0,
      e.oneway === 'fwd' ? FLAG.ONEWAY_FWD : e.oneway === 'rev' ? FLAG.ONEWAY_REV : 0,
      e.maxDraught ?? 0,
      e.maxWidth ?? 0,
      e.maxHeight ?? 0,
      poly,
      obstacles,
    ];
  });
  return { version: FORMAT_VERSION, built: 'test', source: 'test', names, vertices: flat, edges: out };
}
