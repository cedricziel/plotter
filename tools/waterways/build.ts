import { distance } from '../../src/core/geo.ts';
import {
  FLAG,
  FORMAT_VERSION,
  KIND,
  OBSTACLE,
  cemtRank,
  type EdgeTuple,
  type ObstacleTuple,
  type ObstacleType,
  type Place,
  type PlaceInfo,
  type PlaceKind,
  type WaterwayFile,
} from '../../src/core/waterway-data.ts';
import { parseOplLine, type OplNode, type OplWay } from './opl.ts';
import { isMovableBridge, parseCm, placeInfo } from './parse.ts';

export interface BuildOptions {
  source: string;
  built?: string;
}

export interface BuildStats {
  navigableWays: number;
  vertices: number;
  edges: number;
  components: number;
  droppedComponents: number;
  totalLengthKm: number;
  excluded: Record<string, number>;
  locks: number;
  bridgesFixed: number;
  bridgesMovable: number;
  bridgesFromSeamark: number;
  bridgesWithClearance: number;
  bridgesWithRoadMaxheight: number;
  bridgeWaysSeen: number;
  places: Record<string, number>;
}

export interface BuildResult {
  file: WaterwayFile;
  places: Place[];
  stats: BuildStats;
}

const WATERWAY_KIND: Record<string, number> = {
  canal: KIND.canal,
  river: KIND.river,
  fairway: KIND.fairway,
};
const MIN_COMPONENT_M = 1000;
const SEAMARK_SNAP_M = 35;
const LOCK_SNAP_M = 50;
const LOCK_GATE_SNAP_M = 25;
const LOCK_CLUSTER_M = 250;
const BRIDGE_MERGE_SEAMARK_M = 60;
const BRIDGE_MERGE_DUAL_M = 30;
const PLACE_DEDUPE_M = 300;
const M_PER_E6 = 0.111195;
const IGNORED_BRIDGE = new Set(['no', 'aqueduct', 'causeway', 'low_water_crossing', 'culvert']);
const BRIDGE_CARRIER = ['highway', 'railway', 'man_made', 'aerialway'];

interface NavWay {
  id: number;
  ids: number[];
  lat: number[];
  lon: number[];
  name: string;
  kind: number;
  cemt: number;
  flags: number;
  maxDraught: number;
  maxWidth: number;
  maxHeight: number;
  lock: boolean;
}

interface BridgeWay {
  lat: number[];
  lon: number[];
  name: string;
  movable: boolean;
  clearance: number;
  roadMax: number;
  info?: PlaceInfo;
}

interface SeamarkBridge {
  lat: number;
  lon: number;
  name: string;
  movable: boolean;
  clearance: number;
  info?: PlaceInfo;
}

interface LockMember {
  lat: number;
  lon: number;
  name: string;
  lockName: string;
  wayId: number | null;
  info?: PlaceInfo;
}

interface Edge {
  a: number;
  b: number;
  /** flat lat/lon, including both endpoints */
  pts: number[];
  length: number;
  way: NavWay;
  cum?: number[];
}

interface Candidate {
  pos: number;
  type: ObstacleType;
  clearance: number;
  name: string;
  roadMax: number;
  seamark: boolean;
  info?: PlaceInfo;
}

const emptyStats = (): BuildStats => ({
  navigableWays: 0,
  vertices: 0,
  edges: 0,
  components: 0,
  droppedComponents: 0,
  totalLengthKm: 0,
  excluded: {},
  locks: 0,
  bridgesFixed: 0,
  bridgesMovable: 0,
  bridgesFromSeamark: 0,
  bridgesWithClearance: 0,
  bridgesWithRoadMaxheight: 0,
  bridgeWaysSeen: 0,
  places: {},
});

const seg = (pts: number[], i: number) => [pts[2 * i], pts[2 * i + 1], pts[2 * i + 2], pts[2 * i + 3]] as const;

function pointDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return distance({ lat: lat1 / 1e6, lon: lon1 / 1e6 }, { lat: lat2 / 1e6, lon: lon2 / 1e6 });
}

function polylineLength(pts: number[]): number {
  let len = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) len += pointDistance(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]);
  return len;
}

/** Point at `along` metres on a flat lat/lon polyline. */
function pointAlong(pts: number[], along: number): [number, number] {
  let rest = along;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const d = pointDistance(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]);
    if (rest <= d || i + 4 >= pts.length) {
      const t = d > 0 ? Math.min(1, Math.max(0, rest / d)) : 0;
      return [pts[i] + (pts[i + 2] - pts[i]) * t, pts[i + 1] + (pts[i + 3] - pts[i + 1]) * t];
    }
    rest -= d;
  }
  return [pts[pts.length - 2], pts[pts.length - 1]];
}

/** Local planar metre offsets for a small area around `lat` (1e-6 degrees in). */
function planar(lat: number) {
  const kx = Math.cos((lat / 1e6) * (Math.PI / 180)) * M_PER_E6;
  return { kx, ky: M_PER_E6 };
}

interface SegHit {
  /** parameter along the first segment */
  t: number;
  /** parameter along the second segment */
  u: number;
}

function intersect(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): SegHit | null {
  const { kx, ky } = planar(a[0]);
  const ax = a[1] * kx;
  const ay = a[0] * ky;
  const rx = (a[3] - a[1]) * kx;
  const ry = (a[2] - a[0]) * ky;
  const bx = b[1] * kx;
  const by = b[0] * ky;
  const sx = (b[3] - b[1]) * kx;
  const sy = (b[2] - b[0]) * ky;
  const den = rx * sy - ry * sx;
  if (den === 0) return null;
  const t = ((bx - ax) * sy - (by - ay) * sx) / den;
  const u = ((bx - ax) * ry - (by - ay) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
}

const CELL_LAT = 4000;
const CELL_LON = 6000;
const cellKey = (cy: number, cx: number) => (cy + 30000) * 100000 + (cx + 40000);

/** Grid over the segments of all edges: entry = edge * 2^21 + segment. */
class SegmentIndex {
  private cells = new Map<number, number[]>();
  constructor(edges: Edge[]) {
    edges.forEach((e, ei) => {
      for (let i = 0; i + 3 < e.pts.length; i += 2) {
        const s = i / 2;
        const [y1, x1, y2, x2] = seg(e.pts, s);
        const cy1 = Math.floor(Math.min(y1, y2) / CELL_LAT);
        const cy2 = Math.floor(Math.max(y1, y2) / CELL_LAT);
        const cx1 = Math.floor(Math.min(x1, x2) / CELL_LON);
        const cx2 = Math.floor(Math.max(x1, x2) / CELL_LON);
        for (let cy = cy1; cy <= cy2; cy++) {
          for (let cx = cx1; cx <= cx2; cx++) {
            const k = cellKey(cy, cx);
            const list = this.cells.get(k);
            if (list) list.push(ei * 2097152 + s);
            else this.cells.set(k, [ei * 2097152 + s]);
          }
        }
      }
    });
  }

  /** Entries whose cells overlap the box (1e-6 degrees). */
  query(minLat: number, minLon: number, maxLat: number, maxLon: number): Set<number> {
    const out = new Set<number>();
    for (let cy = Math.floor(minLat / CELL_LAT); cy <= Math.floor(maxLat / CELL_LAT); cy++) {
      for (let cx = Math.floor(minLon / CELL_LON); cx <= Math.floor(maxLon / CELL_LON); cx++) {
        const list = this.cells.get(cellKey(cy, cx));
        if (list) for (const v of list) out.add(v);
      }
    }
    return out;
  }
}

function frac(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export class WaterwayBuilder {
  private navWays: NavWay[] = [];
  private bridgeWays: BridgeWay[] = [];
  private seamarkBridges: SeamarkBridge[] = [];
  private lockMembers: LockMember[] = [];
  private gates: LockMember[] = [];
  private featurePlaces: Place[] = [];
  private stats = emptyStats();

  private opts: BuildOptions;

  constructor(opts: BuildOptions) {
    this.opts = opts;
  }

  add(line: string): void {
    const o = parseOplLine(line);
    if (!o) return;
    if (o.type === 'w') this.addWay(o);
    else this.addNode(o);
  }

  private addNode(n: OplNode): void {
    const t = n.tags;
    if (t.waterway === 'lock_gate') {
      this.gates.push({
        lat: n.lat,
        lon: n.lon,
        name: t.name || '',
        lockName: t.lock_name || '',
        wayId: null,
        info: placeInfo(t),
      });
    }
    if (t['seamark:type'] === 'bridge') {
      this.seamarkBridges.push(seamarkBridge(n.lat, n.lon, t));
    }
    const kind = featureKind(t) ?? placeKind(t);
    if (kind && t.name)
      this.featurePlaces.push({
        name: t.name,
        kind,
        lat: n.lat / 1e6,
        lon: n.lon / 1e6,
        info: placeInfo(t),
      });
  }

  private addWay(w: OplWay): void {
    const t = w.tags;
    if (w.nodes.length < 2) return;
    const kind = WATERWAY_KIND[t.waterway ?? ''];
    if (kind !== undefined) {
      const excluded = exclusion(t);
      if (excluded) {
        this.stats.excluded[excluded] = (this.stats.excluded[excluded] ?? 0) + 1;
        return;
      }
      this.stats.navigableWays++;
      const way: NavWay = {
        id: w.id,
        ids: w.nodes.map((n) => n.id),
        lat: w.nodes.map((n) => n.lat),
        lon: w.nodes.map((n) => n.lon),
        name: t.name ?? '',
        kind,
        cemt: cemtRank(t.CEMT ?? t.cemt),
        flags: flagsOf(t),
        maxDraught: parseCm(t.maxdraught),
        maxWidth: parseCm(t.maxwidth),
        maxHeight: parseCm(t.maxheight),
        lock: t.lock === 'yes',
      };
      this.navWays.push(way);
      if (way.lock) {
        const pts = flat(way.lat, way.lon);
        const [lat, lon] = pointAlong(pts, polylineLength(pts) / 2);
        const member = { name: t.name || '', lockName: t.lock_name || '', wayId: w.id, info: placeInfo(t) };
        this.lockMembers.push({ lat, lon, ...member });
      }
      return;
    }
    const mid = () => {
      const pts = flat(
        w.nodes.map((n) => n.lat),
        w.nodes.map((n) => n.lon),
      );
      return pointAlong(pts, polylineLength(pts) / 2);
    };
    if (t['seamark:type'] === 'bridge') {
      const [lat, lon] = mid();
      this.seamarkBridges.push(seamarkBridge(lat, lon, t));
    }
    if (t.bridge && !IGNORED_BRIDGE.has(t.bridge) && !t.waterway && BRIDGE_CARRIER.some((k) => t[k])) {
      this.stats.bridgeWaysSeen++;
      this.bridgeWays.push({
        lat: w.nodes.map((n) => n.lat),
        lon: w.nodes.map((n) => n.lon),
        name: t.name ?? '',
        movable: isMovableBridge(t),
        clearance: parseCm(
          t['seamark:bridge:clearance_height_closed'] ??
            t['seamark:bridge:clearance_height'] ??
            t.clearance ??
            t['maxheight:physical'],
        ),
        roadMax: parseCm(t.maxheight),
        info: placeInfo(t),
      });
    }
    const kindOfFeature = featureKind(t);
    if (kindOfFeature && t.name) {
      let sLat = 0;
      let sLon = 0;
      for (const n of w.nodes) {
        sLat += n.lat;
        sLon += n.lon;
      }
      this.featurePlaces.push({
        name: t.name,
        kind: kindOfFeature,
        lat: sLat / w.nodes.length / 1e6,
        lon: sLon / w.nodes.length / 1e6,
        info: placeInfo(t),
      });
    }
  }

  finish(): BuildResult {
    const stats = this.stats;
    const names = new Map<string, number>([['', 0]]);
    const nameIdx = (s: string) => {
      let i = names.get(s);
      if (i === undefined) names.set(s, (i = names.size));
      return i;
    };

    const { vlat, vlon, edges: allEdges } = this.topology();
    const { edges, vertexMap } = this.filterComponents(vlat.length, allEdges);
    const keptLat: number[] = [];
    const keptLon: number[] = [];
    vertexMap.forEach((newIdx, old) => {
      keptLat[newIdx] = vlat[old];
      keptLon[newIdx] = vlon[old];
    });
    for (const e of edges) {
      e.a = vertexMap.get(e.a)!;
      e.b = vertexMap.get(e.b)!;
    }

    const index = new SegmentIndex(edges);
    const cum = (e: Edge): number[] => {
      if (!e.cum) {
        const c = [0];
        for (let i = 0; i + 3 < e.pts.length; i += 2)
          c.push(c[c.length - 1] + pointDistance(e.pts[i], e.pts[i + 1], e.pts[i + 2], e.pts[i + 3]));
        e.cum = c;
      }
      return e.cum;
    };
    const candidates: Candidate[][] = edges.map(() => []);
    const lockPlaces: Place[] = [];

    /** Closest point on every edge within `maxM` metres. */
    const snapAll = (lat: number, lon: number, maxM: number) => {
      const dLat = maxM / M_PER_E6;
      const { kx, ky } = planar(lat);
      const dLon = maxM / kx;
      const best = new Map<number, { edge: number; pos: number; dist: number }>();
      for (const entry of index.query(lat - dLat, lon - dLon, lat + dLat, lon + dLon)) {
        const ei = Math.floor(entry / 2097152);
        const s = entry % 2097152;
        const e = edges[ei];
        const [y1, x1, y2, x2] = seg(e.pts, s);
        const sx = (x2 - x1) * kx;
        const sy = (y2 - y1) * ky;
        const len2 = sx * sx + sy * sy;
        const px = (lon - x1) * kx;
        const py = (lat - y1) * ky;
        const t = len2 > 0 ? frac((px * sx + py * sy) / len2) : 0;
        const dist = Math.hypot(px - t * sx, py - t * sy);
        const prev = best.get(ei);
        if (dist <= maxM && (!prev || dist < prev.dist)) {
          const c = cum(e);
          best.set(ei, { edge: ei, pos: c[s] + t * (c[s + 1] - c[s]), dist });
        }
      }
      return [...best.values()];
    };
    const snap = (lat: number, lon: number, maxM: number) =>
      snapAll(lat, lon, maxM).reduce<{ edge: number; pos: number; dist: number } | null>(
        (m, c) => (!m || c.dist < m.dist ? c : m),
        null,
      );

    // ---- bridges from geometry --------------------------------------------
    for (const b of this.bridgeWays) {
      const minLat = Math.min(...b.lat);
      const maxLat = Math.max(...b.lat);
      const minLon = Math.min(...b.lon);
      const maxLon = Math.max(...b.lon);
      const hits = new Map<number, number[]>();
      const bpts = flat(b.lat, b.lon);
      for (const entry of index.query(minLat, minLon, maxLat, maxLon)) {
        const ei = Math.floor(entry / 2097152);
        const s = entry % 2097152;
        const e = edges[ei];
        for (let i = 0; i + 3 < bpts.length; i += 2) {
          const hit = intersect(seg(e.pts, s), seg(bpts, i / 2));
          if (!hit) continue;
          const c = cum(e);
          const pos = c[s] + hit.t * (c[s + 1] - c[s]);
          const list = hits.get(ei) ?? [];
          if (!list.some((p) => Math.abs(p - pos) < 10)) {
            list.push(pos);
            hits.set(ei, list);
            candidates[ei].push({
              pos,
              type: b.movable ? OBSTACLE.bridgeMovable : OBSTACLE.bridgeFixed,
              clearance: b.clearance,
              name: b.name,
              roadMax: b.roadMax,
              seamark: false,
              info: b.info,
            });
          }
        }
      }
    }
    // ---- seamark bridges ---------------------------------------------------
    for (const b of this.seamarkBridges) {
      const s = snap(b.lat, b.lon, SEAMARK_SNAP_M);
      if (!s) continue;
      candidates[s.edge].push({
        pos: s.pos,
        type: b.movable ? OBSTACLE.bridgeMovable : OBSTACLE.bridgeFixed,
        clearance: b.clearance,
        name: b.name,
        roadMax: 0,
        seamark: true,
        info: b.info,
      });
    }
    // ---- locks -------------------------------------------------------------
    // A lock is often mapped as parallel chamber ways while the fairway runs
    // through them, so every waterway edge that passes a chamber or a gate of
    // the lock gets the obstacle (once per lock and edge).
    const clusters = clusterPoints([...this.lockMembers, ...this.gates], LOCK_CLUSTER_M);
    for (const cluster of clusters) {
      const name = cluster.find((m) => m.name)?.name || cluster.find((m) => m.lockName)?.lockName || '';
      const reach = cluster.flatMap((m) =>
        m.wayId != null ? [{ m, radius: LOCK_SNAP_M }] : [{ m, radius: LOCK_GATE_SNAP_M }],
      );
      const seen = new Set<number>();
      for (const { m, radius } of reach) {
        for (const s of snapAll(m.lat, m.lon, radius).sort((a, b) => a.dist - b.dist)) {
          if (seen.has(s.edge)) continue;
          seen.add(s.edge);
          candidates[s.edge].push({ pos: s.pos, type: OBSTACLE.lock, clearance: 0, name, roadMax: 0, seamark: false });
        }
      }
      if (seen.size && name) {
        const c = centroid(cluster);
        lockPlaces.push({
          name,
          kind: 'lock',
          lat: c.lat / 1e6,
          lon: c.lon / 1e6,
          info: cluster.find((m) => m.info)?.info,
        });
      }
    }

    // ---- finalise obstacles per edge ---------------------------------------
    const namedBridges: Place[] = [];
    const outEdges: EdgeTuple[] = edges.map((e, ei) => {
      const obstacles = mergeObstacles(candidates[ei]);
      const tuples: ObstacleTuple[] = obstacles.map((o) => {
        if (o.type === OBSTACLE.lock) stats.locks++;
        else {
          if (o.type === OBSTACLE.bridgeFixed) stats.bridgesFixed++;
          else stats.bridgesMovable++;
          if (o.seamark) stats.bridgesFromSeamark++;
          if (o.clearance) stats.bridgesWithClearance++;
          if (o.roadMax) stats.bridgesWithRoadMaxheight++;
          if (o.name) {
            const [lat, lon] = pointAlong(e.pts, o.pos);
            namedBridges.push({
              name: o.name,
              kind: 'bridge',
              lat: lat / 1e6,
              lon: lon / 1e6,
              info: o.clearance ? { ...o.info, clearance: o.clearance / 100 } : o.info,
            });
          }
        }
        return [Math.round(o.pos), o.type, o.clearance, o.name ? nameIdx(o.name) : 0, o.roadMax];
      });
      const poly: number[] = [];
      let pLat = e.pts[0];
      let pLon = e.pts[1];
      for (let i = 2; i < e.pts.length - 2; i += 2) {
        poly.push(e.pts[i] - pLat, e.pts[i + 1] - pLon);
        pLat = e.pts[i];
        pLon = e.pts[i + 1];
      }
      const w = e.way;
      return [
        e.a,
        e.b,
        Math.round(e.length),
        w.name ? nameIdx(w.name) : 0,
        w.kind,
        w.cemt,
        w.flags,
        w.maxDraught,
        w.maxWidth,
        w.maxHeight,
        poly,
        tuples,
      ];
    });

    // ---- places ------------------------------------------------------------
    const waterwayPlaces = this.waterwayPlaces(edges);
    const places = dedupePlaces([...this.featurePlaces, ...lockPlaces, ...namedBridges, ...waterwayPlaces]);
    for (const p of places) stats.places[p.kind] = (stats.places[p.kind] ?? 0) + 1;

    stats.vertices = keptLat.length;
    stats.edges = edges.length;
    stats.totalLengthKm = Math.round(edges.reduce((s, e) => s + e.length, 0) / 100) / 10;

    const vertices: number[] = [];
    for (let i = 0; i < keptLat.length; i++) vertices.push(keptLat[i], keptLon[i]);
    return {
      file: {
        version: FORMAT_VERSION,
        built: this.opts.built ?? new Date().toISOString(),
        source: this.opts.source,
        names: [...names.keys()],
        vertices,
        edges: outEdges,
      },
      places,
      stats,
    };
  }

  private topology() {
    const usage = new Map<number, number>();
    for (const w of this.navWays) for (const id of w.ids) usage.set(id, (usage.get(id) ?? 0) + 1);
    const vertexOf = new Map<number, number>();
    const vlat: number[] = [];
    const vlon: number[] = [];
    const vertex = (id: number, lat: number, lon: number) => {
      let v = vertexOf.get(id);
      if (v === undefined) {
        v = vlat.length;
        vertexOf.set(id, v);
        vlat.push(lat);
        vlon.push(lon);
      }
      return v;
    };
    const edges: Edge[] = [];
    for (const w of this.navWays) {
      let start = 0;
      const last = w.ids.length - 1;
      for (let i = 1; i <= last; i++) {
        if (i !== last && (usage.get(w.ids[i]) ?? 0) < 2) continue;
        const a = vertex(w.ids[start], w.lat[start], w.lon[start]);
        const b = vertex(w.ids[i], w.lat[i], w.lon[i]);
        const pts: number[] = [];
        for (let k = start; k <= i; k++) {
          if (k > start && w.lat[k] === w.lat[k - 1] && w.lon[k] === w.lon[k - 1]) continue;
          pts.push(w.lat[k], w.lon[k]);
        }
        start = i;
        if (a === b || pts.length < 4) continue;
        edges.push({ a, b, pts, length: polylineLength(pts), way: w });
      }
    }
    return { vlat, vlon, edges };
  }

  private filterComponents(vertexCount: number, edges: Edge[]) {
    const parent = Array.from({ length: vertexCount }, (_, i) => i);
    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    for (const e of edges) parent[find(e.a)] = find(e.b);
    const total = new Map<number, number>();
    for (const e of edges) {
      const r = find(e.a);
      total.set(r, (total.get(r) ?? 0) + e.length);
    }
    let largest = -1;
    let largestLen = -1;
    for (const [r, len] of total) {
      if (len > largestLen) {
        largest = r;
        largestLen = len;
      }
    }
    const keep = (r: number) => r === largest || (total.get(r) ?? 0) > MIN_COMPONENT_M;
    this.stats.components = total.size;
    this.stats.droppedComponents = [...total.keys()].filter((r) => !keep(r)).length;
    const kept = edges.filter((e) => keep(find(e.a)));
    const vertexMap = new Map<number, number>();
    for (const e of kept) {
      for (const v of [e.a, e.b]) if (!vertexMap.has(v)) vertexMap.set(v, vertexMap.size);
    }
    return { edges: kept, vertexMap };
  }

  private waterwayPlaces(edges: Edge[]): Place[] {
    const byName = new Map<string, Edge[]>();
    for (const e of edges) {
      if (!e.way.name) continue;
      const list = byName.get(e.way.name);
      if (list) list.push(e);
      else byName.set(e.way.name, [e]);
    }
    const out: Place[] = [];
    for (const [name, list] of byName) {
      const mids = list.map((e) => pointAlong(e.pts, e.length / 2));
      const cLat = mids.reduce((s, m, i) => s + m[0] * list[i].length, 0) / list.reduce((s, e) => s + e.length, 0);
      const cLon = mids.reduce((s, m, i) => s + m[1] * list[i].length, 0) / list.reduce((s, e) => s + e.length, 0);
      let best = 0;
      let bestD = Infinity;
      mids.forEach((m, i) => {
        const d = pointDistance(m[0], m[1], cLat, cLon);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      out.push({
        name,
        kind: 'waterway',
        lat: mids[best][0] / 1e6,
        lon: mids[best][1] / 1e6,
      });
    }
    return out;
  }
}

export function buildWaterways(lines: Iterable<string>, opts: BuildOptions): BuildResult {
  const b = new WaterwayBuilder(opts);
  for (const l of lines) b.add(l);
  return b.finish();
}

function flat(lat: number[], lon: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < lat.length; i++) out.push(lat[i], lon[i]);
  return out;
}

function exclusion(t: Record<string, string>): string | null {
  if (t.tunnel === 'culvert') return 'culvert';
  if (t.motorboat === 'no') return 'motorboat=no';
  if (t.boat === 'no' && t.motorboat !== 'yes') return 'boat=no';
  return null;
}

function flagsOf(t: Record<string, string>): number {
  let f = 0;
  if (t.oneway === 'yes' || t.oneway === '1' || t.oneway === 'true') f |= FLAG.ONEWAY_FWD;
  else if (t.oneway === '-1' || t.oneway === 'reverse') f |= FLAG.ONEWAY_REV;
  if (t.boat === 'yes' || t.motorboat === 'yes') f |= FLAG.BOAT_YES;
  return f;
}

function seamarkBridge(lat: number, lon: number, t: Record<string, string>): SeamarkBridge {
  return {
    lat,
    lon,
    name: t['seamark:name'] || t.name || '',
    movable: isMovableBridge(t),
    clearance: parseCm(t['seamark:bridge:clearance_height_closed'] ?? t['seamark:bridge:clearance_height']),
    info: placeInfo(t),
  };
}

function featureKind(t: Record<string, string>): PlaceKind | null {
  if (t.leisure === 'marina') return 'marina';
  if ((t.harbour && t.harbour !== 'no') || t['seamark:type'] === 'harbour') return 'harbour';
  if (t.mooring && t.mooring !== 'no' && t.mooring !== 'private') return 'mooring';
  return null;
}

function placeKind(t: Record<string, string>): PlaceKind | null {
  return t.place === 'city' || t.place === 'town' || t.place === 'village' ? t.place : null;
}

function centroid(points: LockMember[]): { lat: number; lon: number } {
  return {
    lat: points.reduce((s, m) => s + m.lat, 0) / points.length,
    lon: points.reduce((s, m) => s + m.lon, 0) / points.length,
  };
}

/** Single-linkage clusters of points closer than `radius` metres. */
function clusterPoints(points: LockMember[], radius: number): LockMember[][] {
  const parent = points.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const cell = 0.005e6;
  const grid = new Map<number, number[]>();
  points.forEach((p, i) => {
    const k = cellKey(Math.floor(p.lat / cell), Math.floor(p.lon / cell));
    const list = grid.get(k);
    if (list) list.push(i);
    else grid.set(k, [i]);
  });
  points.forEach((p, i) => {
    const cy = Math.floor(p.lat / cell);
    const cx = Math.floor(p.lon / cell);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const j of grid.get(cellKey(cy + dy, cx + dx)) ?? []) {
          if (j > i && pointDistance(p.lat, p.lon, points[j].lat, points[j].lon) <= radius) parent[find(j)] = find(i);
        }
      }
    }
  });
  const groups = new Map<number, LockMember[]>();
  points.forEach((p, i) => {
    const r = find(i);
    const list = groups.get(r);
    if (list) list.push(p);
    else groups.set(r, [p]);
  });
  return [...groups.values()];
}

function mergeObstacles(list: Candidate[]): Candidate[] {
  const locks = list.filter((c) => c.type === OBSTACLE.lock);
  const seamark = list.filter((c) => c.seamark).map((c) => ({ ...c }));
  const geo = list.filter((c) => c.type !== OBSTACLE.lock && !c.seamark).sort((a, b) => a.pos - b.pos);
  const leftover: Candidate[] = [];
  for (const g of geo) {
    let near: Candidate | null = null;
    for (const s of seamark)
      if (
        Math.abs(s.pos - g.pos) <= BRIDGE_MERGE_SEAMARK_M &&
        (!near || Math.abs(s.pos - g.pos) < Math.abs(near.pos - g.pos))
      )
        near = s;
    if (near) {
      if (!near.name) near.name = g.name;
      if (!near.roadMax) near.roadMax = g.roadMax;
      if (!near.clearance) near.clearance = g.clearance;
      near.info ??= g.info;
      continue;
    }
    const prev = leftover[leftover.length - 1];
    if (prev && g.pos - prev.pos <= BRIDGE_MERGE_DUAL_M) {
      if (!prev.name) prev.name = g.name;
      if (!prev.roadMax) prev.roadMax = g.roadMax;
      if (!prev.clearance) prev.clearance = g.clearance;
      prev.info ??= g.info;
      if (g.type === OBSTACLE.bridgeMovable) prev.type = g.type;
      continue;
    }
    leftover.push({ ...g });
  }
  return [...locks, ...seamark, ...leftover].sort((a, b) => a.pos - b.pos);
}

function dedupePlaces(places: Place[]): Place[] {
  const seen = new Map<string, Place[]>();
  const out: Place[] = [];
  for (const p of places) {
    const key = `${p.kind}|${p.name}`;
    const list = seen.get(key) ?? [];
    if (list.some((q) => distance(p, q) <= PLACE_DEDUPE_M)) continue;
    list.push(p);
    seen.set(key, list);
    out.push({
      name: p.name,
      kind: p.kind,
      lat: Math.round(p.lat * 1e5) / 1e5,
      lon: Math.round(p.lon * 1e5) / 1e5,
      ...(p.info ? { info: p.info } : {}),
    });
  }
  return out;
}
