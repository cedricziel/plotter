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
