/** Wire format of the Vaarweginformatie extract (`fis-<generation>.json`). Coordinates in degrees, lengths in metres. */

export const FIS_FORMAT_VERSION = 1;
export const FIS_SOURCE = 'vaarweginformatie';
export const FIS_ATTRIBUTION = '© Rijkswaterstaat / Vaarweginformatie.nl';

export const NL_BBOX = { minLat: 50.6, maxLat: 53.8, minLon: 3.0, maxLon: 7.4 };

export interface FisBridge {
  name: string;
  lat: number;
  lon: number;
  canOpen: boolean;
  /** closed clearance, lowest of the passages */
  clearance?: number;
  /** widest passage */
  width?: number;
  /** VHF channels, "22/69" */
  vhf?: string;
  /** operating note */
  hours?: string;
}

export interface FisLock {
  name: string;
  lat: number;
  lon: number;
  chambers?: number;
  vhf?: string;
  hours?: string;
}

export interface FisBerth {
  name: string;
  lat: number;
  lon: number;
}

export interface FisFile {
  version: typeof FIS_FORMAT_VERSION;
  generation: number;
  published: string;
  built: string;
  source: string;
  bridges: FisBridge[];
  locks: FisLock[];
  berths: FisBerth[];
}
