/** Wire format of the Vaarweginformatie extract (`fis-<generation>.json`). Coordinates in degrees, lengths in metres. */

import { distance, type LatLon } from './geo';
import type { Graph } from './routing';
import { OBSTACLE, type Place, type PlaceInfo, type PlaceKind } from './waterway-data';

export const FIS_FORMAT_VERSION = 1;
export const FIS_SOURCE = 'vaarweginformatie';
export const FIS_ATTRIBUTION = '© Rijkswaterstaat / Vaarweginformatie.nl';

export const NL_BBOX = { minLat: 50.6, maxLat: 53.8, minLon: 3.0, maxLon: 7.4 };

export interface FisBridge {
  name: string;
  lat: number;
  lon: number;
  canOpen: boolean;
  /** closed clearance, lowest of the passages */
  clearance?: number;
  /** widest passage */
  width?: number;
  /** VHF channels, "22/69" */
  vhf?: string;
  /** operating note */
  hours?: string;
}

export interface FisLock {
  name: string;
  lat: number;
  lon: number;
  chambers?: number;
  vhf?: string;
  hours?: string;
}

export interface FisBerth {
  name: string;
  lat: number;
  lon: number;
}

export interface FisFile {
  version: typeof FIS_FORMAT_VERSION;
  generation: number;
  published: string;
  built: string;
  source: string;
  bridges: FisBridge[];
  locks: FisLock[];
  berths: FisBerth[];
}

const MATCH_BRIDGE_M = 40;
const MERGE_PLACE_M = 50;
const CELL_LAT = 0.001;
const CELL_LON = 0.0016;
const cellKey = (p: LatLon) => Math.floor(p.lat / CELL_LAT) * 100_000 + Math.floor(p.lon / CELL_LON);

/** Points bucketed in cells of roughly 110 m, so lookups within 110 m only touch the neighbouring cells. */
class PointGrid<T extends LatLon> {
  private cells = new Map<number, T[]>();

  constructor(items: T[]) {
    for (const item of items) {
      const k = cellKey(item);
      const cell = this.cells.get(k);
      if (cell) cell.push(item);
      else this.cells.set(k, [item]);
    }
  }

  nearest(p: LatLon, radius: number, accept: (item: T) => boolean = () => true): T | null {
    let best: T | null = null;
    let bestDist = radius;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const item of this.cells.get(cellKey(p) + dy * 100_000 + dx) ?? []) {
          const d = distance(p, item);
          if (d <= bestDist && accept(item)) {
            best = item;
            bestDist = d;
          }
        }
      }
    }
    return best;
  }
}

function pointOnEdge(g: Graph, edge: number, pos: number): LatLon {
  let k = g.pstart[edge];
  const last = g.pstart[edge + 1] - 2;
  while (k < last && g.pcum[k + 1] < pos) k++;
  const span = g.pcum[k + 1] - g.pcum[k];
  const f = span > 0 ? Math.min(1, Math.max(0, (pos - g.pcum[k]) / span)) : 0;
  return {
    lat: g.plat[k] + f * (g.plat[k + 1] - g.plat[k]),
    lon: g.plon[k] + f * (g.plon[k + 1] - g.plon[k]),
  };
}

/**
 * Overrides the bridge obstacles of the graph with the official data of the FIS bridge within 40 m:
 * closed clearance, and whether the bridge opens. Mutates the graph; call once after decoding.
 */
export function mergeFisIntoGraph(g: Graph, fis: FisFile): { matched: number; total: number } {
  const grid = new PointGrid(fis.bridges);
  const names = new Map<string, number>();
  let matched = 0;
  let total = 0;
  for (let e = 0; e < g.edgeCount; e++) {
    for (const o of g.obstacles[e]) {
      if (o[1] === OBSTACLE.lock) continue;
      total++;
      const b = grid.nearest(pointOnEdge(g, e, o[0]), MATCH_BRIDGE_M);
      if (!b) continue;
      matched++;
      if (b.clearance) o[2] = Math.round(b.clearance * 100);
      const type = b.canOpen ? OBSTACLE.bridgeMovable : OBSTACLE.bridgeFixed;
      if (type !== o[1]) {
        g.eMovable[e] += type === OBSTACLE.bridgeMovable ? 1 : -1;
        o[1] = type;
      }
      if (!g.names[o[3]] && b.name) {
        let i = names.get(b.name);
        if (i === undefined) names.set(b.name, (i = g.names.push(b.name) - 1));
        o[3] = i;
      }
    }
  }
  return { matched, total };
}

const compact = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

const place = (name: string, kind: PlaceKind, at: LatLon, info: PlaceInfo): Place => ({
  name,
  kind,
  lat: at.lat,
  lon: at.lon,
  info: { ...compact(info), source: FIS_SOURCE },
});

function fisPlaces(fis: FisFile): Place[] {
  return [
    ...fis.bridges.map((b) =>
      place(b.name, 'bridge', b, {
        clearance: b.clearance,
        width: b.width,
        canOpen: b.canOpen,
        vhf: b.vhf,
        openingHours: b.hours,
      }),
    ),
    ...fis.locks.map((l) => place(l.name, 'lock', l, { vhf: l.vhf, openingHours: l.hours })),
    ...fis.berths.map((b) => place(b.name, 'mooring', b, {})),
  ];
}

/**
 * OSM places plus the FIS bridges, locks and berths. A FIS place within 50 m of an OSM place of the same
 * kind replaces it, taking the OSM name and details only where FIS has none; each OSM place absorbs one.
 */
export function mergeFisPlaces(places: Place[], fis: FisFile): Place[] {
  const extra = fisPlaces(fis);
  if (!extra.length) return places;
  const grids = new Map<PlaceKind, PointGrid<Place>>();
  for (const kind of new Set(extra.map((p) => p.kind))) {
    grids.set(kind, new PointGrid(places.filter((p) => p.kind === kind)));
  }
  const merged = [...places];
  const index = new Map(places.map((p, i) => [p, i]));
  const taken = new Set<Place>();
  const added: Place[] = [];
  for (const f of extra) {
    const o = grids.get(f.kind)!.nearest(f, MERGE_PLACE_M, (p) => !taken.has(p));
    if (!o) {
      added.push(f);
      continue;
    }
    taken.add(o);
    merged[index.get(o)!] = {
      ...f,
      name: f.name || o.name,
      info: { ...o.info, ...f.info },
    };
  }
  return [...merged, ...added];
}
