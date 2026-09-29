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

/**
 * Keeps `render` supplied with the items of the visible map area: loads a padded box once the map settles,
 * skips moves that stay inside the loaded box, and shows `fallback` while loading fails.
 */
export function viewportLoader<T>(map: MlMap, o: ViewportLoaderOptions<T>): { refresh: () => Promise<void> } {
  let shown: T[] = [];
  let fetched: { box: Box; zoom: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: AbortController | undefined;

  const refresh = async () => {
    const zoom = map.getZoom();
    if (zoom < o.minZoom || o.enabled?.() === false) return;
    const b = map.getBounds();
    const view: Box = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    if (fetched && inside(view, fetched.box) && Math.abs(zoom - fetched.zoom) < 1) return;
    pending?.abort();
    const ctl = (pending = new AbortController());
    const box = padded(view, o.pad, o.maxSpan);
    try {
      shown = await o.load(box, ctl.signal);
      fetched = { box, zoom };
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      shown = o.fallback(view);
      fetched = null;
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
