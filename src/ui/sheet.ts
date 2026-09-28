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
  trackPointer(sheet);
  document.body.dataset.sheet = key;
}

const CONTROLS = 'input, select, textarea';
// Values that tick with every GPS fix / clock: patched in place so buttons around them survive.
const LIVE = 'small, .stat-value';
const TAP_GRACE_MS = 150;
let pointerDown = false;
let lastPointerUp = 0;
let deferred: { key: string; body: HTMLElement } | null = null;

// Swapping the DOM between pointerdown and pointerup makes the browser drop the click.
function trackPointer(sheet: HTMLElement): void {
  if (sheet.dataset.tracked) return;
  sheet.dataset.tracked = '1';
  sheet.addEventListener('pointerdown', () => (pointerDown = true));
  const up = () => {
    pointerDown = false;
    lastPointerUp = Date.now();
    setTimeout(() => {
      const d = deferred;
      deferred = null;
      if (d) updateSheet(d.key, d.body);
    }, TAP_GRACE_MS + 10);
  };
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
}

const liveEls = (root: Element) => [...root.querySelectorAll(LIVE)].filter((e) => e.childElementCount === 0);

function skeleton(root: Element): string {
  const c = root.cloneNode(true) as Element;
  liveEls(c).forEach((e) => (e.textContent = ''));
  return c.outerHTML;
}

/** Replace the body of the open sheet if it is `key` (used for live updates). */
export function updateSheet(key: string, body: HTMLElement): void {
  if (currentKey !== key) return;
  const el = $('#sheet .sheet-body');
  const old = el.firstElementChild;
  if (pointerDown || Date.now() - lastPointerUp < TAP_GRACE_MS) {
    deferred = { key, body };
    return;
  }
  // Preserve focus/scroll when re-rendering: skip if the user is typing.
  if (el.contains(document.activeElement) && (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement)) return;
  if (old && old.outerHTML === body.outerHTML) return;
  if (old && skeleton(old) === skeleton(body)) {
    const next = liveEls(body);
    liveEls(old).forEach((e, i) => {
      if (e.textContent !== next[i].textContent) e.textContent = next[i].textContent;
    });
    return;
  }
  if (old) {
    // Keep unchanged form controls (value, focus, selection) instead of recreating them.
    const oldControls = [...old.querySelectorAll(CONTROLS)];
    [...body.querySelectorAll(CONTROLS)].forEach((c, i) => {
      if (oldControls[i]?.outerHTML === c.outerHTML) c.replaceWith(oldControls[i]);
    });
  }
  const scroll = el.scrollTop;
  el.replaceChildren(body);
  el.scrollTop = scroll;
}

export function closeSheet(): void {
  deferred = null;
  $('#sheet').classList.remove('open');
  onCloseCb?.();
  onCloseCb = null;
  currentKey = null;
  delete document.body.dataset.sheet;
}

export const sheetOpen = (key?: string) => (key ? currentKey === key : currentKey !== null);
