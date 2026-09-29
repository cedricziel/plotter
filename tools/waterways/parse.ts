import type { PlaceInfo } from '../../src/core/waterway-data.ts';

/** Metres from an OSM dimension value ("3.5", "3,5 m", "12'6\""), or null when absent or symbolic. */
export function parseMeters(value: string | undefined): number | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  const feet = /^(\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*(?:"|''))?$/.exec(v);
  if (feet) return (Number(feet[1]) * 12 + Number(feet[2] ?? 0)) * 0.0254;
  const m = /^(\d+(?:[.,]\d+)?)\s*(m|meter|metre|meters|metres)?$/.exec(v);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Centimetres, or 0 when unknown. */
export function parseCm(value: string | undefined): number {
  const m = parseMeters(value);
  return m == null ? 0 : Math.round(m * 100);
}

const MOVABLE_BRIDGE = new Set([
  'movable',
  'bascule',
  'drawbridge',
  'lift',
  'swing',
  'retractable',
  'rolling',
  'transporter',
  'pontoon',
  'opening',
  'lifting',
  'tilt',
  'folding',
]);

export function isMovableBridge(tags: Record<string, string>): boolean {
  const m = tags['bridge:movable'];
  if (m && m !== 'no') return true;
  if (MOVABLE_BRIDGE.has(tags.bridge ?? '')) return true;
  return MOVABLE_BRIDGE.has(tags['seamark:bridge:category'] ?? '');
}

const first = (t: Record<string, string>, keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = t[k]?.trim();
    if (v) return v.slice(0, 160);
  }
  return undefined;
};

function webUrl(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const url = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  return /^https?:\/\/[^\s/]+/i.test(url) ? url : undefined;
}

/** The contact and facility tags worth showing on a place; undefined when there are none. */
export function placeInfo(t: Record<string, string>): PlaceInfo | undefined {
  const vhfKey = Object.keys(t).find((k) => k === 'vhf' || k.endsWith(':vhf'));
  const berths = parseInt(first(t, ['capacity:berths', 'seamark:harbour:berths', 'capacity']) ?? '', 10);
  const info: PlaceInfo = {
    vhf: vhfKey && !/^(no|none)$/i.test(t[vhfKey].trim()) ? first(t, [vhfKey]) : undefined,
    phone: first(t, ['phone', 'contact:phone']),
    website: webUrl(first(t, ['website', 'contact:website', 'url'])),
    openingHours: first(t, ['opening_hours']),
    berths: berths > 0 ? berths : undefined,
    operator: first(t, ['operator']),
  };
  const kept = Object.entries(info).filter(([, v]) => v !== undefined);
  return kept.length ? (Object.fromEntries(kept) as PlaceInfo) : undefined;
}
