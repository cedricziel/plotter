import type { Seamark } from '../../src/core/waterway-data.ts';
import { parseOplLine } from './opl.ts';

export const SEAMARK_TYPES = [
  'buoy_lateral',
  'buoy_cardinal',
  'buoy_isolated_danger',
  'buoy_safe_water',
  'buoy_special_purpose',
  'beacon_lateral',
  'beacon_cardinal',
  'beacon_isolated_danger',
  'beacon_safe_water',
  'beacon_special_purpose',
  'light_minor',
  'light_major',
  'light_float',
  'light_vessel',
  'notice',
];
const KEPT_TYPE = new Set(SEAMARK_TYPES);
const COORD_DIGITS = 1e5;
const LIGHT_COLOUR: Record<string, string> = {
  white: 'W',
  red: 'R',
  green: 'G',
  yellow: 'Y',
  amber: 'Y',
  orange: 'Or',
  blue: 'Bu',
  violet: 'Vi',
};

const text = (v: string | undefined): string | undefined => {
  const s = v?.trim();
  return s ? s.slice(0, 80) : undefined;
};

/** The character, group, colour and period of the first light, as printed on charts: "Fl(2) G 5s". */
function lightOf(t: Record<string, string>): string | undefined {
  const prefix = t['seamark:light:character'] || t['seamark:light:colour'] ? 'seamark:light:' : 'seamark:light:1:';
  const get = (k: string) => text(t[prefix + k]);
  const character = get('character');
  const group = get('group');
  const colour = get('colour');
  const period = get('period');
  const parts = [
    character && (group ? `${character}(${group})` : character),
    colour && (LIGHT_COLOUR[colour] ?? colour),
    period && `${period}s`,
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}

export class SeamarkBuilder {
  private readonly out: Seamark[] = [];

  add(line: string): void {
    if (line.charCodeAt(0) !== 110 /* n */) return;
    const n = parseOplLine(line);
    const t = n?.tags;
    const type = t?.['seamark:type'];
    if (n?.type !== 'n' || !t || !type || !KEPT_TYPE.has(type)) return;
    const optional: Partial<Seamark> = {
      category: text(t[`seamark:${type}:category`]),
      colour: text(t[`seamark:${type}:colour`]),
      shape: text(t[`seamark:${type}:shape`]),
      topmark: text(t['seamark:topmark:shape']),
      light: lightOf(t),
      name: text(t['seamark:name']) ?? text(t.name) ?? text(t['seamark:ref']),
    };
    this.out.push({
      lat: Math.round((n.lat / 1e6) * COORD_DIGITS) / COORD_DIGITS,
      lon: Math.round((n.lon / 1e6) * COORD_DIGITS) / COORD_DIGITS,
      type,
      ...Object.fromEntries(Object.entries(optional).filter(([, v]) => v !== undefined)),
    });
  }

  finish(): Seamark[] {
    return this.out;
  }
}

export function buildSeamarks(lines: Iterable<string>): Seamark[] {
  const b = new SeamarkBuilder();
  for (const l of lines) b.add(l);
  return b.finish();
}
