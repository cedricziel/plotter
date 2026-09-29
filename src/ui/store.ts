import { useSyncExternalStore } from 'react';

export interface Store<T> {
  get(): T;
  set(next: T): void;
  subscribe(fn: () => void): () => void;
}

/** A value outside React that components can watch with `useStore`. */
export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export const useStore = <T,>(store: Store<T>): T => useSyncExternalStore(store.subscribe, store.get, store.get);

/** Anything with the App's observer API: re-renders the caller on every `emit()`. */
export interface Observable {
  version: number;
  subscribe(fn: () => void): () => void;
}

export const useVersion = (app: Observable): number =>
  useSyncExternalStore(app.subscribe, () => app.version, () => app.version);
