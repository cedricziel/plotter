import type { LatLon } from './geo';
import type { Maneuver } from './routing';
import type { PlaceKind } from './waterway-data';

export interface Waypoint extends LatLon {
  id: string;
  name: string;
  created: number;
  /** a maneuver point of a charted course: not listed or drawn as a waypoint */
  hidden?: boolean;
}

/** A maneuver of a charted course; `wp` is the waypoint placed at it. */
export interface CourseManeuver extends Maneuver {
  wp?: string;
}

export interface CourseDestination extends LatLon {
  name: string;
  kind?: PlaceKind;
}

export interface Route {
  id: string;
  name: string;
  /** ordered waypoint ids */
  waypointIds: string[];
  created: number;
  /** charted course: the line to follow as [lon, lat], drawn instead of straight legs */
  shape?: [number, number][];
  maneuvers?: CourseManeuver[];
  dest?: CourseDestination;
  warnings?: string[];
  /** where the course came from: the routing service or a saved corridor */
  source?: 'online' | 'offline';
  /** the saved corridor holding this course's map tiles and graph */
  tripId?: string;
}

export interface TrackPoint extends LatLon {
  /** epoch ms */
  time: number;
  /** m/s, if known */
  speed?: number | null;
  ele?: number | null;
}

export interface Track {
  id: string;
  name: string;
  points: TrackPoint[];
  started: number;
  ended?: number;
}

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
