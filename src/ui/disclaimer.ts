import { h } from './dom';

const KEY = 'plotter.disclaimer.ack';
const ACK_MS = 12 * 60 * 60 * 1000;

export const DISCLAIMER =
  'Navigation aid only. This app is not a substitute for official charts (e.g. Rijkswaterstaat / ANWB ' +
  'waterkaarten, Vaarweginformatie), the BPR/Scheepvaartreglement, local notices, or proper seamanship. ' +
  'GPS positions, map data and derived values may be wrong, delayed or unavailable. The skipper remains ' +
  'responsible at all times.';

// localStorage, not sessionStorage: Safari drops session writes when a crashed tab reloads,
// which brought the modal back mid-trip.
function acked(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(KEY) ?? 0) < ACK_MS;
  } catch {
    return false;
  }
}

/** Modal shown at most every 12 hours, plus a permanent footer notice. */
export function showDisclaimerOnce(force = false): void {
  if (!force && acked()) return;
  document.querySelector('.modal.disclaimer')?.remove();

  const dismiss = (e: Event) => {
    e.preventDefault();
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    dlg.remove();
  };
  // Dismiss on pointerup anywhere on the modal: a click can be lost on iOS while the map is busy.
  const dlg = h(
    'div',
    {
      class: 'modal disclaimer',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'disc-title',
      onpointerup: dismiss,
      onclick: dismiss,
    },
    h(
      'div',
      { class: 'modal-card' },
      h('h2', { id: 'disc-title' }, '⚠ Not for navigation'),
      h('p', null, DISCLAIMER),
      h('button', { class: 'btn primary block' }, 'I understand'),
    ),
  );
  document.body.append(dlg);
}
