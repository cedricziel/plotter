import type { Map as MlMap } from 'maplibre-gl';

export type Box = [west: number, south: number, east: number, north: number];

export const inside = (b: Box, o: Box) => b[0] >= o[0] && b[1] >= o[1] && b[2] <= o[2] && b[3] <= o[3];

/** The viewport grown by `pad` (a fraction of its size) on every side, never wider than `maxSpan` degrees. */
export function padded([w, s, e, n]: Box, pad: number, maxSpan: number): Box {
  const grow = (span: number) => Math.max(0, Math.min(span * pad, (maxSpan - span) / 2));
  const dx = grow(e - w);
  const dy = grow(n - s);
  return [w - dx, s - dy, e + dx, n + dy];
}

export interface ViewportLoaderOptions<T> {
  minZoom: number;
  pad: number;
  maxSpan: number;
  debounceMs: number;
  /** false while the layer is switched off: nothing is requested */
  enabled?: () => boolean;
  load: (box: Box, signal: AbortSignal) => Promise<T[]>;
  /** what to show when `load` fails, typically the data of saved trips */
  fallback: (view: Box) => T[];
  render: (items: T[]) => void;
}

/** After a failed load the same area is not asked for again before this, so offline use stays quiet. */
const RETRY_MS = 30_000;

/**
 * Keeps `render` supplied with the items of the visible map area: loads a padded box once the map settles,
 * skips moves that stay inside the loaded box, and shows `fallback` while loading fails.
 */
export function viewportLoader<T>(map: MlMap, o: ViewportLoaderOptions<T>): { refresh: () => Promise<void> } {
  let shown: T[] = [];
  let fetched: { box: Box; zoom: number } | null = null;
  let failed: { box: Box; zoom: number; at: number } | null = null;
  let loading: { box: Box; zoom: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: AbortController | undefined;

  const currentView = (): Box => {
    const b = map.getBounds();
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  };

  const refresh = async () => {
    const zoom = map.getZoom();
    if (zoom < o.minZoom || o.enabled?.() === false) return;
    const view = currentView();
    const covers = (c: { box: Box; zoom: number } | null) => c && inside(view, c.box) && Math.abs(zoom - c.zoom) < 1;
    if (covers(fetched) || covers(loading)) return;
    if (failed && Date.now() - failed.at < RETRY_MS && covers(failed)) return;
    pending?.abort();
    const ctl = (pending = new AbortController());
    const box = padded(view, o.pad, o.maxSpan);
    loading = { box, zoom };
    try {
      shown = await o.load(box, ctl.signal);
      fetched = { box, zoom };
      failed = null;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      shown = o.fallback(currentView());
      fetched = null;
      failed = { box, zoom, at: Date.now() };
    } finally {
      if (pending === ctl) loading = null;
    }
    o.render(shown);
  };

  map.on('moveend', () => {
    clearTimeout(timer);
    timer = setTimeout(() => void refresh(), o.debounceMs);
  });
  map.on('style.load', () => o.render(shown));
  void refresh();
  return { refresh };
}
