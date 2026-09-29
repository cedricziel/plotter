/**
 * Wire format of the routing graph (`waterways-<date>.json`) and the place
 * index (`places-<date>.json`). Shared by the build tool and the client; keep
 * this file free of imports so Node can run it directly.
 *
 * Coordinates are integers in 1e-6 degrees, lengths and positions metres,
 * dimensions centimetres (0 = unknown).
 */

export const FORMAT_VERSION = 1;

/** Waterway class as tagged in OSM. */
export const KIND = { canal: 0, river: 1, fairway: 2 } as const;

/** Edge flag bits. */
export const FLAG = {
  /** traversable only from vertex a to vertex b */
  ONEWAY_FWD: 1,
  /** traversable only from vertex b to vertex a */
  ONEWAY_REV: 2,
  /** boat=yes or motorboat=yes is explicitly tagged */
  BOAT_YES: 4,
} as const;

export const OBSTACLE = { lock: 0, bridgeFixed: 1, bridgeMovable: 2 } as const;
export type ObstacleType = (typeof OBSTACLE)[keyof typeof OBSTACLE];

/** CEMT class ranks: 0 unknown, 1 = "0", 2 = "I", 3 = "II", … 11 = "VII". */
export const CEMT_RANKS = ['', '0', 'I', 'II', 'III', 'IV', 'Va', 'Vb', 'VIa', 'VIb', 'VIc', 'VII'] as const;

export function cemtRank(value: string | undefined): number {
  if (!value) return 0;
  const v = value.trim().replace(/^./, (c) => c.toUpperCase());
  const first = v.split(/[;,/ ]/)[0];
  const i = CEMT_RANKS.findIndex((c, idx) => idx > 0 && c.toLowerCase() === first.toLowerCase());
  return i > 0 ? i : 0;
}

/** [pos, type, clearance, name, roadMaxheight]; name is an index into `names` (0 = none). */
export type ObstacleTuple = [pos: number, type: ObstacleType, clearance: number, name: number, roadMaxheight: number];

/**
 * [a, b, length, name, kind, cemt, flags, maxDraught, maxWidth, maxHeight, poly, obstacles].
 * `poly` holds the interior points as [dLat, dLon, …], each delta relative to
 * the previous point (starting at vertex a); obstacles are sorted by `pos`,
 * the distance from vertex a along the edge.
 */
export type EdgeTuple = [
  a: number,
  b: number,
  length: number,
  name: number,
  kind: number,
  cemt: number,
  flags: number,
  maxDraught: number,
  maxWidth: number,
  maxHeight: number,
  poly: number[],
  obstacles: ObstacleTuple[],
];

export interface WaterwayFile {
  version: typeof FORMAT_VERSION;
  built: string;
  source: string;
  /** names[0] is always the empty string */
  names: string[];
  /** flat [lat, lon, …] */
  vertices: number[];
  edges: EdgeTuple[];
}

export type PlaceKind = 'harbour' | 'marina' | 'mooring' | 'lock' | 'bridge' | 'city' | 'town' | 'village' | 'waterway' | 'waypoint';

export interface PlaceInfo {
  vhf?: string;
  phone?: string;
  website?: string;
  openingHours?: string;
  berths?: number;
  operator?: string;
  /** metres, closed */
  clearance?: number;
  /** metres, widest passage */
  width?: number;
  canOpen?: boolean;
  /** set when the values come from an official source, e.g. 'vaarweginformatie' */
  source?: string;
}

export interface Place {
  name: string;
  kind: PlaceKind;
  lat: number;
  lon: number;
  info?: PlaceInfo;
}

export interface DataManifest {
  waterways: string;
  places: string;
  built: string;
  source: string;
  /** fairway data file, published by its own job */
  fis?: string;
  fisGeneration?: number;
}
