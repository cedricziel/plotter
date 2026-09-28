import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Route, Track, Waypoint } from '../core/model';

interface PlotterDB extends DBSchema {
  waypoints: { key: string; value: Waypoint };
  routes: { key: string; value: Route };
  tracks: { key: string; value: Track };
  kv: { key: string; value: unknown };
}

let dbp: Promise<IDBPDatabase<PlotterDB>> | null = null;

function db() {
  dbp ??= openDB<PlotterDB>('plotter', 1, {
    upgrade(d) {
      d.createObjectStore('waypoints', { keyPath: 'id' });
      d.createObjectStore('routes', { keyPath: 'id' });
      d.createObjectStore('tracks', { keyPath: 'id' });
      d.createObjectStore('kv');
    },
  });
  return dbp;
}

type Store = 'waypoints' | 'routes' | 'tracks';
type ValueOf<S extends Store> = PlotterDB[S]['value'];

export async function all<S extends Store>(store: S): Promise<ValueOf<S>[]> {
  return (await db()).getAll(store) as Promise<ValueOf<S>[]>;
}

export async function put<S extends Store>(store: S, value: ValueOf<S>): Promise<void> {
  await (await db()).put(store, value as never);
}

export async function putMany<S extends Store>(store: S, values: ValueOf<S>[]): Promise<void> {
  const tx = (await db()).transaction(store, 'readwrite');
  await Promise.all([...values.map((v) => tx.store.put(v as never)), tx.done]);
}

export async function remove(store: Store, id: string): Promise<void> {
  await (await db()).delete(store, id);
}

export async function getKv<T>(key: string): Promise<T | undefined> {
  return (await db()).get('kv', key) as Promise<T | undefined>;
}

export async function setKv(key: string, value: unknown): Promise<void> {
  await (await db()).put('kv', value, key);
}
