import { distance, type LatLon } from './geo';
import type { Place, PlaceKind } from './waterway-data';

export interface SearchResult extends Place {
  /** metres from the `near` position, when one was given */
  distance?: number;
}

export interface SearchOptions {
  near?: LatLon;
  limit?: number;
}

/** Case-, diacritic- and punctuation-insensitive form used for matching. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const KIND_RANK: Record<PlaceKind, number> = {
  harbour: 0,
  marina: 0,
  lock: 1,
  city: 1,
  town: 1,
  mooring: 2,
  waypoint: 2,
  village: 3,
  waterway: 3,
  bridge: 5,
};

const MATCH_EXACT = 0;
const MATCH_PREFIX = 1;
const MATCH_WORDS = 2;

interface Entry {
  place: Place;
  norm: string;
  words: string[];
}

/** In-memory search over the place list: prefix and word-prefix matching ranked by match, kind and distance. */
export class PlaceIndex {
  private entries: Entry[];

  constructor(places: Place[]) {
    this.entries = places.map((place) => {
      const norm = normalize(place.name);
      return { place, norm, words: norm.split(' ') };
    });
  }

  get size(): number {
    return this.entries.length;
  }

  search(query: string, opts: SearchOptions = {}): SearchResult[] {
    const q = normalize(query);
    if (!q) return [];
    const tokens = q.split(' ');
    const limit = opts.limit ?? 20;
    const hits: { entry: Entry; match: number; dist: number | null }[] = [];
    for (const entry of this.entries) {
      const match = this.matchClass(entry, q, tokens);
      if (match < 0) continue;
      hits.push({ entry, match, dist: opts.near ? distance(opts.near, entry.place) : null });
    }
    hits.sort(
      (a, b) =>
        a.match - b.match ||
        KIND_RANK[a.entry.place.kind] - KIND_RANK[b.entry.place.kind] ||
        (a.dist ?? 0) - (b.dist ?? 0) ||
        a.entry.norm.length - b.entry.norm.length ||
        a.entry.norm.localeCompare(b.entry.norm),
    );
    return hits
      .slice(0, limit)
      .map(({ entry, dist }) => (dist == null ? { ...entry.place } : { ...entry.place, distance: dist }));
  }

  private matchClass(entry: Entry, q: string, tokens: string[]): number {
    if (entry.norm === q) return MATCH_EXACT;
    if (entry.norm.startsWith(q)) return MATCH_PREFIX;
    const used = new Set<number>();
    for (const t of tokens) {
      const i = entry.words.findIndex((w, idx) => !used.has(idx) && w.startsWith(t));
      if (i < 0) return -1;
      used.add(i);
    }
    return MATCH_WORDS;
  }
}
