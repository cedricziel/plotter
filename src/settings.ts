import type { DistanceUnit, SpeedUnit } from './core/units';
import type { Theme } from './map/style';
import { DEFAULT_CHART_URL } from './services/chart';
import { getKv, setKv } from './services/db';

export type CogMinutes = 0 | 5 | 10 | 30;

export interface Settings {
  speedUnit: SpeedUnit;
  distanceUnit: DistanceUnit;
  cogMinutes: CogMinutes;
  theme: Theme;
  seamarks: boolean;
  keepAwake: boolean;
  showTracks: boolean;
  pmtilesUrl: string;
  glyphsUrl: string;
  activeRouteId: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  speedUnit: 'kmh',
  distanceUnit: 'metric',
  cogMinutes: 10,
  theme: 'day',
  seamarks: true,
  keepAwake: true,
  showTracks: true,
  pmtilesUrl: import.meta.env.VITE_PMTILES_URL || DEFAULT_CHART_URL,
  // Latin glyph ranges are bundled in public/fonts so labels work offline.
  glyphsUrl: import.meta.env.VITE_GLYPHS_URL || './fonts/{fontstack}/{range}.pbf',
  activeRouteId: null,
};

export async function loadSettings(): Promise<Settings> {
  const stored = await getKv<Partial<Settings>>('settings').catch(() => undefined);
  // glyphsUrl is not user-editable; always take the current default.
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}), glyphsUrl: DEFAULT_SETTINGS.glyphsUrl };
}

export const saveSettings = (s: Settings) => setKv('settings', s);

/** Resolve a possibly relative URL against the page, keeping {placeholders} intact. */
export function absUrl(u: string): string {
  return new URL(u, location.href).href.replace(/%7B/gi, '{').replace(/%7D/gi, '}');
}
