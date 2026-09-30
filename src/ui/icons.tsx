import type { ManeuverType } from '../core/routing';
import type { PlaceKind } from '../core/waterway-data';

const Svg = ({ d, className }: { d: string; className: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    width="24"
    height="24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

const MANEUVER: Record<ManeuverType, string> = {
  depart: 'M12 4 L18 19 L12 16 L6 19 Z',
  'turn-left': `M19 21 V11 a4 4 0 0 0 -4 -4 H5 M9 3 L5 7 L9 11`,
  'turn-right': `M5 21 V11 a4 4 0 0 1 4 -4 H19 M15 3 L19 7 L15 11`,
  'slight-left': 'M15 21 V14 L8 7 M8 13 V7 H14',
  'slight-right': 'M9 21 V14 L16 7 M16 13 V7 H10',
  'sharp-left': 'M18 21 V9 a4 4 0 0 0 -8 0 V14 M6 11 L10 15 L14 11',
  'sharp-right': 'M6 21 V9 a4 4 0 0 1 8 0 V14 M18 11 L14 15 L10 11',
  continue: 'M12 21 V5 M6 11 L12 5 L18 11',
  via: 'M12 7 a5 5 0 1 0 0.01 0 Z',
  lock: 'M4 5 V19 M20 5 V19 M4 12 H20 M8 9 V15 M16 9 V15',
  'bridge-open': 'M3 19 H21 M6 19 L11 6 M18 19 L13 6',
  'bridge-fixed': 'M3 18 H21 M3 18 Q12 2 21 18',
  arrive: 'M6 21 V4 M6 5 H18 L15 9 L18 13 H6',
};

/** Icon for a maneuver, in a span of class `className`. */
export function ManeuverIcon({ type, className }: { type: ManeuverType; className: string }) {
  return (
    <span className={className}>
      <Svg d={MANEUVER[type] ?? MANEUVER.continue} className="ico mi" />
    </span>
  );
}

const KIND: Record<PlaceKind, string> = {
  harbour: 'M12 4 a2 2 0 1 0 0.01 0 M12 8 V20 M6 13 H18 M5 16 Q7 20 12 20 Q17 20 19 16',
  marina: 'M12 4 a2 2 0 1 0 0.01 0 M12 8 V20 M6 13 H18 M5 16 Q7 20 12 20 Q17 20 19 16',
  mooring: 'M12 4 a2 2 0 1 0 0.01 0 M12 8 V20 M6 13 H18 M5 16 Q7 20 12 20 Q17 20 19 16',
  lock: MANEUVER.lock,
  bridge: MANEUVER['bridge-fixed'],
  city: 'M4 20 V9 L9 5 V20 M9 20 V12 H15 V20 M15 20 V8 L20 12 V20 M3 20 H21',
  town: 'M4 20 V11 L12 4 L20 11 V20 Z',
  village: 'M5 20 V12 L12 6 L19 12 V20 Z',
  waterway: 'M3 9 q3 -3 6 0 t6 0 t6 0 M3 15 q3 -3 6 0 t6 0 t6 0',
  waypoint: MANEUVER.arrive,
};

/** Every kind of place, in the order the icons are drawn; `t(`kind.${kind}`)` names one. */
export const PLACE_KINDS = Object.keys(KIND) as PlaceKind[];

/** Icon for a kind of place, in a span of class `className`. */
export function KindIcon({ kind, className }: { kind: PlaceKind; className: string }) {
  return (
    <span className={className}>
      <Svg d={KIND[kind] ?? KIND.waypoint} className="ico ki" />
    </span>
  );
}

const CHROME = {
  grid: 'M6 4h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M15 4h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M6 13h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z M15 13h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z',
  x: 'M6 6l12 12M18 6 6 18',
  search: 'M11 4a7 7 0 1 0 0.01 0z M16.5 16.5 21 21',
  target: 'M12 5a7 7 0 1 0 0.01 0z M12 2v4M12 18v4M2 12h4M18 12h4',
  route: 'M5 21V4 M5 4h12l-2.5 4 2.5 4H5',
  rec: 'M12 7a5 5 0 1 0 0.01 0z',
  anchor: 'M12 3a2 2 0 1 0 0.01 0z M12 7v14M5 13a7 7 0 0 0 14 0M8.5 10.5h7',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  sun: 'M12 8a4 4 0 1 0 0.01 0z M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9 M15 5a2 2 0 1 0 0.01 0z M9 15a2 2 0 1 0 0.01 0z',
  layers: 'm12 3 9 5-9 5-9-5 9-5z m-9 10 9 5 9-5',
  locate: 'M4 11 20 4l-7 16-2-7-7-2z',
  north: 'M12 3 16 12H8z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
};

export type IconName = keyof typeof CHROME;

/** A line icon of the screen's chrome: menu, map buttons and tools. */
export const Icon = ({ name }: { name: IconName }) => <Svg d={CHROME[name]} className={`ico ico-${name}`} />;
