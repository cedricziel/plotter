type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> & { class?: string; style?: string };

/** Minimal hyperscript helper: h('button', { class: 'btn', onclick }, 'Label'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2), v as EventListener);
    } else if (k in el && k !== 'list' && k !== 'form' && typeof v !== 'string') {
      (el as unknown as Record<string, unknown>)[k] = v;
    } else if (v === true) {
      el.setAttribute(k, '');
    } else {
      el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;

let toastTimer: number | undefined;
export function toast(msg: string, ms = 3500, onTap?: () => void): void {
  const el = $('#toast');
  el.textContent = msg;
  el.onclick = onTap ?? null;
  el.classList.toggle('tap', !!onTap);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), ms);
}

export function download(filename: string, content: string, type = 'application/gpx+xml'): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept });
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
    input.click();
  });
}

export function fileStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * Replaces `parent`'s children with `next`, keeping the existing elements (and their listeners) when the tree has the
 * same shape. A button swapped out between touchstart and click makes iOS drop the tap.
 */
export function patchChildren(parent: Element, next: Node[]): void {
  if (!sameShape(parent.childNodes, next)) return parent.replaceChildren(...next);
  next.forEach((n, i) => patch(parent.childNodes[i], n));
}

function sameShape(a: ArrayLike<Node>, b: ArrayLike<Node>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < b.length; i++) {
    if (a[i].nodeName !== b[i].nodeName) return false;
    if (b[i] instanceof Element && !sameShape(a[i].childNodes, b[i].childNodes)) return false;
  }
  return true;
}

function patch(old: Node, next: Node): void {
  if (!(old instanceof Element && next instanceof Element)) {
    if (old.nodeValue !== next.nodeValue) old.nodeValue = next.nodeValue;
    return;
  }
  for (const { name } of [...old.attributes]) if (!next.hasAttribute(name)) old.removeAttribute(name);
  for (const { name, value } of [...next.attributes]) if (old.getAttribute(name) !== value) old.setAttribute(name, value);
  next.childNodes.forEach((c, i) => patch(old.childNodes[i], c));
}
