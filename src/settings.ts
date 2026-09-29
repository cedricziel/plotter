import type { Orientation } from './core/camera';
import type { DistanceUnit, SpeedUnit } from './core/units';
import type { LanguageChoice } from './i18n';
import type { Theme } from './map/style';
import { DEFAULT_CHART_URL } from './services/chart';
import { getKv, setKv } from './services/db';

export type CogMinutes = 0 | 5 | 10 | 30;

export interface Settings {
  /** 'auto' follows the device's preferred languages */
  language: LanguageChoice;
  speedUnit: SpeedUnit;
  distanceUnit: DistanceUnit;
  cogMinutes: CogMinutes;
  theme: Theme;
  /** vector seamark symbols; the seamarks button toggles it */
  seamarks: boolean;
  /** OpenSeaMap raster tiles from the network */
  openseamap: boolean;
  /** PDOK aerial photo from the network, day palette only */
  aerial: boolean;
  keepAwake: boolean;
  showTracks: boolean;
  pmtilesUrl: string;
  glyphsUrl: string;
  activeRouteId: string | null;
  /** metres; null = unknown */
  airDraft: number | null;
  draft: number | null;
  beam: number | null;
  /** m/s, used for ETA while the boat is (nearly) stationary */
  cruiseSpeed: number;
  voicePrompts: boolean;
  /** Map orientation while following a route. */
  orientation: Orientation;
  /** Point the ship symbol by the device compass, taking the top of the screen as the bow. */
  compass: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'auto',
  speedUnit: 'kmh',
  distanceUnit: 'metric',
  cogMinutes: 10,
  theme: 'day',
  seamarks: true,
  openseamap: false,
  aerial: false,
  keepAwake: true,
  showTracks: true,
  pmtilesUrl: import.meta.env.VITE_PMTILES_URL || DEFAULT_CHART_URL,
  // Latin glyph ranges are bundled in public/fonts so labels work offline.
  glyphsUrl: import.meta.env.VITE_GLYPHS_URL || './fonts/{fontstack}/{range}.pbf',
  activeRouteId: null,
  airDraft: null,
  draft: null,
  beam: null,
  cruiseSpeed: 2.5,
  voicePrompts: false,
  orientation: 'course',
  compass: false,
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
