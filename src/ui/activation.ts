/**
 * Events that give the page a user gesture, which wake locks and audio need.
 * On a touch screen that is the finger lifting: `pointerdown` and `touchstart`
 * do not count.
 */
const EVENTS = ['pointerup', 'touchend', 'click', 'keydown'];

/** Calls `fn` on every user gesture on `target`; returns a function that stops listening. */
export function onUserActivation(target: EventTarget, fn: () => void): () => void {
  for (const type of EVENTS) target.addEventListener(type, fn, { passive: true });
  return () => {
    for (const type of EVENTS) target.removeEventListener(type, fn);
  };
}
