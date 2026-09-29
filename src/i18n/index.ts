import { fixed } from '../core/units';
import { de } from './de';
import { en } from './en';

export type Language = 'en' | 'de';
export type LanguageChoice = 'auto' | Language;
export type MessageKey = keyof typeof en;
/** Keys with a `.one` and `.other` form, without the suffix. */
export type PluralKey = { [K in MessageKey]: K extends `${infer B}.one` ? B : never }[MessageKey];
type Params = Record<string, string | number>;

export const LANGUAGES: Language[] = ['en', 'de'];

const DICTIONARIES: Record<Language, Record<MessageKey, string>> = { en, de };

let current: Language = 'en';

export const language = (): Language => current;

export function setLanguage(lang: Language): void {
  current = lang;
}

/** An explicit choice wins; Auto takes the first of the device's preferred languages we have, else English. */
export function resolveLanguage(choice: LanguageChoice, preferred: readonly string[]): Language {
  if (choice !== 'auto') return choice;
  for (const tag of preferred) {
    const primary = tag.toLowerCase().split('-')[0];
    if ((LANGUAGES as string[]).includes(primary)) return primary as Language;
  }
  return 'en';
}

/** The text for `key` in the current language, with `{placeholders}` filled from `params`. */
export function t(key: MessageKey, params?: Params): string {
  const text = DICTIONARIES[current][key] ?? en[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (all, name: string) => (name in params ? String(params[name]) : all));
}

const pluralRules = new Map<Language, Intl.PluralRules>();

/** The `.one` or `.other` form of `key` for `count`, which also fills `{count}`. */
export function plural(key: PluralKey, count: number, params?: Params): string {
  let rules = pluralRules.get(current);
  if (!rules) pluralRules.set(current, (rules = new Intl.PluralRules(current)));
  const form = rules.select(count) === 'one' ? 'one' : 'other';
  return t(`${key}.${form}` as MessageKey, { count, ...params });
}

/** `value` with `digits` decimals and the current language's decimal mark. */
export const num = (value: number, digits: number): string => fixed(value, digits, current);
