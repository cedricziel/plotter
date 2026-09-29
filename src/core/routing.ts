import { angleDiff, bearing, distance } from './geo';
import {
  FLAG,
  KIND,
  OBSTACLE,
  type ObstacleTuple,
  type Place,
  type PlaceKind,
  type WaterwayFile,
} from './waterway-data';

export interface VesselProfile {
  /** metres above the waterline; blocks fixed bridges and edges lower than this */
  airDraft?: number | null;
  /** metres below the waterline */
  draft?: number | null;
  /** metres */
  beam?: number | null;
}

export interface RouteOptions {
  profile?: VesselProfile;
  /** cruise speed in m/s, used to turn lock and bridge delays into distance and for the duration */
  speed?: number;
  destName?: string;
  /** furthest a start or destination may be from a waterway, metres */
  maxSnap?: number;
}

export type ManeuverType =
  | 'depart'
  | 'turn-left'
  | 'turn-right'
  | 'slight-left'
  | 'slight-right'
  | 'sharp-left'
  | 'sharp-right'
  | 'continue'
  | 'via'
  | 'lock'
  | 'bridge-open'
  | 'bridge-fixed'
  | 'arrive';

export interface Maneuver {
  type: ManeuverType;
  lat: number;
  lon: number;
  /** metres from the start of the route */
  dist: number;
  /** English text, kept for older clients; the app builds its own from the fields below. */
  text: string;
  /** Waterway, lock, bridge or destination name; always set by the router, null when unnamed. */
  name?: string | null;
  /** number of the intermediate stop, on via maneuvers */
  stop?: number;
  /** cm for bridges, when known */
  clearance?: number | null;
}

export interface Snap {
  edge: number;
  /** metres from the edge's first vertex */
  pos: number;
  lat: number;
  lon: number;
  /** distance from the requested point, metres */
  dist: number;
}

export type RouteResult =
  | {
      ok: true;
      /** [lon, lat] */
      shape: [number, number][];
      distance: number;
      duration: number;
      maneuvers: Maneuver[];
      warnings: string[];
      snapStart: Snap;
      snapEnd: Snap;
      /** graph edges traversed, in order */
      edges: number[];
    }
  | {
      ok: false;
      reason: 'no-snap' | 'unreachable' | 'blocked';
      message: string;
    };

export const DEFAULT_SPEED = 2.5;
const LOCK_SECONDS = 600;
const MOVABLE_BRIDGE_SECONDS = 300;
const DEFAULT_MAX_SNAP = 5000;
const TURN_THRESHOLD = 30;
const BEARING_SAMPLE_M = 40;
const LOCK_MERGE_M = 300;

export interface Graph {
  names: string[];
  vlat: Float64Array;
  vlon: Float64Array;
  edgeCount: number;
  ea: Int32Array;
  eb: Int32Array;
  elen: Float64Array;
  ename: Int32Array;
  ekind: Uint8Array;
  ecemt: Uint8Array;
  eflags: Uint8Array;
  eDraught: Int32Array;
  eWidth: Int32Array;
  eHeight: Int32Array;
  /** class-weighted length of the edge without obstacle penalties */
  ebase: Float64Array;
  eLocks: Uint8Array;
  eMovable: Uint8Array;
  /** offsets into plat/plon/pcum: edge e owns points [pstart[e], pstart[e + 1]) */
  pstart: Int32Array;
  plat: Float64Array;
  plon: Float64Array;
  pcum: Float64Array;
  obstacles: ObstacleTuple[][];
  adjStart: Int32Array;
  adjEdge: Int32Array;
  component: Int32Array;
  mainComponent: number;
  grid: Map<number, number[]>;
}

/** Cost multiplier of an edge by waterway class: fairways and big rivers are preferred over small canals. */
export function classFactor(kind: number, cemt: number): number {
  if (cemt >= 5) return 1;
  if (cemt >= 3) return 1.15;
  if (cemt >= 1) return 1.5;
  return kind === KIND.canal ? 1.5 : 1;
}

const CELL_LAT = 0.004;
const CELL_LON = 0.006;
const cellKey = (cy: number, cx: number) => (cy + 30000) * 100000 + (cx + 40000);

export function decodeGraph(file: WaterwayFile): Graph {
  const nV = file.vertices.length / 2;
  const nE = file.edges.length;
  const vlat = new Float64Array(nV);
  const vlon = new Float64Array(nV);
  for (let i = 0; i < nV; i++) {
    vlat[i] = file.vertices[2 * i] / 1e6;
    vlon[i] = file.vertices[2 * i + 1] / 1e6;
  }
  let nPts = 0;
  for (const e of file.edges) nPts += 2 + e[10].length / 2;
  const g: Graph = {
    names: file.names,
    vlat,
    vlon,
    edgeCount: nE,
    ea: new Int32Array(nE),
    eb: new Int32Array(nE),
    elen: new Float64Array(nE),
    ename: new Int32Array(nE),
    ekind: new Uint8Array(nE),
    ecemt: new Uint8Array(nE),
    eflags: new Uint8Array(nE),
    eDraught: new Int32Array(nE),
    eWidth: new Int32Array(nE),
    eHeight: new Int32Array(nE),
    ebase: new Float64Array(nE),
    eLocks: new Uint8Array(nE),
    eMovable: new Uint8Array(nE),
    pstart: new Int32Array(nE + 1),
    plat: new Float64Array(nPts),
    plon: new Float64Array(nPts),
    pcum: new Float64Array(nPts),
    obstacles: new Array(nE),
    adjStart: new Int32Array(nV + 1),
    adjEdge: new Int32Array(2 * nE),
    component: new Int32Array(nV),
    mainComponent: 0,
    grid: new Map(),
  };

  let p = 0;
  const degree = new Int32Array(nV);
  file.edges.forEach((e, i) => {
    const [a, b, , name, kind, cemt, flags, maxDraught, maxWidth, maxHeight, poly, obstacles] = e;
    g.ea[i] = a;
    g.eb[i] = b;
    g.ename[i] = name;
    g.ekind[i] = kind;
    g.ecemt[i] = cemt;
    g.eflags[i] = flags;
    g.eDraught[i] = maxDraught;
    g.eWidth[i] = maxWidth;
    g.eHeight[i] = maxHeight;
    g.obstacles[i] = obstacles;
    g.pstart[i] = p;
    let lat = file.vertices[2 * a];
    let lon = file.vertices[2 * a + 1];
    const put = (la: number, lo: number) => {
      g.plat[p] = la / 1e6;
      g.plon[p] = lo / 1e6;
      g.pcum[p] =
        p === g.pstart[i]
          ? 0
          : g.pcum[p - 1] + distance({ lat: g.plat[p - 1], lon: g.plon[p - 1] }, { lat: la / 1e6, lon: lo / 1e6 });
      p++;
    };
    put(lat, lon);
    for (let k = 0; k < poly.length; k += 2) {
      lat += poly[k];
      lon += poly[k + 1];
      put(lat, lon);
    }
    put(file.vertices[2 * b], file.vertices[2 * b + 1]);
    g.elen[i] = g.pcum[p - 1];
    g.ebase[i] = g.elen[i] * classFactor(kind, cemt);
    for (const o of obstacles) {
      if (o[1] === OBSTACLE.lock) g.eLocks[i]++;
      else if (o[1] === OBSTACLE.bridgeMovable) g.eMovable[i]++;
    }
    degree[a]++;
    degree[b]++;
  });
  g.pstart[nE] = p;

  for (let v = 0; v < nV; v++) g.adjStart[v + 1] = g.adjStart[v] + degree[v];
  const fill = g.adjStart.slice(0, nV);
  for (let i = 0; i < nE; i++) {
    g.adjEdge[fill[g.ea[i]]++] = i;
    g.adjEdge[fill[g.eb[i]]++] = i;
  }

  const parent = Int32Array.from({ length: nV }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let i = 0; i < nE; i++) parent[find(g.ea[i])] = find(g.eb[i]);
  const total = new Map<number, number>();
  for (let i = 0; i < nE; i++) {
    const r = find(g.ea[i]);
    total.set(r, (total.get(r) ?? 0) + g.elen[i]);
  }
  let best = -1;
  for (const [r, len] of total) if (best < 0 || len > total.get(best)!) best = r;
  for (let v = 0; v < nV; v++) g.component[v] = find(v);
  g.mainComponent = best;

  for (let i = 0; i < nE; i++) {
    for (let k = g.pstart[i]; k < g.pstart[i + 1] - 1; k++) {
      const cy1 = Math.floor(Math.min(g.plat[k], g.plat[k + 1]) / CELL_LAT);
      const cy2 = Math.floor(Math.max(g.plat[k], g.plat[k + 1]) / CELL_LAT);
      const cx1 = Math.floor(Math.min(g.plon[k], g.plon[k + 1]) / CELL_LON);
      const cx2 = Math.floor(Math.max(g.plon[k], g.plon[k + 1]) / CELL_LON);
      for (let cy = cy1; cy <= cy2; cy++) {
        for (let cx = cx1; cx <= cx2; cx++) {
          const key = cellKey(cy, cx);
          const list = g.grid.get(key);
          if (list) list.push(k);
          else g.grid.set(key, [k]);
        }
      }
    }
  }
  return g;
}

/** Edge owning global point index `k`. */
function edgeOfPoint(g: Graph, k: number): number {
  let lo = 0;
  let hi = g.edgeCount - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (g.pstart[mid] <= k) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Edges with a segment within `radius` metres of the point. */
export function edgesNear(g: Graph, pt: { lat: number; lon: number }, radius: number): Set<number> {
  const kx = Math.cos((pt.lat * Math.PI) / 180) * 111_195;
  const ky = 111_195;
  const out = new Set<number>();
  const cy1 = Math.floor((pt.lat - radius / ky) / CELL_LAT);
  const cy2 = Math.floor((pt.lat + radius / ky) / CELL_LAT);
  const cx1 = Math.floor((pt.lon - radius / kx) / CELL_LON);
  const cx2 = Math.floor((pt.lon + radius / kx) / CELL_LON);
  for (let cy = cy1; cy <= cy2; cy++) {
    for (let cx = cx1; cx <= cx2; cx++) {
      for (const k of g.grid.get(cellKey(cy, cx)) ?? []) {
        const sx = (g.plon[k + 1] - g.plon[k]) * kx;
        const sy = (g.plat[k + 1] - g.plat[k]) * ky;
        const px = (pt.lon - g.plon[k]) * kx;
        const py = (pt.lat - g.plat[k]) * ky;
        const len2 = sx * sx + sy * sy;
        const t = len2 > 0 ? Math.min(1, Math.max(0, (px * sx + py * sy) / len2)) : 0;
        if (Math.hypot(px - t * sx, py - t * sy) <= radius) out.add(edgeOfPoint(g, k));
      }
    }
  }
  return out;
}

export interface SnapOptions {
  /** restrict to this component; defaults to the largest */
  component?: number;
  maxDist?: number;
  /** skip edges for which this returns false */
  accept?: (edge: number) => boolean;
}

/** Nearest point on an edge of the routable component. */
export function snapToGraph(g: Graph, pt: { lat: number; lon: number }, opts: SnapOptions = {}): Snap | null {
  const comp = opts.component ?? g.mainComponent;
  const maxDist = opts.maxDist ?? DEFAULT_MAX_SNAP;
  const kx = Math.cos((pt.lat * Math.PI) / 180) * 111_195;
  const ky = 111_195;
  const cellM = Math.min(CELL_LAT * ky, CELL_LON * kx);
  const cy0 = Math.floor(pt.lat / CELL_LAT);
  const cx0 = Math.floor(pt.lon / CELL_LON);
  const maxRing = Math.ceil(maxDist / cellM) + 1;
  const seen = new Set<number>();
  let best = null as { k: number; t: number; dist: number } | null;
  const edgeOf = (k: number) => edgeOfPoint(g, k);
  for (let ring = 0; ring <= maxRing; ring++) {
    for (let cy = cy0 - ring; cy <= cy0 + ring; cy++) {
      for (let cx = cx0 - ring; cx <= cx0 + ring; cx++) {
        if (Math.max(Math.abs(cy - cy0), Math.abs(cx - cx0)) !== ring) continue;
        for (const k of g.grid.get(cellKey(cy, cx)) ?? []) {
          if (seen.has(k)) continue;
          seen.add(k);
          const e = edgeOf(k);
          if (g.component[g.ea[e]] !== comp || (opts.accept && !opts.accept(e))) continue;
          const sx = (g.plon[k + 1] - g.plon[k]) * kx;
          const sy = (g.plat[k + 1] - g.plat[k]) * ky;
          const px = (pt.lon - g.plon[k]) * kx;
          const py = (pt.lat - g.plat[k]) * ky;
          const len2 = sx * sx + sy * sy;
          const t = len2 > 0 ? Math.min(1, Math.max(0, (px * sx + py * sy) / len2)) : 0;
          const dist = Math.hypot(px - t * sx, py - t * sy);
          if (!best || dist < best.dist) best = { k, t, dist };
        }
      }
    }
    if (best && best.dist <= ring * cellM) break;
  }
  if (!best || best.dist > maxDist) return null;
  const e = edgeOf(best.k);
  const { k, t } = best;
  return {
    edge: e,
    pos: g.pcum[k] + t * (g.pcum[k + 1] - g.pcum[k]),
    lat: g.plat[k] + t * (g.plat[k + 1] - g.plat[k]),
    lon: g.plon[k] + t * (g.plon[k + 1] - g.plon[k]),
    dist: best.dist,
  };
}

// ---- search -------------------------------------------------------------------

class MinHeap {
  private f: number[] = [];
  private v: number[] = [];
  get size(): number {
    return this.f.length;
  }
  peek(): number {
    return this.f[0];
  }
  push(f: number, v: number): void {
    let i = this.f.length;
    this.f.push(f);
    this.v.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[p] <= f) break;
      this.f[i] = this.f[p];
      this.v[i] = this.v[p];
      i = p;
    }
    this.f[i] = f;
    this.v[i] = v;
  }
  pop(): number {
    const top = this.v[0];
    const f = this.f.pop()!;
    const v = this.v.pop()!;
    const n = this.f.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && this.f[c + 1] < this.f[c]) c++;
        if (this.f[c] >= f) break;
        this.f[i] = this.f[c];
        this.v[i] = this.v[c];
        i = c;
      }
      this.f[i] = f;
      this.v[i] = v;
    }
    return top;
  }
}

interface Traversal {
  edge: number;
  from: number;
  to: number;
}

interface Search {
  path: Traversal[];
  cost: number;
}

function edgeLimitsBlock(g: Graph, e: number, profile: VesselProfile): boolean {
  if (profile.airDraft && g.eHeight[e] > 0 && g.eHeight[e] < profile.airDraft * 100) return true;
  if (profile.draft && g.eDraught[e] > 0 && g.eDraught[e] < profile.draft * 100) return true;
  if (profile.beam && g.eWidth[e] > 0 && g.eWidth[e] < profile.beam * 100) return true;
  return false;
}

function rangeBlocked(g: Graph, e: number, lo: number, hi: number, profile: VesselProfile): boolean {
  if (edgeLimitsBlock(g, e, profile)) return true;
  if (!profile.airDraft) return false;
  for (const o of g.obstacles[e]) {
    if (o[1] === OBSTACLE.bridgeFixed && o[2] > 0 && o[2] < profile.airDraft * 100 && o[0] >= lo && o[0] <= hi)
      return true;
  }
  return false;
}

function rangeCost(g: Graph, e: number, lo: number, hi: number, lockPenalty: number, movablePenalty: number): number {
  const factor = g.elen[e] > 0 ? g.ebase[e] / g.elen[e] : 1;
  let cost = (hi - lo) * factor;
  for (const o of g.obstacles[e]) {
    if (o[0] < lo || o[0] > hi) continue;
    if (o[1] === OBSTACLE.lock) cost += lockPenalty;
    else if (o[1] === OBSTACLE.bridgeMovable) cost += movablePenalty;
  }
  return cost;
}

const forwardOk = (g: Graph, e: number) => (g.eflags[e] & FLAG.ONEWAY_REV) === 0;
const backwardOk = (g: Graph, e: number) => (g.eflags[e] & FLAG.ONEWAY_FWD) === 0;

function search(g: Graph, s: Snap, d: Snap, profile: VesselProfile, speed: number): Search | null {
  const nV = g.vlat.length;
  const lockPenalty = LOCK_SECONDS * speed;
  const movablePenalty = MOVABLE_BRIDGE_SECONDS * speed;
  const gScore = new Float64Array(nV).fill(Infinity);
  const prevVertex = new Int32Array(nV).fill(-2);
  const prevEdge = new Int32Array(nV).fill(-1);
  const closed = new Uint8Array(nV);
  const blockedCache = new Int8Array(g.edgeCount);
  const heap = new MinHeap();
  const target = { lat: d.lat, lon: d.lon };
  const h = (v: number) => distance({ lat: g.vlat[v], lon: g.vlon[v] }, target);

  const fullBlocked = (e: number): boolean => {
    if (blockedCache[e] === 0) blockedCache[e] = rangeBlocked(g, e, 0, g.elen[e], profile) ? 2 : 1;
    return blockedCache[e] === 2;
  };
  const partOk = (e: number, a: number, b: number) => !rangeBlocked(g, e, Math.min(a, b), Math.max(a, b), profile);

  let bestCost = Infinity;
  let bestVia = -2; // -1 = direct along the shared edge, otherwise the vertex before the final partial edge
  if (s.edge === d.edge) {
    const fwd = d.pos >= s.pos;
    if ((fwd ? forwardOk(g, s.edge) : backwardOk(g, s.edge)) && partOk(s.edge, s.pos, d.pos)) {
      bestCost = rangeCost(g, s.edge, Math.min(s.pos, d.pos), Math.max(s.pos, d.pos), lockPenalty, movablePenalty);
      bestVia = -1;
    }
  }

  const seed = (v: number, cost: number) => {
    if (cost < gScore[v]) {
      gScore[v] = cost;
      prevVertex[v] = -1;
      prevEdge[v] = s.edge;
      heap.push(cost + h(v), v);
    }
  };
  if (backwardOk(g, s.edge) && partOk(s.edge, 0, s.pos))
    seed(g.ea[s.edge], rangeCost(g, s.edge, 0, s.pos, lockPenalty, movablePenalty));
  if (forwardOk(g, s.edge) && partOk(s.edge, s.pos, g.elen[s.edge])) {
    seed(g.eb[s.edge], rangeCost(g, s.edge, s.pos, g.elen[s.edge], lockPenalty, movablePenalty));
  }

  const tail = (v: number): number => {
    if (v === g.ea[d.edge] && forwardOk(g, d.edge) && partOk(d.edge, 0, d.pos)) {
      return rangeCost(g, d.edge, 0, d.pos, lockPenalty, movablePenalty);
    }
    if (v === g.eb[d.edge] && backwardOk(g, d.edge) && partOk(d.edge, d.pos, g.elen[d.edge])) {
      return rangeCost(g, d.edge, d.pos, g.elen[d.edge], lockPenalty, movablePenalty);
    }
    return Infinity;
  };

  while (heap.size) {
    if (heap.peek() >= bestCost) break;
    const v = heap.pop();
    if (closed[v]) continue;
    closed[v] = 1;
    const t = tail(v);
    if (gScore[v] + t < bestCost) {
      bestCost = gScore[v] + t;
      bestVia = v;
    }
    for (let i = g.adjStart[v]; i < g.adjStart[v + 1]; i++) {
      const e = g.adjEdge[i];
      const fwd = g.ea[e] === v;
      if (!(fwd ? forwardOk(g, e) : backwardOk(g, e)) || fullBlocked(e)) continue;
      const w = fwd ? g.eb[e] : g.ea[e];
      if (closed[w]) continue;
      const cost = gScore[v] + rangeCost(g, e, 0, g.elen[e], lockPenalty, movablePenalty);
      if (cost < gScore[w]) {
        gScore[w] = cost;
        prevVertex[w] = v;
        prevEdge[w] = e;
        heap.push(cost + h(w), w);
      }
    }
  }
  if (bestVia === -2) return null;

  if (bestVia === -1) return { cost: bestCost, path: [{ edge: s.edge, from: s.pos, to: d.pos }] };
  const path: Traversal[] = [];
  const last = bestVia;
  if (last === g.ea[d.edge] && forwardOk(g, d.edge) && tail(last) < Infinity)
    path.push({ edge: d.edge, from: 0, to: d.pos });
  else path.push({ edge: d.edge, from: g.elen[d.edge], to: d.pos });
  let v = last;
  while (v >= 0) {
    const e = prevEdge[v];
    const from = prevVertex[v];
    if (from === -1) {
      // first hop leaves the start snap point
      path.push(v === g.ea[e] ? { edge: e, from: s.pos, to: 0 } : { edge: e, from: s.pos, to: g.elen[e] });
      break;
    }
    path.push(from === g.ea[e] ? { edge: e, from: 0, to: g.elen[e] } : { edge: e, from: g.elen[e], to: 0 });
    v = from;
  }
  path.reverse();
  return { cost: bestCost, path };
}

// ---- route assembly ---------------------------------------------------------------

function slice(g: Graph, t: Traversal): [number, number][] {
  const start = g.pstart[t.edge];
  const end = g.pstart[t.edge + 1];
  const lo = Math.min(t.from, t.to);
  const hi = Math.max(t.from, t.to);
  const pts: [number, number][] = [];
  const at = (pos: number): [number, number] => {
    let k = start;
    while (k < end - 2 && g.pcum[k + 1] < pos) k++;
    const span = g.pcum[k + 1] - g.pcum[k];
    const f = span > 0 ? Math.min(1, Math.max(0, (pos - g.pcum[k]) / span)) : 0;
    return [g.plon[k] + f * (g.plon[k + 1] - g.plon[k]), g.plat[k] + f * (g.plat[k + 1] - g.plat[k])];
  };
  pts.push(at(lo));
  for (let k = start; k < end; k++) if (g.pcum[k] > lo && g.pcum[k] < hi) pts.push([g.plon[k], g.plat[k]]);
  pts.push(at(hi));
  return t.from <= t.to ? pts : pts.reverse();
}

function pointAtPos(g: Graph, edge: number, pos: number): { lat: number; lon: number } {
  const [lon, lat] = slice(g, { edge, from: pos, to: pos })[0];
  return { lat, lon };
}

const ll = (p: [number, number]) => ({ lat: p[1], lon: p[0] });

function headingEnd(pts: [number, number][]): number | null {
  const end = pts[pts.length - 1];
  for (let i = pts.length - 2; i >= 0; i--) {
    if (distance(ll(pts[i]), ll(end)) >= BEARING_SAMPLE_M || i === 0) {
      return distance(ll(pts[i]), ll(end)) > 0 ? bearing(ll(pts[i]), ll(end)) : null;
    }
  }
  return null;
}

function headingStart(pts: [number, number][]): number | null {
  const start = pts[0];
  for (let i = 1; i < pts.length; i++) {
    if (distance(ll(start), ll(pts[i])) >= BEARING_SAMPLE_M || i === pts.length - 1) {
      return distance(ll(start), ll(pts[i])) > 0 ? bearing(ll(start), ll(pts[i])) : null;
    }
  }
  return null;
}

function turnType(delta: number): ManeuverType {
  const a = Math.abs(delta);
  const side = delta < 0 ? 'left' : 'right';
  if (a < 60) return `slight-${side}`;
  if (a > 135) return `sharp-${side}`;
  return `turn-${side}`;
}

const TURN_TEXT: Partial<Record<ManeuverType, string>> = {
  'turn-left': 'Turn left',
  'turn-right': 'Turn right',
  'slight-left': 'Slight left',
  'slight-right': 'Slight right',
  'sharp-left': 'Sharp left',
  'sharp-right': 'Sharp right',
};

function obstacleManeuver(o: ObstacleTuple, names: string[]): Pick<Maneuver, 'type' | 'text' | 'name' | 'clearance'> {
  const name = names[o[3]] || null;
  if (o[1] === OBSTACLE.lock)
    return {
      type: 'lock',
      text: name ? `Pass ${name} (lock)` : 'Pass lock',
      name,
      clearance: null,
    };
  if (o[1] === OBSTACLE.bridgeMovable)
    return {
      type: 'bridge-open',
      text: `Opening bridge${name ? `: ${name}` : ''}`,
      name,
      clearance: o[2] || null,
    };
  const clearance = o[2] ? `clearance ${(o[2] / 100).toFixed(1)} m` : 'clearance unknown';
  return {
    type: 'bridge-fixed',
    text: `Fixed bridge${name ? ` ${name}` : ''}, ${clearance}`,
    name,
    clearance: o[2] || null,
  };
}

function routeWarnings(maneuvers: Maneuver[], profile?: VesselProfile): string[] {
  if (!profile?.airDraft) return [];
  const unknown = maneuvers.filter((m) => m.type === 'bridge-fixed' && m.clearance == null).length;
  return unknown > 0 ? [`${unknown} fixed bridge${unknown === 1 ? '' : 's'} with unknown clearance`] : [];
}

function assemble(
  g: Graph,
  path: Traversal[],
  s: Snap,
  d: Snap,
  opts: RouteOptions,
  speed: number,
): Extract<RouteResult, { ok: true }> {
  const shape: [number, number][] = [];
  const maneuvers: Maneuver[] = [];
  const pieces = path.map((t) => slice(g, t));
  let base = 0;
  const firstName = g.names[g.ename[path[0].edge]];
  maneuvers.push({
    type: 'depart',
    ...ll(pieces[0][0]),
    dist: 0,
    text: firstName ? `Depart on ${firstName}` : 'Depart',
    name: firstName || null,
  });

  path.forEach((t, i) => {
    const len = Math.abs(t.to - t.from);
    const forward = t.to >= t.from;
    const lo = Math.min(t.from, t.to);
    const hi = Math.max(t.from, t.to);
    const inRange = g.obstacles[t.edge].filter((o) => o[0] >= lo && o[0] <= hi);
    if (!forward) inRange.reverse();
    for (const o of inRange) {
      const m = obstacleManeuver(o, g.names);
      maneuvers.push({
        ...m,
        ...pointAtPos(g, t.edge, o[0]),
        dist: base + Math.abs(o[0] - t.from),
      });
    }
    for (const p of pieces[i]) {
      const last = shape[shape.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) shape.push(p);
    }
    base += len;

    const next = path[i + 1];
    if (!next) return;
    const junction = pieces[i][pieces[i].length - 1];
    const vertex = t.to === 0 ? g.ea[t.edge] : g.eb[t.edge];
    const degree = g.adjStart[vertex + 1] - g.adjStart[vertex];
    const prevName = g.names[g.ename[t.edge]];
    const nextName = g.names[g.ename[next.edge]];
    const hIn = headingEnd(pieces[i]);
    const hOut = headingStart(pieces[i + 1]);
    const delta = hIn != null && hOut != null ? angleDiff(hIn, hOut) : 0;
    if (degree >= 3 && Math.abs(delta) > TURN_THRESHOLD) {
      const type = turnType(delta);
      maneuvers.push({
        type,
        ...ll(junction),
        dist: base,
        text: `${TURN_TEXT[type]}${nextName ? ` into ${nextName}` : ''}`,
        name: nextName || null,
      });
    } else if (nextName && nextName !== prevName) {
      maneuvers.push({
        type: 'continue',
        ...ll(junction),
        dist: base,
        text: `Continue on ${nextName}`,
        name: nextName,
      });
    }
  });

  const end = shape[shape.length - 1];
  maneuvers.push({
    type: 'arrive',
    ...ll(end),
    dist: base,
    text: opts.destName ? `Arrive at ${opts.destName}` : 'Arrive',
    name: opts.destName || null,
  });
  const middle = maneuvers
    .slice(1, -1)
    .sort((a, b) => a.dist - b.dist)
    .filter((m, i, all) => {
      if (m.type !== 'lock') return true;
      const prev = all
        .slice(0, i)
        .reverse()
        .find((o) => o.type === 'lock');
      const sameLock = prev && (prev.text === m.text || !prev.text.includes('(lock)') || !m.text.includes('(lock)'));
      return !(sameLock && m.dist - prev.dist <= LOCK_MERGE_M);
    });
  return {
    ok: true,
    shape,
    distance: base,
    duration: base / speed,
    maneuvers: [maneuvers[0], ...middle, maneuvers[maneuvers.length - 1]],
    warnings: routeWarnings(middle, opts.profile),
    snapStart: s,
    snapEnd: d,
    edges: path.map((t) => t.edge),
  };
}

const POCKET_ESCAPE_M = 1000;
const POCKET_ESCAPES = 4;
const POCKET_MAX_EDGES = 5000;

/** Edges a vessel can reach from a snap point, ignoring one-way rules. */
function pocket(g: Graph, sn: Snap, profile: VesselProfile): Set<number> {
  const edges = new Set<number>([sn.edge]);
  const seen = new Set<number>();
  const stack: number[] = [];
  if (!rangeBlocked(g, sn.edge, 0, sn.pos, profile)) stack.push(g.ea[sn.edge]);
  if (!rangeBlocked(g, sn.edge, sn.pos, g.elen[sn.edge], profile)) stack.push(g.eb[sn.edge]);
  while (stack.length && edges.size < POCKET_MAX_EDGES) {
    const v = stack.pop()!;
    if (seen.has(v)) continue;
    seen.add(v);
    for (let i = g.adjStart[v]; i < g.adjStart[v + 1]; i++) {
      const e = g.adjEdge[i];
      if (edges.has(e) || rangeBlocked(g, e, 0, g.elen[e], profile)) continue;
      edges.add(e);
      stack.push(g.ea[e] === v ? g.eb[e] : g.ea[e]);
    }
  }
  return edges;
}

export function findRoute(
  g: Graph,
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  opts: RouteOptions = {},
): RouteResult {
  const maxDist = opts.maxSnap ?? DEFAULT_MAX_SNAP;
  const speed = opts.speed && opts.speed > 0 ? opts.speed : DEFAULT_SPEED;
  const profile = opts.profile ?? {};
  const accept = (e: number) => !edgeLimitsBlock(g, e, profile);
  const s = snapToGraph(g, from, { maxDist, accept });
  if (!s)
    return {
      ok: false,
      reason: 'no-snap',
      message: `No charted waterway within ${Math.round(maxDist / 1000)} km of the start`,
    };
  const d = snapToGraph(g, to, { maxDist, accept });
  if (!d)
    return {
      ok: false,
      reason: 'no-snap',
      message: `No charted waterway within ${Math.round(maxDist / 1000)} km of the destination`,
    };
  const found = search(g, s, d, profile, speed);
  if (found) return assemble(g, found.path, s, d, opts, speed);
  const constrained = !!(profile.airDraft || profile.draft || profile.beam);
  if (constrained) {
    // The nearest waterway can be a canal the vessel cannot leave; try the nearest one outside it.
    const escapes = (pt: { lat: number; lon: number }, sn: Snap): Snap[] => {
      const out = [sn];
      const trapped = new Set<number>();
      const limit = Math.min(maxDist, sn.dist + POCKET_ESCAPE_M);
      for (let i = 0; i < POCKET_ESCAPES; i++) {
        for (const e of pocket(g, out[out.length - 1], profile)) trapped.add(e);
        const next = snapToGraph(g, pt, { maxDist: limit, accept: (e) => accept(e) && !trapped.has(e) });
        if (!next) break;
        out.push(next);
      }
      return out;
    };
    const starts = escapes(from, s);
    const ends = escapes(to, d);
    for (const a of starts) {
      for (const b of ends) {
        if (a === s && b === d) continue;
        const alt = search(g, a, b, profile, speed);
        if (alt) return assemble(g, alt.path, a, b, opts, speed);
      }
    }
  }
  if (constrained && search(g, s, d, {}, speed)) {
    return {
      ok: false,
      reason: 'blocked',
      message: 'No route fits the vessel dimensions: a low bridge or a depth or width limit is in the way',
    };
  }
  return {
    ok: false,
    reason: 'unreachable',
    message: 'No navigable connection to the destination in the routing data',
  };
}

/** Route through intermediate stops; each stop becomes a "via" maneuver. */
export function findRouteVia(g: Graph, stops: { lat: number; lon: number }[], opts: RouteOptions = {}): RouteResult {
  if (stops.length === 2) return findRoute(g, stops[0], stops[1], opts);
  const legs: Extract<RouteResult, { ok: true }>[] = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    const last = i + 2 === stops.length;
    const leg = findRoute(g, stops[i], stops[i + 1], { ...opts, destName: last ? opts.destName : undefined });
    if (!leg.ok) return leg;
    legs.push(leg);
  }
  const shape: [number, number][] = [];
  const maneuvers: Maneuver[] = [];
  const edges: number[] = [];
  let offset = 0;
  legs.forEach((leg, i) => {
    shape.push(...(i === 0 ? leg.shape : leg.shape.slice(1)));
    leg.maneuvers.forEach((m, k) => {
      if (i > 0 && k === 0) return;
      const isJoin = i + 1 < legs.length && k === leg.maneuvers.length - 1;
      maneuvers.push({
        ...m,
        dist: m.dist + offset,
        ...(isJoin ? { type: 'via' as const, text: `Via stop ${i + 1}`, name: null, stop: i + 1 } : {}),
      });
    });
    edges.push(...leg.edges);
    offset += leg.distance;
  });
  const speed = opts.speed && opts.speed > 0 ? opts.speed : DEFAULT_SPEED;
  return {
    ok: true,
    shape,
    distance: offset,
    duration: offset / speed,
    maneuvers,
    warnings: routeWarnings(maneuvers, opts.profile),
    snapStart: legs[0].snapStart,
    snapEnd: legs[legs.length - 1].snapEnd,
    edges,
  };
}

const SETTLEMENT: PlaceKind[] = ['city', 'town', 'village'];
const BERTH_RANK: Partial<Record<PlaceKind, number>> = { harbour: 0, marina: 0, mooring: 1 };
/** How far from a town or village centre a harbour still counts as its harbour, metres. */
export const HARBOUR_REACH = 2000;
const HARBOUR_SNAP = 300;

/** "Jachthaven X (Hoorn)", unless the harbour's name already says the town. */
function namedAfter(harbour: string, town?: string): string {
  return town && !harbour.toLowerCase().includes(town.toLowerCase()) ? `${harbour} (${town})` : harbour;
}

/** Harbours, marinas and moorings near a town centre, best first: harbours and marinas, then closest. */
export function harboursNear(places: Place[], to: { lat: number; lon: number }, reach = HARBOUR_REACH): Place[] {
  return places
    .filter((p) => p.kind in BERTH_RANK && distance(p, to) <= reach)
    .sort((a, b) => BERTH_RANK[a.kind]! - BERTH_RANK[b.kind]! || distance(a, to) - distance(b, to));
}

/**
 * Route to a place. A town, city or village has no water of its own, so the
 * route ends at the best harbour, marina or mooring within reach that lies on
 * the waterways; `end` names it. Otherwise the route ends at the place itself.
 */
export function findRouteToPlace(
  g: Graph,
  from: { lat: number; lon: number },
  via: { lat: number; lon: number }[],
  to: { lat: number; lon: number; kind?: PlaceKind },
  places: Place[],
  opts: RouteOptions = {},
): { result: RouteResult; end?: Place } {
  if (to.kind && SETTLEMENT.includes(to.kind)) {
    for (const harbour of harboursNear(places, to)
      .filter((h) => snapToGraph(g, h, { maxDist: HARBOUR_SNAP }))
      .slice(0, 3)) {
      const result = findRouteVia(g, [from, ...via, harbour], {
        ...opts,
        destName: namedAfter(harbour.name, opts.destName),
      });
      if (result.ok) return { result, end: harbour };
    }
  }
  return { result: findRouteVia(g, [from, ...via, to], opts) };
}
