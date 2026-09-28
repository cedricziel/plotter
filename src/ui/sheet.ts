import { $, h } from './dom';

let onCloseCb: (() => void) | null = null;
let currentKey: string | null = null;

/** Bottom sheet: one at a time, thumb-reachable, dismissed by ✕ or re-tapping its tool. */
export function openSheet(key: string, title: string, body: HTMLElement, onClose?: () => void): void {
  const sheet = $('#sheet');
  onCloseCb?.();
  onCloseCb = onClose ?? null;
  currentKey = key;
  sheet.replaceChildren(
    h(
      'div',
      { class: 'sheet-head' },
      h('h2', null, title),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: closeSheet }, '✕'),
    ),
    h('div', { class: 'sheet-body' }, body),
  );
  sheet.classList.add('open');
  document.body.dataset.sheet = key;
}

/** Replace the body of the open sheet if it is `key` (used for live updates). */
export function updateSheet(key: string, body: HTMLElement): void {
  if (currentKey !== key) return;
  const el = $('#sheet .sheet-body');
  // Preserve focus/scroll when re-rendering: skip if the user is typing.
  if (el.contains(document.activeElement) && (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement)) return;
  const scroll = el.scrollTop;
  el.replaceChildren(body);
  el.scrollTop = scroll;
}

export function closeSheet(): void {
  $('#sheet').classList.remove('open');
  onCloseCb?.();
  onCloseCb = null;
  currentKey = null;
  delete document.body.dataset.sheet;
}

export const sheetOpen = (key?: string) => (key ? currentKey === key : currentKey !== null);
