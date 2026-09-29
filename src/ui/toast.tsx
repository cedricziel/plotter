import { createStore, useStore } from './store';

interface ToastState {
  msg: string;
  onTap?: () => void;
  shown: boolean;
  /** changes with every toast, so a repeat of the same message restarts its timer */
  id: number;
}

export const toastStore = createStore<ToastState>({ msg: '', shown: false, id: 0 });

let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(msg: string, ms = 3500, onTap?: () => void): void {
  const id = toastStore.get().id + 1;
  toastStore.set({ msg, onTap, shown: true, id });
  clearTimeout(timer);
  timer = setTimeout(() => toastStore.set({ ...toastStore.get(), shown: false }), ms);
}

/** The one-line status message above the toolbar; tappable when the toast carries an action. */
export function Toast() {
  const { msg, onTap, shown } = useStore(toastStore);
  const cls = [shown && 'show', onTap && 'tap'].filter(Boolean).join(' ');
  return (
    <div id="toast" role="status" className={cls || undefined} onClick={onTap}>
      {msg}
    </div>
  );
}
