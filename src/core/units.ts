import { METERS_PER_NM } from './geo';

export type SpeedUnit = 'kmh' | 'kn';
export type DistanceUnit = 'metric' | 'nautical';

export const MPS_TO_KMH = 3.6;
export const MPS_TO_KN = 3600 / METERS_PER_NM;

export function convertSpeed(mps: number, unit: SpeedUnit): number {
  return unit === 'kn' ? mps * MPS_TO_KN : mps * MPS_TO_KMH;
}

export function formatSpeed(mps: number | null | undefined, unit: SpeedUnit): string {
  if (mps == null || !Number.isFinite(mps)) return '--.-';
  return convertSpeed(Math.max(0, mps), unit).toFixed(1);
}

export const speedLabel = (unit: SpeedUnit) => (unit === 'kn' ? 'kn' : 'km/h');

export function formatDistance(m: number | null | undefined, unit: DistanceUnit): string {
  if (m == null || !Number.isFinite(m)) return '--';
  if (unit === 'nautical') {
    const nm = m / METERS_PER_NM;
    return nm < 0.1 ? `${Math.round(m)} m` : `${nm.toFixed(nm < 10 ? 2 : 1)} NM`;
  }
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 2 : 1)} km`;
}

export function formatBearing(deg: number | null | undefined): string {
  if (deg == null || !Number.isFinite(deg)) return '---°';
  return `${String(Math.round(deg) % 360).padStart(3, '0')}°`;
}

/** Degrees + decimal minutes, e.g. 52°22.345′N — the convention on board. */
export function formatCoord(value: number, axis: 'lat' | 'lon'): string {
  const hemi = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  let min = (abs - deg) * 60;
  if (Number(min.toFixed(3)) >= 60) {
    deg += 1;
    min = 0;
  }
  const degStr = String(deg).padStart(axis === 'lat' ? 2 : 3, '0');
  return `${degStr}°${min.toFixed(3).padStart(6, '0')}′${hemi}`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '--:--';
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

export function formatTime(d: Date | null): string {
  if (!d) return '--:--';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}
