import type { Seamark } from './waterway-data';

/** Sort order when a list is cut: buoys and beacons first, then lights, then notices. */
export const seamarkRank = (s: Seamark): number => (s.type.startsWith('light_') ? 1 : s.type === 'notice' ? 2 : 0);
