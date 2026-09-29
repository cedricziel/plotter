import type { AlarmReason } from '../core/anchor';
import type { Place, Seamark } from '../core/waterway-data';
import { hasKey, t, type MessageKey } from './index';

/** What a place is: a bridge by whether it opens, otherwise its kind. */
export function placeLabel(place: Pick<Place, 'kind' | 'info'>): string {
  const canOpen = place.info?.canOpen;
  if (canOpen !== undefined) return t(canOpen ? 'place.openingBridge' : 'place.fixedBridge');
  return t(`kind.${place.kind}`);
}

export function alarmText(reason: AlarmReason): string {
  return reason.kind === 'gps-lost'
    ? t('alarm.gpsLost')
    : t('alarm.drag', { distance: Math.round(reason.distance), radius: reason.radius });
}

const SEAMARK_ROWS: Record<string, MessageKey> = {
  Name: 'seamark.name',
  Colour: 'seamark.colour',
  Topmark: 'seamark.topmark',
  Light: 'seamark.light',
};

/** A seamark row label from `seamarkRows` in the current language. */
export const seamarkRowLabel = (label: string): string => (label in SEAMARK_ROWS ? t(SEAMARK_ROWS[label]) : label);

/** The kind of a seamark; its category stays as the data has it. Unknown kinds keep the English fallback. */
export function seamarkKind(s: Seamark, fallback: string): string {
  const key = `seamark.${s.type}`;
  if (!hasKey(key)) return fallback;
  return s.category ? `${t(key)}, ${s.category.replaceAll('_', ' ')}` : t(key);
}
