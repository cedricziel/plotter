import { useEffect, useRef, type ReactNode } from 'react';
import { t } from '../i18n';
import { createStore, useStore } from './store';

interface OpenSheet {
  key: string;
  /** a function when the title is worded per language, so an open sheet relabels */
  title: string | (() => string);
  render: () => ReactNode;
  onClose?: () => void;
}

export const sheetStore = createStore<OpenSheet | null>(null);

/** Bottom sheet: one at a time, thumb-reachable, dismissed by ✕ or re-tapping its tool. */
export function openSheet(
  key: string,
  title: string | (() => string),
  render: () => ReactNode,
  onClose?: () => void,
): void {
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
    <SheetFrame
      open={!!open}
      title={typeof shown?.title === 'function' ? shown.title() : shown?.title}
      bodyKey={shown?.key}
      onClose={closeSheet}
    >
      {shown?.render()}
    </SheetFrame>
  );
}

/** The sheet's chrome: a titled bottom panel with a close button. Empty without a title. */
export function SheetFrame({
  open = true,
  title,
  onClose,
  bodyKey,
  children,
}: {
  open?: boolean;
  title?: string;
  onClose?: () => void;
  bodyKey?: string;
  children?: ReactNode;
}) {
  return (
    <section id="sheet" aria-live="polite" className={open ? 'open' : undefined}>
      {title != null && (
        <>
          <div className="sheet-head">
            <h2>{title}</h2>
            <button className="icon-btn" aria-label={t('sheet.close')} onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="sheet-body" key={bodyKey}>
            {children}
          </div>
        </>
      )}
    </section>
  );
}
