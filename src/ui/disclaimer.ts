import { h } from './dom';

const KEY = 'plotter.disclaimer.ack';

export const DISCLAIMER =
  'Navigation aid only. This app is not a substitute for official charts (e.g. Rijkswaterstaat / ANWB ' +
  'waterkaarten, Vaarweginformatie), the BPR/Scheepvaartreglement, local notices, or proper seamanship. ' +
  'GPS positions, map data and derived values may be wrong, delayed or unavailable. The skipper remains ' +
  'responsible at all times.';

/** Modal shown once per browser session (sessionStorage), plus a permanent footer notice. */
export function showDisclaimerOnce(force = false): void {
  let acked = false;
  try {
    acked = sessionStorage.getItem(KEY) === '1';
  } catch {
    /* storage unavailable: show every time */
  }
  if (acked && !force) return;

  const dlg = h(
    'div',
    { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'disc-title' },
    h(
      'div',
      { class: 'modal-card' },
      h('h2', { id: 'disc-title' }, '⚠ Not for navigation'),
      h('p', null, DISCLAIMER),
      h(
        'button',
        {
          class: 'btn primary block',
          onclick: () => {
            try {
              sessionStorage.setItem(KEY, '1');
            } catch {
              /* ignore */
            }
            dlg.remove();
          },
        },
        'I understand',
      ),
    ),
  );
  document.body.append(dlg);
}
