/** Speaks a short prompt; a new prompt replaces one still being spoken. No-op where speech synthesis is missing. */
export function speak(text: string): void {
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-GB';
  speechSynthesis.speak(u);
}
