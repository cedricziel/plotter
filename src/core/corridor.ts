import { distance } from './geo';
import { edgesNear, type Graph } from './routing';
import type { EdgeTuple, ObstacleTuple, WaterwayFile } from './waterway-data';
import { FORMAT_VERSION } from './waterway-data';

const M_PER_DEG = 111_195;
const EQUATOR_M = 40_075_016.686;
const KEY = 65536;

export class CorridorTooLarge extends Error {
  constructor(public readonly cap: number) {
    super(`corridor needs more than ${cap} tiles`);
  }
}

export function tileSizeMeters(z: number, lat: number): number {
  return (EQUATOR_M * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}

export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const latR = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.asinh(Math.tan(latR)) / Math.PI) / 2) * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

export interface CorridorOptions {
  /** metres either side of the polyline */
  buffer: number;
  minZoom: number;
  maxZoom: number;
  /** most tiles to return before giving up */
  cap: number;
}

/** Points along a [lon, lat] polyline at most `step` metres apart, vertices included. */
function sample(shape: [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < shape.length; i++) {
    out.push(shape[i]);
    if (i + 1 >= shape.length) break;
    const [lon1, lat1] = shape[i];
    const [lon2, lat2] = shape[i + 1];
    const d = distance({ lat: lat1, lon: lon1 }, { lat: lat2, lon: lon2 });
    const n = Math.floor(d / step);
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      out.push([lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t]);
    }
  }
  return out;
}

/** Web-mercator tiles [z, x, y] covering the buffered polyline for every zoom in range. */
export function corridorTiles(shape: [number, number][], opts: CorridorOptions): [number, number, number][] {
  const seen = new Set<number>();
  const tiles: [number, number, number][] = [];
  const maxLat = Math.max(...shape.map((p) => Math.abs(p[1])));
  for (let z = opts.minZoom; z <= opts.maxZoom; z++) {
    const step = Math.max(50, tileSizeMeters(z, maxLat) / 2);
    const reach = opts.buffer + step / 2;
    for (const [lon, lat] of sample(shape, step)) {
      const dLat = reach / M_PER_DEG;
      const dLon = reach / (M_PER_DEG * Math.cos((lat * Math.PI) / 180));
      const a = lonLatToTile(lon - dLon, lat + dLat, z);
      const b = lonLatToTile(lon + dLon, lat - dLat, z);
      for (let x = a.x; x <= b.x; x++) {
        for (let y = a.y; y <= b.y; y++) {
          const key = (z * KEY + x) * KEY + y;
          if (seen.has(key)) continue;
          if (seen.size >= opts.cap) throw new CorridorTooLarge(opts.cap);
          seen.add(key);
          tiles.push([z, x, y]);
        }
      }
    }
  }
  return tiles.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
}

/** The part of the routing graph within `buffer` metres of the polyline, in the same wire format. */
export function subgraph(
  g: Graph,
  shape: [number, number][],
  buffer: number,
  meta: { built: string; source: string },
): WaterwayFile {
  const step = 200;
  const edges = new Set<number>();
  for (const [lon, lat] of sample(shape, step)) {
    for (const e of edgesNear(g, { lat, lon }, buffer + step / 2)) edges.add(e);
  }

  const vertexIdx = new Map<number, number>();
  const vertices: number[] = [];
  const vertex = (v: number) => {
    let i = vertexIdx.get(v);
    if (i === undefined) {
      i = vertexIdx.size;
      vertexIdx.set(v, i);
      vertices.push(Math.round(g.vlat[v] * 1e6), Math.round(g.vlon[v] * 1e6));
    }
    return i;
  };
  const names = [''];
  const nameIdx = new Map<number, number>([[0, 0]]);
  const name = (n: number) => {
    let i = nameIdx.get(n);
    if (i === undefined) {
      i = names.push(g.names[n]) - 1;
      nameIdx.set(n, i);
    }
    return i;
  };

  const out: EdgeTuple[] = [];
  for (const e of [...edges].sort((a, b) => a - b)) {
    const start = g.pstart[e];
    const end = g.pstart[e + 1];
    let pLat = Math.round(g.plat[start] * 1e6);
    let pLon = Math.round(g.plon[start] * 1e6);
    const poly: number[] = [];
    for (let k = start + 1; k < end - 1; k++) {
      const la = Math.round(g.plat[k] * 1e6);
      const lo = Math.round(g.plon[k] * 1e6);
      poly.push(la - pLat, lo - pLon);
      pLat = la;
      pLon = lo;
    }
    const obstacles: ObstacleTuple[] = g.obstacles[e].map((o) => [o[0], o[1], o[2], o[3] ? name(o[3]) : 0, o[4]]);
    out.push([
      vertex(g.ea[e]),
      vertex(g.eb[e]),
      Math.round(g.elen[e]),
      g.ename[e] ? name(g.ename[e]) : 0,
      g.ekind[e],
      g.ecemt[e],
      g.eflags[e],
      g.eDraught[e],
      g.eWidth[e],
      g.eHeight[e],
      poly,
      obstacles,
    ]);
  }
  return { version: FORMAT_VERSION, built: meta.built, source: meta.source, names, vertices, edges: out };
}

/** Points (places, seamarks) within `buffer` metres of the polyline. */
export function pointsInCorridor<T extends { lat: number; lon: number }>(
  places: T[],
  shape: [number, number][],
  buffer: number,
): T[] {
  if (shape.length === 0) return [];
  const lats = shape.map((p) => p[1]);
  const lons = shape.map((p) => p[0]);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const dLat = buffer / M_PER_DEG;
  const dLon = buffer / (M_PER_DEG * Math.cos((midLat * Math.PI) / 180));
  const minLat = Math.min(...lats) - dLat;
  const maxLat = Math.max(...lats) + dLat;
  const minLon = Math.min(...lons) - dLon;
  const maxLon = Math.max(...lons) + dLon;
  return places.filter((p) => {
    if (p.lat < minLat || p.lat > maxLat || p.lon < minLon || p.lon > maxLon) return false;
    return distanceToPolyline(p, shape) <= buffer;
  });
}

function distanceToPolyline(p: { lat: number; lon: number }, shape: [number, number][]): number {
  const kx = Math.cos((p.lat * Math.PI) / 180) * M_PER_DEG;
  let best = Infinity;
  for (let i = 0; i < shape.length; i++) {
    const [x1, y1] = shape[i];
    const [x2, y2] = shape[Math.min(i + 1, shape.length - 1)];
    const sx = (x2 - x1) * kx;
    const sy = (y2 - y1) * M_PER_DEG;
    const px = (p.lon - x1) * kx;
    const py = (p.lat - y1) * M_PER_DEG;
    const len2 = sx * sx + sy * sy;
    const t = len2 > 0 ? Math.min(1, Math.max(0, (px * sx + py * sy) / len2)) : 0;
    best = Math.min(best, Math.hypot(px - t * sx, py - t * sy));
  }
  return best;
}
