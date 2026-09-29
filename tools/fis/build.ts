import {
  FIS_FORMAT_VERSION,
  NL_BBOX,
  type FisBerth,
  type FisBridge,
  type FisFile,
  type FisLock,
} from '../../src/core/fis.ts';
import type { DataManifest } from '../../src/core/waterway-data.ts';

export const FIS_API = 'https://www.vaarweginformatie.nl/wfswms/dataservice/1.4';
export const GEOTYPES = ['bridge', 'opening', 'lock', 'operatingtimes', 'radiocallinpoint', 'berth'] as const;
export type Geotype = (typeof GEOTYPES)[number];

const PAGE_SIZE = 500;
const CONCURRENCY = 4;
const RETRIES = 3;
const NOTE_CHARS = 300;

export interface FisObject {
  Id: number;
  Name?: string;
  Geometry?: string;
  ParentId?: number;
  ParentGeoType?: string;
  Type?: string;
  CanOpen?: boolean;
  Width?: number;
  HeightClosed?: number;
  ClearanceHeightClosed?: number;
  OperatingTimesId?: number;
  Note?: string;
  NumberOfChambers?: number;
  VhfChannels?: string[];
  Status?: string[];
  Condition?: string;
  Category?: string;
}

export type FisRaw = Record<Geotype, FisObject[]>;

export interface FisMeta {
  generation: number;
  published: string;
  built: string;
  source: string;
}

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;
const metres = (v: number) => round(v, 2);
const degrees = (v: number) => round(v, 6);

/** Position of a WKT geometry: the point itself, otherwise the centroid of the first ring or line. */
export function parseWkt(wkt: string): { lat: number; lon: number } | null {
  const ring = /\(([^()]+)\)/.exec(wkt)?.[1];
  if (!ring) return null;
  const pts = ring.split(',').map((p) => p.trim().split(/\s+/).map(Number));
  if (!pts.length || pts.some((p) => p.length < 2 || !p.every(Number.isFinite))) return null;
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const cross = pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
    a += cross;
    cx += (pts[i][0] + pts[i + 1][0]) * cross;
    cy += (pts[i][1] + pts[i + 1][1]) * cross;
  }
  if (Math.abs(a) > 1e-18 && pts.length > 2) return { lon: degrees(cx / (3 * a)), lat: degrees(cy / (3 * a)) };
  const n = pts.length;
  return {
    lon: degrees(pts.reduce((s, p) => s + p[0], 0) / n),
    lat: degrees(pts.reduce((s, p) => s + p[1], 0) / n),
  };
}

const inNetherlands = (p: { lat: number; lon: number }) =>
  p.lat >= NL_BBOX.minLat && p.lat <= NL_BBOX.maxLat && p.lon >= NL_BBOX.minLon && p.lon <= NL_BBOX.maxLon;

const inUse = (o: FisObject) => !o.Condition || o.Condition === 'CONSTRUCTED';

function groupBy<T>(items: T[], key: (item: T) => number | undefined): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === undefined) continue;
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

const note = (text: string | undefined): string | undefined => {
  const t = text?.replace(/\r/g, '').trim();
  if (!t) return undefined;
  return t.length > NOTE_CHARS ? t.slice(0, NOTE_CHARS).trimEnd() : t;
};

/** "22 of 69" and ["22", "18"] both become "22/69/18". */
function channels(points: FisObject[] | undefined): string | undefined {
  const all = (points ?? []).flatMap((p) => p.VhfChannels ?? []).flatMap((c) => c.match(/\d+/g) ?? []);
  return all.length ? [...new Set(all)].join('/') : undefined;
}

const defined = <T extends object>(o: T): T => {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
};

/** Joins the raw FIS objects into the compact file: openings, call-in points and operating times folded into their bridge or lock. */
export function buildFis(raw: FisRaw, meta: FisMeta): FisFile {
  const openings = groupBy(
    raw.opening.filter((o) => o.ParentGeoType === 'bridge'),
    (o) => o.ParentId,
  );
  const calls = (type: string) =>
    groupBy(
      raw.radiocallinpoint.filter((c) => c.ParentGeoType === type),
      (c) => c.ParentId,
    );
  const bridgeCalls = calls('bridge');
  const lockCalls = calls('lock');
  const times = new Map(raw.operatingtimes.map((t) => [t.Id, note(t.Note)]));
  const hours = (o: FisObject) => (o.OperatingTimesId === undefined ? undefined : times.get(o.OperatingTimesId));

  const bridges: FisBridge[] = [];
  for (const b of raw.bridge) {
    const at = b.Geometry ? parseWkt(b.Geometry) : null;
    if (!at || !b.Name || !inUse(b) || !inNetherlands(at)) continue;
    const passages = openings.get(b.Id) ?? [];
    const heights = passages
      .map((o) => o.ClearanceHeightClosed ?? o.HeightClosed)
      .filter((h): h is number => !!h && h > 0);
    const widths = passages.map((o) => o.Width).filter((w): w is number => !!w && w > 0);
    bridges.push(
      defined({
        name: b.Name,
        ...at,
        canOpen: b.CanOpen ?? passages.some((o) => o.Type !== 'VST'),
        clearance: heights.length ? metres(Math.min(...heights)) : undefined,
        width: widths.length ? metres(Math.max(...widths)) : undefined,
        vhf: channels(bridgeCalls.get(b.Id)),
        hours: hours(b),
      }),
    );
  }

  const locks: FisLock[] = [];
  for (const l of raw.lock) {
    const at = l.Geometry ? parseWkt(l.Geometry) : null;
    if (!at || !l.Name || !inUse(l) || !inNetherlands(at)) continue;
    locks.push(
      defined({
        name: l.Name,
        ...at,
        chambers: l.NumberOfChambers || undefined,
        vhf: channels(lockCalls.get(l.Id)),
        hours: hours(l),
      }),
    );
  }

  const berths: FisBerth[] = [];
  for (const b of raw.berth) {
    const at = b.Geometry ? parseWkt(b.Geometry) : null;
    const status = b.Status ?? [];
    const open = status.includes('PUBLIC') || b.Category === 'WAITING_AREA';
    if (!at || !b.Name || !inUse(b) || !open || !inNetherlands(at)) continue;
    berths.push({ name: b.Name, ...at });
  }

  return { version: FIS_FORMAT_VERSION, ...meta, bridges, locks, berths };
}

export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

/** Runs at most `max` tasks at once, in the order they are submitted. */
export function createLimiter(max: number): Limiter {
  let active = 0;
  const queue: (() => void)[] = [];
  const release = () => {
    active--;
    queue.shift()?.();
  };
  return async (task) => {
    if (active >= max) await new Promise<void>((resolve) => queue.push(resolve));
    active++;
    try {
      return await task();
    } finally {
      release();
    }
  };
}

export interface FetchOptions {
  base?: string;
  generation: number;
  fetch?: typeof fetch;
  limit?: Limiter;
  /** first retry delay; doubles each time */
  backoffMs?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
}

async function getJson<T>(url: string, o: FetchOptions): Promise<T> {
  const doFetch = o.fetch ?? fetch;
  let failure: Error = new Error('no attempt made');
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, (o.backoffMs ?? 1000) * 2 ** (attempt - 1)));
    o.signal?.throwIfAborted();
    try {
      const timeout = AbortSignal.timeout(o.requestTimeoutMs ?? 60_000);
      const res = await doFetch(url, {
        signal: o.signal ? AbortSignal.any([o.signal, timeout]) : timeout,
      });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      if (o.signal?.aborted) throw e;
      failure = e as Error;
    }
  }
  throw failure;
}

export async function currentGeneration(
  o: Omit<FetchOptions, 'generation'>,
): Promise<{ generation: number; published: string }> {
  const r = await getJson<{ GeoGeneration?: number; PublicationDate?: string }>(`${o.base ?? FIS_API}/geogeneration`, {
    ...o,
    generation: 0,
  });
  if (!Number.isInteger(r.GeoGeneration)) throw new Error('geogeneration response has no GeoGeneration');
  return { generation: r.GeoGeneration!, published: r.PublicationDate ?? '' };
}

/** Every object of a geotype: the first page tells the total, the rest are fetched through the shared limiter. */
export async function fetchAll(geotype: Geotype, o: FetchOptions): Promise<FisObject[]> {
  const limit = o.limit ?? createLimiter(CONCURRENCY);
  const page = (offset: number) =>
    limit(() =>
      getJson<{ TotalCount: number; Result: FisObject[] }>(
        `${o.base ?? FIS_API}/${o.generation}/${geotype}?offset=${offset}&count=${PAGE_SIZE}`,
        o,
      ),
    );
  const first = await page(0);
  if (!Array.isArray(first.Result) || !Number.isInteger(first.TotalCount))
    throw new Error(`${geotype}: unexpected response`);
  const offsets: number[] = [];
  for (let offset = PAGE_SIZE; offset < first.TotalCount; offset += PAGE_SIZE) offsets.push(offset);
  const rest = await Promise.all(offsets.map(page));
  return [first, ...rest].flatMap((p) => p.Result);
}

export const shouldSkip = (generation: number, manifest: DataManifest | null, force: boolean): boolean =>
  !force && manifest?.fisGeneration === generation;

export const publishedManifest = (manifest: DataManifest, file: string, generation: number): DataManifest => ({
  ...manifest,
  fis: `./data/${file}`,
  fisGeneration: generation,
});
