import type { CourseManeuver, Route, Waypoint } from '../core/model';
import type { RouteProgress } from '../core/navigation';
import { DEFAULT_SETTINGS } from '../settings';
import type { Fix, GpsStatus } from '../services/gps';
import type { DestinationCardApp } from '../ui/destination';
import type { InstrumentsApp } from '../ui/instruments';

export const makeFix = (over: Partial<Fix> = {}): Fix => ({
  lat: 52.3731,
  lon: 4.8922,
  accuracy: 6,
  sog: 5.2,
  cog: 84,
  time: Date.now(),
  ...over,
});

export const makeCardApp = (fix: Fix | null = makeFix()): DestinationCardApp => ({
  fix,
  settings: DEFAULT_SETTINGS,
  goStraight: async () => {},
  addWaypoint: async (p, _openEditor, name) => ({
    id: 'w',
    name: name ?? 'Waypoint',
    created: 0,
    ...p,
  }),
  addStop: async () => ({
    id: 'r',
    name: 'Route',
    waypointIds: [],
    created: 0,
  }),
});

const WAYPOINTS: Waypoint[] = [
  { id: 'a', name: 'Marina Muiderzand', lat: 52.37, lon: 4.89, created: 0 },
  { id: 'b', name: 'Schellingwoude bridge', lat: 52.38, lon: 4.99, created: 0 },
  { id: 'c', name: 'Jachthaven Aalsmeer', lat: 52.26, lon: 4.75, created: 0 },
];

export const LONG_MANEUVER =
  'Turn left onto Noordzeekanaal towards Amsterdam-Rijnkanaal, then keep right after the Schellingwoude bridge';

export interface GuidanceOptions {
  status?: GpsStatus;
  fix?: Fix | null;
  progress?: Partial<RouteProgress> | null;
  maneuver?: string | null;
  offCourse?: boolean;
  recalculating?: boolean;
}

export function makeGuidanceApp({
  status = 'ok',
  fix = makeFix(),
  progress = {},
  maneuver = null,
  offCourse = false,
  recalculating = false,
}: GuidanceOptions = {}): InstrumentsApp {
  const route: Route = {
    id: 'r',
    name: 'Amsterdam to Aalsmeer',
    waypointIds: WAYPOINTS.map((w) => w.id),
    created: 0,
  };
  const turn: CourseManeuver | null = maneuver
    ? {
        type: 'turn-left',
        lat: 52.38,
        lon: 4.99,
        dist: 3000,
        text: maneuver,
        wp: 'b',
      }
    : null;
  return {
    fix,
    gpsStatus: status,
    settings: { ...DEFAULT_SETTINGS, activeRouteId: route.id },
    progress: progress && {
      nextIndex: 1,
      dtw: 1250,
      btw: 84,
      remaining: 15400,
      ttg: 3600,
      ttgNext: 900,
      xte: 12,
      vmg: 2.1,
      steer: 12,
      finished: false,
      ...progress,
    },
    activeRoute: route,
    offCourse,
    recalculating,
    routePoints: () => WAYPOINTS,
    nextManeuver: () => turn,
    updateSettings: async () => {},
    stopNavigation: async () => {},
    recalculate: async () => {},
  };
}
