import type { Language } from '../i18n';

const VOICE_LANG: Record<Language, string> = { en: 'en-GB', de: 'de-DE' };

/** Speaks a short prompt; a new prompt replaces one still being spoken. No-op where speech synthesis is missing. */
export function speak(text: string, lang: Language = 'en'): void {
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = VOICE_LANG[lang];
  speechSynthesis.speak(u);
}
