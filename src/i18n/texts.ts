import type { AlarmReason } from '../core/anchor';
import type { ApiErrorBody, CourseWarning } from '../core/api';
import type { Place, Seamark } from '../core/waterway-data';
import { hasKey, plural, t, type MessageKey } from './index';

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

const UNKNOWN_BRIDGES = /^(\d+) fixed bridges? with unknown clearance$/;

/**
 * A route warning in the current language. A coded one is worded from its code; a plain string, from an older server
 * or a route saved before codes, is matched against the one warning the router used to send.
 */
export function warningText(warning: CourseWarning): string {
  if (typeof warning === 'string') {
    const bridges = UNKNOWN_BRIDGES.exec(warning);
    return bridges ? plural('course.unknownBridges', Number(bridges[1])) : warning;
  }
  if (warning.code === 'unknown-clearance') return plural('course.unknownBridges', Number(warning.params?.count));
  return warning.text;
}

const ERRORS: Record<string, MessageKey> = {
  'no-snap-start': 'error.noSnapStart',
  'no-snap-destination': 'error.noSnapDestination',
  unreachable: 'error.unreachable',
  blocked: 'error.blocked',
  'rate-limited': 'error.rateLimited',
  'bad-request': 'error.badRequest',
  'outside-area': 'error.outsideArea',
  'not-ready': 'plan.noData',
  'not-found': 'error.notFound',
  internal: 'error.internal',
  'corridor-too-large': 'error.corridorTooLarge',
  'corridor-too-long': 'error.corridorTooLong',
};

/** A server error in the current language, or its English text when the code is unknown or missing. */
export function errorText(body: ApiErrorBody): string {
  const key = body.code && Object.hasOwn(ERRORS, body.code) ? ERRORS[body.code] : undefined;
  return key ? t(key, body.params) : body.error;
}
