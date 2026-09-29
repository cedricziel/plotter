import type { Maneuver } from '../core/routing';
import { language, num, plural, t, type MessageKey } from './index';

/**
 * The maneuver in the current language, from its type and name. A maneuver stored before the router sent names
 * (no `name` field at all) keeps its English text; `name: null` is a structured maneuver without a name.
 */
export function maneuverText(m: Maneuver): string {
  if (!('name' in m)) return m.text;
  const named = m.name ? '.named' : '';
  const params = { name: m.name ?? '', stop: m.stop ?? '', clearance: '' };
  if (m.type === 'via') return t('maneuver.via', params);
  if (m.type === 'bridge-fixed') {
    if (m.clearance == null) return t(`maneuver.bridge-fixed${named}.unknown` as MessageKey, params);
    params.clearance = `${num(m.clearance / 100, 1)} m`;
  }
  return t(`maneuver.${m.type}${named}` as MessageKey, params);
}

// German capitalises nouns only: a maneuver that opens with an adverb or adjective goes lower case mid-sentence.
const GERMAN_LOWER = /^(Links|Rechts|Leicht|Scharf|Weiter|Geradeaus|Feste)\b/;

/** The spoken prompt for a maneuver `metres` ahead, in the current language. */
export function announcement(metres: 100 | 500, text: string): string {
  const said = language() === 'de' && GERMAN_LOWER.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
  return t('voice.in', { metres, text: said });
}

const UNKNOWN_BRIDGES = /^(\d+) fixed bridges? with unknown clearance$/;

/** A route warning in the current language; the router writes them in English, so known ones are matched. */
export function warningText(warning: string): string {
  const bridges = UNKNOWN_BRIDGES.exec(warning);
  return bridges ? plural('course.unknownBridges', Number(bridges[1])) : warning;
}
