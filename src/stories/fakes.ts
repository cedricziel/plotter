import type { AlarmReason } from '../core/anchor';
import type { CourseManeuver, Route, Waypoint } from '../core/model';
import type { RouteProgress } from '../core/navigation';
import { DEFAULT_SETTINGS, type Settings } from '../settings';
import type { Fix, GpsStatus } from '../services/gps';
import type { App } from '../app';
import type { DestinationCardApp } from '../ui/destination';
import type { InstrumentsApp } from '../ui/instruments';
import type { ScreenApp } from '../ui/screen';

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

export const makeSearchApp = (fix: Fix | null = makeFix()): App =>
  ({
    fix,
    settings: DEFAULT_SETTINGS,
    recents: [],
    waypoints: new Map(),
    trips: [],
    map: {
      getCenter: () => ({ lat: fix?.lat ?? 52.37, lng: fix?.lon ?? 4.89 }),
    },
  }) as unknown as App;

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
  /** A text alone is a maneuver stored before the router sent names; fields make a structured one. */
  maneuver?: string | Partial<CourseManeuver> | null;
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
        text: typeof maneuver === 'string' ? maneuver : '',
        wp: 'b',
        ...(typeof maneuver === 'string' ? {} : { name: null, ...maneuver }),
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
    routePoints: (r) => (r ? WAYPOINTS : []),
    nextManeuver: () => turn,
    updateSettings: async () => {},
    stopNavigation: async () => {},
    recalculate: async () => {},
  };
}

const NOOP = async () => {};

/** Everything the sheet panels read or call; actions are inert. Cast per panel with its `Pick<App, …>` props. */
export function makePanelApp(over: Record<string, unknown> = {}) {
  return {
    fix: makeFix(),
    settings: { ...DEFAULT_SETTINGS },
    basemap: 'pmtiles',
    gpsStatus: 'ok',
    gpsMessage: '',
    waypoints: new Map(WAYPOINTS.map((w) => [w.id, w])),
    routes: new Map([[ACTIVE_ROUTE.id, ACTIVE_ROUTE]]),
    activeRoute: null as Route | null,
    progress: null,
    trips: [],
    tracks: new Map(),
    recording: null,
    anchor: null,
    anchorCheck: null,
    offline: null,
    recalculating: false,
    wakeLock: { active: true, supported: true },
    map: { easeTo() {}, getZoom: () => 12, getCenter: () => ({ lat: 52.37, lng: 4.89 }) },
    routePoints: (r: Route | null) => (r ? WAYPOINTS : []),
    updateSettings: NOOP,
    updateWaypoint: NOOP,
    createRoute: NOOP,
    stopNavigation: NOOP,
    setNextIndex() {},
    saveRoute: NOOP,
    deleteRoute: NOOP,
    deleteTrip: NOOP,
    deleteWaypoint: NOOP,
    deleteTrack: NOOP,
    renameTrack: NOOP,
    recalculate: NOOP,
    saveForOffline: NOOP,
    setFollow() {},
    goTo: NOOP,
    startRecording: NOOP,
    stopRecording: NOOP,
    setAnchor: NOOP,
    setAnchorRadius: NOOP,
    armAnchor: NOOP,
    clearAnchor: NOOP,
    enableCompass: NOOP,
    importData: NOOP,
    ...over,
  };
}

export const ACTIVE_ROUTE: Route = {
  id: 'r',
  name: 'Amsterdam to Aalsmeer',
  waypointIds: WAYPOINTS.map((w) => w.id),
  created: 0,
};

export interface ScreenOptions extends GuidanceOptions {
  follow?: boolean;
  recording?: boolean;
  anchorArmed?: boolean;
  alarmReason?: AlarmReason | null;
  route?: boolean;
  settings?: Partial<Settings>;
}

/** Everything a whole screen reads: guidance, panels and chrome; actions are inert. */
export function makeScreenApp({
  follow = false,
  recording = false,
  anchorArmed = false,
  alarmReason = null,
  route = false,
  settings = {},
  ...guidance
}: ScreenOptions = {}): ScreenApp & ReturnType<typeof makePanelApp> {
  const g = makeGuidanceApp(route ? guidance : { progress: null, ...guidance });
  const panel = makePanelApp({ fix: g.fix, gpsStatus: g.gpsStatus, progress: g.progress });
  return {
    ...panel,
    ...g,
    activeRoute: route ? g.activeRoute : null,
    settings: { ...g.settings, ...(route ? {} : { activeRouteId: null }), ...settings },
    follow,
    recording: recording ? { id: 't', name: 'Now', started: Date.now() - 3_600_000, points: [] } : null,
    anchor: anchorArmed ? { lat: 52.3731, lon: 4.8922, radius: 40, armed: true } : null,
    alarmReason,
    silenceAlarm() {},
    armAnchor: NOOP,
  } as ScreenApp & ReturnType<typeof makePanelApp>;
}
