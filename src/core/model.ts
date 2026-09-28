import type { LatLon } from './geo';

export interface Waypoint extends LatLon {
  id: string;
  name: string;
  created: number;
}

export interface Route {
  id: string;
  name: string;
  /** ordered waypoint ids */
  waypointIds: string[];
  created: number;
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
