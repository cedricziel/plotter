import { useEffect, useRef, type ReactNode } from 'react';
import { createStore, useStore } from './store';

interface OpenSheet {
  key: string;
  title: string;
  render: () => ReactNode;
  onClose?: () => void;
}

export const sheetStore = createStore<OpenSheet | null>(null);

/** Bottom sheet: one at a time, thumb-reachable, dismissed by ✕ or re-tapping its tool. */
export function openSheet(key: string, title: string, render: () => ReactNode, onClose?: () => void): void {
  sheetStore.get()?.onClose?.();
  sheetStore.set({ key, title, render, onClose });
}

export function closeSheet(): void {
  const open = sheetStore.get();
  sheetStore.set(null);
  open?.onClose?.();
}

export const sheetOpen = (key?: string) => (key ? sheetStore.get()?.key === key : sheetStore.get() !== null);

/**
 * The sheet host. Its body re-renders with its parent (the shell re-renders on every App emit), and React keeps the
 * elements, so a tap in progress and a half-typed field survive the once-a-second refresh.
 */
export function Sheet() {
  const open = useStore(sheetStore);
  // Keep the last sheet's content while it slides out.
  const last = useRef<OpenSheet | null>(null);
  if (open) last.current = open;
  const shown = open ?? last.current;

  useEffect(() => {
    if (open) document.body.dataset.sheet = open.key;
    else delete document.body.dataset.sheet;
  }, [open]);

  return (
    <section id="sheet" aria-live="polite" className={open ? 'open' : undefined}>
      {shown && (
        <>
          <div className="sheet-head">
            <h2>{shown.title}</h2>
            <button className="icon-btn" aria-label="Close" onClick={closeSheet}>
              ✕
            </button>
          </div>
          <div className="sheet-body" key={shown.key}>
            {shown.render()}
          </div>
        </>
      )}
    </section>
  );
}
