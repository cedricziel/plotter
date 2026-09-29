import type { SyntheticEvent } from 'react';
import { t } from '../i18n';
import { createStore, useLanguage, useStore } from './store';

const KEY = 'plotter.disclaimer.ack';
const ACK_MS = 12 * 60 * 60 * 1000;

export const disclaimerText = () => t('disclaimer.text');

// localStorage, not sessionStorage: Safari drops session writes when a crashed tab reloads,
// which brought the modal back mid-trip.
function acked(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(KEY) ?? 0) < ACK_MS;
  } catch {
    return false;
  }
}

export const disclaimerState = createStore<'hidden' | 'open' | 'closing'>('hidden');

/** Modal shown at most every 12 hours, plus a permanent footer notice. */
export function showDisclaimerOnce(force = false): void {
  if (!force && acked()) return;
  disclaimerState.set('open');
}

function dismiss(e: SyntheticEvent) {
  e.preventDefault();
  e.stopPropagation();
  if (disclaimerState.get() === 'closing') return disclaimerState.set('hidden');
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  // Keep the invisible modal for a moment so the click that follows a pointerup cannot reach the chart.
  disclaimerState.set('closing');
  setTimeout(() => {
    if (disclaimerState.get() === 'closing') disclaimerState.set('hidden');
  }, 500);
}

/** The not-for-navigation modal, while `showDisclaimerOnce()` asks for it or always with `open`. */
export function Disclaimer({ open = false }: { open?: boolean }) {
  // Shown before the App has loaded, outside the shell's re-renders.
  useLanguage();
  const shown = useStore(disclaimerState);
  const state = open && shown === 'hidden' ? 'open' : shown;
  if (state === 'hidden') return null;
  // Dismiss on pointerup anywhere on the modal: a click can be lost on iOS while the map is busy.
  return (
    <div
      className={`modal disclaimer${state === 'closing' ? ' closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="disc-title"
      onPointerUp={dismiss}
      onClick={dismiss}
    >
      <div className="modal-card">
        <h2 id="disc-title">{t('disclaimer.title')}</h2>
        <p>{disclaimerText()}</p>
        <button className="btn primary block">{t('disclaimer.ok')}</button>
      </div>
    </div>
  );
}
