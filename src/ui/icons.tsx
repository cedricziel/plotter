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

export const KIND_LABEL: Record<PlaceKind, string> = {
  harbour: 'Harbour',
  marina: 'Marina',
  mooring: 'Mooring',
  lock: 'Lock',
  bridge: 'Bridge',
  city: 'City',
  town: 'Town',
  village: 'Village',
  waterway: 'Waterway',
  waypoint: 'Waypoint',
};

/** Icon for a kind of place, in a span of class `className`. */
export function KindIcon({ kind, className }: { kind: PlaceKind; className: string }) {
  return (
    <span className={className}>
      <Svg d={KIND[kind] ?? KIND.waypoint} className="ico ki" />
    </span>
  );
}
