import type { Seamark } from './waterway-data';

export type SymbolBody = 'buoy' | 'beacon' | 'light' | 'notice';
export type BuoyShape = 'can' | 'cone' | 'sphere' | 'pillar' | 'spar' | 'barrel';
export type Topmark =
  | 'cone-up'
  | 'cone-down'
  | 'cones-up'
  | 'cones-down'
  | 'cones-base'
  | 'cones-point'
  | 'cylinder'
  | 'sphere'
  | 'spheres'
  | 'x';

/** What a seamark looks like on the chart: enough to draw it, and nothing that tells two marks apart. */
export interface SymbolSpec {
  body: SymbolBody;
  shape?: BuoyShape;
  /** colour names, top to bottom */
  bands: string[];
  topmark?: Topmark;
}

type Side = 'left' | 'right' | 'pref-left' | 'pref-right';

const MAX_BANDS = 4;
const COLOURS = new Set(['red', 'green', 'yellow', 'black', 'white', 'blue', 'orange']);
const SIDE: Record<string, Side> = {
  port: 'left',
  waterway_left: 'left',
  harbour_left: 'left',
  danger_left: 'left',
  channel_left: 'left',
  starboard: 'right',
  waterway_right: 'right',
  harbour_right: 'right',
  danger_right: 'right',
  channel_right: 'right',
  preferred_channel_port: 'pref-left',
  preferred_channel_starboard: 'pref-right',
};
const SIDE_BANDS: Record<Side, string[]> = {
  left: ['red'],
  right: ['green'],
  'pref-left': ['red', 'green', 'red'],
  'pref-right': ['green', 'red', 'green'],
};
const SIDE_SHAPE: Record<Side, BuoyShape> = {
  left: 'can',
  right: 'cone',
  'pref-left': 'can',
  'pref-right': 'cone',
};
const CARDINAL: Record<string, { bands: string[]; topmark: Topmark }> = {
  north: { bands: ['black', 'yellow'], topmark: 'cones-up' },
  east: { bands: ['black', 'yellow', 'black'], topmark: 'cones-base' },
  south: { bands: ['yellow', 'black'], topmark: 'cones-down' },
  west: { bands: ['yellow', 'black', 'yellow'], topmark: 'cones-point' },
};
const SHAPES: Record<string, BuoyShape> = {
  can: 'can',
  conical: 'cone',
  spherical: 'sphere',
  pillar: 'pillar',
  spar: 'spar',
  barrel: 'barrel',
};
const TOPMARKS: [RegExp, Topmark][] = [
  [/^2 cones up/, 'cones-up'],
  [/^2 cones down/, 'cones-down'],
  [/^2 cones base/, 'cones-base'],
  [/^2 cones point/, 'cones-point'],
  [/^2 spheres/, 'spheres'],
  [/^cone,? point up/, 'cone-up'],
  [/^cone,? point down/, 'cone-down'],
  [/^cylinder/, 'cylinder'],
  [/^sphere/, 'sphere'],
  [/^x-?shape|^cross/, 'x'],
];
const KIND_LABEL: Record<string, string> = {
  buoy_lateral: 'Lateral buoy',
  buoy_cardinal: 'Cardinal buoy',
  buoy_isolated_danger: 'Isolated danger buoy',
  buoy_safe_water: 'Safe water buoy',
  buoy_special_purpose: 'Special purpose buoy',
  beacon_lateral: 'Lateral beacon',
  beacon_cardinal: 'Cardinal beacon',
  beacon_isolated_danger: 'Isolated danger beacon',
  beacon_safe_water: 'Safe water beacon',
  beacon_special_purpose: 'Special purpose beacon',
  light_minor: 'Light',
  light_major: 'Major light',
  light_float: 'Light float',
  light_vessel: 'Light vessel',
  notice: 'Notice',
};

const words = (s: string) => s.replaceAll('_', ' ');

function bandsOf(colour: string | undefined): string[] {
  return (colour ?? '')
    .split(';')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, MAX_BANDS)
    .map((c) => (COLOURS.has(c) ? c : 'grey'));
}

function topmarkOf(text: string | undefined): Topmark | undefined {
  const t = text?.trim().toLowerCase();
  return t ? TOPMARKS.find(([re]) => re.test(t))?.[1] : undefined;
}

function classOf(type: string): string {
  return type.replace(/^(buoy|beacon)_/, '');
}

export function symbolSpec(s: Seamark): SymbolSpec {
  if (s.type.startsWith('light_')) return { body: 'light', bands: [] };
  if (s.type === 'notice') return { body: 'notice', bands: [] };
  const body: SymbolBody = s.type.startsWith('beacon_') ? 'beacon' : 'buoy';
  const kind = classOf(s.type);
  const side = kind === 'lateral' ? SIDE[s.category ?? ''] : undefined;
  const cardinal = kind === 'cardinal' ? CARDINAL[s.category ?? ''] : undefined;
  let bands = bandsOf(s.colour);
  let shape: BuoyShape | undefined = SHAPES[s.shape ?? ''];
  let topmark = topmarkOf(s.topmark);

  if (side && bands.every((b) => b === 'grey')) bands = SIDE_BANDS[side];
  if (cardinal) {
    if (!bands.length) bands = cardinal.bands;
    topmark ??= cardinal.topmark;
    shape ??= 'pillar';
  }
  if (kind === 'isolated_danger') {
    if (!bands.length) bands = ['black', 'red', 'black'];
    topmark ??= 'spheres';
    shape ??= 'pillar';
  }
  if (kind === 'safe_water') {
    if (!bands.length) bands = ['red', 'white'];
    topmark ??= 'sphere';
    shape ??= 'sphere';
  }
  if (kind === 'special_purpose') {
    if (!bands.length) bands = ['yellow'];
    topmark ??= 'x';
    shape ??= 'barrel';
  }
  if (side) shape ??= SIDE_SHAPE[side];
  if (!bands.length) bands = ['grey'];
  shape ??= 'pillar';
  return {
    body,
    ...(body === 'buoy' ? { shape } : {}),
    bands,
    ...(topmark ? { topmark } : {}),
  };
}

export const symbolKey = (spec: SymbolSpec): string =>
  [spec.body, spec.shape ?? '', spec.bands.join('.'), spec.topmark ?? ''].join('|');

export function kindLabel(s: Seamark): string {
  const kind = KIND_LABEL[s.type] ?? words(s.type).replace(/^./, (c) => c.toUpperCase());
  return s.category ? `${kind}, ${words(s.category)}` : kind;
}

/** The label and value pairs a seamark card shows; details the mark lacks are left out. */
export function seamarkRows(s: Seamark): [string, string][] {
  const rows: [string, string | undefined][] = [
    ['Name', s.name],
    ['Colour', s.colour?.split(';').join(', ')],
    ['Topmark', s.topmark],
    ['Light', s.light],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]);
}
