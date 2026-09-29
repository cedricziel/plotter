import { afterEach, describe, expect, it, vi } from 'vitest';
import { language, num, plural, resolveLanguage, setLanguage, t } from '../src/i18n';
import { de } from '../src/i18n/de';
import { en } from '../src/i18n/en';

const store = new Map<string, unknown>();
vi.mock('../src/services/db', () => ({
  getKv: async (key: string) => store.get(key),
  setKv: async (key: string, value: unknown) => void store.set(key, value),
}));
const { DEFAULT_SETTINGS, loadSettings, saveSettings } = await import('../src/settings');

describe('resolveLanguage', () => {
  it('picks German when German comes before English', () => {
    expect(resolveLanguage('auto', ['de-DE', 'en-US'])).toBe('de');
    expect(resolveLanguage('auto', ['de'])).toBe('de');
  });

  it('picks English when English comes first among the two', () => {
    expect(resolveLanguage('auto', ['nl-NL', 'en-GB', 'de-DE'])).toBe('en');
  });

  it('falls back to English when neither is preferred', () => {
    expect(resolveLanguage('auto', ['fr-FR'])).toBe('en');
    expect(resolveLanguage('auto', [])).toBe('en');
  });

  it('lets an explicit choice win over the device', () => {
    expect(resolveLanguage('en', ['de-DE'])).toBe('en');
    expect(resolveLanguage('de', ['en-US', 'fr-FR'])).toBe('de');
  });
});

describe('language', () => {
  afterEach(() => setLanguage('en'));

  it('starts in English and switches', () => {
    expect(language()).toBe('en');
    setLanguage('de');
    expect(language()).toBe('de');
  });
});

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dictionaries', () => {
  const keys = Object.keys(en) as (keyof typeof en)[];

  it('has every English key in German', () => {
    expect(Object.keys(de).sort()).toEqual([...keys].sort());
  });

  it('has no empty German text', () => {
    expect(keys.filter((k) => !de[k]?.trim())).toEqual([]);
  });

  it('uses the same placeholders in both languages', () => {
    expect(keys.filter((k) => placeholders(en[k]).join() !== placeholders(de[k]).join())).toEqual([]);
  });
});

describe('t', () => {
  afterEach(() => setLanguage('en'));

  it('looks up the current language', () => {
    expect(t('toolbar.anchor')).toBe('Anchor');
    setLanguage('de');
    expect(t('toolbar.anchor')).toBe('Anker');
  });

  it('fills in placeholders and leaves unknown ones', () => {
    setLanguage('de');
    expect(t('maneuver.turn-left.named', { name: 'IJ' })).toBe('Links abbiegen in IJ');
    expect(t('maneuver.turn-left.named')).toBe('Links abbiegen in {name}');
  });

  it('formats a number with fixed decimals in the current language', () => {
    expect(num(2.345, 1)).toBe('2.3');
    setLanguage('de');
    expect(num(2.345, 1)).toBe('2,3');
    expect(num(1250, 0)).toBe('1250');
  });

  it('picks the one or other form by count', () => {
    expect(plural('track.points', 1)).toBe('1 pt');
    expect(plural('track.points', 12)).toBe('12 pts');
    setLanguage('de');
    expect(plural('track.points', 1)).toBe('1 Punkt');
    expect(plural('track.points', 0)).toBe('0 Punkte');
  });
});

describe('language setting', () => {
  afterEach(() => store.clear());

  it('defaults to Auto, also for settings stored before it existed', async () => {
    expect(DEFAULT_SETTINGS.language).toBe('auto');
    store.set('settings', { theme: 'night' });
    expect(await loadSettings()).toMatchObject({ theme: 'night', language: 'auto' });
  });

  it('keeps an explicit choice', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, language: 'de' });
    expect((await loadSettings()).language).toBe('de');
  });
});
