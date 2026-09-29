import type { Map as MlMap } from 'maplibre-gl';
import { symbolKey, symbolSpec, type SymbolSpec } from '../core/seamark-symbol';
import { seamarksFromTrips, type Trip } from '../core/trips';
import type { Seamark } from '../core/waterway-data';
import { api } from '../services/api';
import { SEAMARK_LAYERS, setOverlay } from './overlays';
import { flareSvg, symbolSvg } from './seamark-svg';
import type { Theme } from './style';
import { viewportLoader } from './viewport';

const MIN_ZOOM = 12;
const DEBOUNCE_MS = 400;
const PAD = 0.3;
const MAX_SPAN_DEG = 1.5;
const LIMIT = 600;
const TAP_PX = 10;
const PIXEL_RATIO = 2;
const FLARE_IMAGE = 'sm-flare';

export interface SeamarkHooks {
  trips: () => Trip[];
  enabled: () => boolean;
  theme: () => Theme;
  /** true while a tap must not open a seamark (crosshair placement) */
  blocked: () => boolean;
  onPick: (seamark: Seamark) => void;
}

const imageId = (spec: SymbolSpec) => `sm:${symbolKey(spec)}`;

export function seamarkFeatures(items: Seamark[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: items.map((s, i) => {
      const spec = symbolSpec(s);
      return {
        type: 'Feature',
        properties: {
          i,
          icon: imageId(spec),
          notice: spec.body === 'notice',
          flare: !!s.light && spec.body !== 'light',
        },
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      };
    }),
  };
}

const loadImage = (svg: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('seamark symbol did not load'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

async function ensureImage(map: MlMap, id: string, svg: string): Promise<void> {
  if (map.hasImage(id)) return;
  const img = await loadImage(svg);
  if (!map.hasImage(id)) map.addImage(id, img, { pixelRatio: PIXEL_RATIO });
}

/** Draws the seamarks of the visible area as IALA symbols and opens one when tapped. */
export function mountSeamarks(map: MlMap, hooks: SeamarkHooks): { refresh: () => Promise<void> } {
  let shown: Seamark[] = [];
  let generation = 0;

  const render = async (items: Seamark[]) => {
    shown = items;
    const mine = ++generation;
    const theme = hooks.theme();
    const specs = new Map(items.map(symbolSpec).map((spec) => [imageId(spec), spec]));
    try {
      await Promise.all([
        ensureImage(map, FLARE_IMAGE, flareSvg(theme)),
        ...[...specs].map(([id, spec]) => ensureImage(map, id, symbolSvg(spec, theme))),
      ]);
    } catch {
      /* a symbol that cannot be drawn is skipped, the rest still shows */
    }
    if (mine === generation) setOverlay(map, 'seamark-marks', seamarkFeatures(items));
  };

  const pick = ({ x, y }: { x: number; y: number }): Seamark | null => {
    const layers = SEAMARK_LAYERS.filter((id) => map.getLayer(id));
    if (!layers.length) return null;
    const found = map.queryRenderedFeatures(
      [
        [x - TAP_PX, y - TAP_PX],
        [x + TAP_PX, y + TAP_PX],
      ],
      { layers },
    );
    let best: { seamark: Seamark; dist: number } | null = null;
    for (const f of found) {
      const seamark = shown[Number(f.properties.i)];
      if (!seamark) continue;
      const at = map.project([seamark.lon, seamark.lat]);
      const dist = Math.hypot(at.x - x, at.y - y);
      if (!best || dist < best.dist) best = { seamark, dist };
    }
    return best?.seamark ?? null;
  };

  map.on('click', (e) => {
    if (hooks.blocked() || !hooks.enabled()) return;
    const seamark = pick(e.point);
    if (seamark) hooks.onPick(seamark);
  });

  return viewportLoader<Seamark>(map, {
    minZoom: MIN_ZOOM,
    pad: PAD,
    maxSpan: MAX_SPAN_DEG,
    debounceMs: DEBOUNCE_MS,
    enabled: hooks.enabled,
    load: (box, signal) => api.seamarks(box, LIMIT, signal),
    fallback: (view) => seamarksFromTrips(hooks.trips(), view, LIMIT),
    render: (items) => void render(items),
  });
}
