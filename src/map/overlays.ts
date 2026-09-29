import type {
  ExpressionSpecification,
  LayerSpecification,
  SourceSpecification,
} from '@maplibre/maplibre-gl-style-spec';
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import type { Theme } from './style';

/** Overlay colours are chosen to stand out against the waterway palette. */
const OVERLAY = {
  day: {
    cog: '#000000',
    route: '#d6008a',
    track: '#e8590c',
    saved: '#8f5b2e',
    anchor: '#c92a2a',
    acc: '#1c7ed6',
    nav: '#7b2cbf',
  },
  night: {
    cog: '#ff5a5a',
    route: '#cc1a1a',
    track: '#990f0f',
    saved: '#5c0808',
    anchor: '#ff2222',
    acc: '#8a0f0f',
    nav: '#ff3b3b',
  },
};

const PLACE_COLORS = {
  day: { harbour: '#0b7285', structure: '#5f3dc4', town: '#495057', opening: '#d9480f' },
  night: { harbour: '#ff6b6b', structure: '#c92a2a', town: '#8a1f1f', opening: '#ff8787' },
};

export const OVERLAY_SOURCES = [
  'seamark-marks',
  'place-marks',
  'accuracy',
  'cog',
  'route',
  'nav-line',
  'track-live',
  'tracks',
  'anchor',
  'maneuvers',
] as const;
export type OverlaySource = (typeof OVERLAY_SOURCES)[number];

export const SEAMARK_LAYERS = ['seamark-marks', 'seamark-flare', 'seamark-notices'] as const;

export const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export function overlaySources(): Record<string, SourceSpecification> {
  return Object.fromEntries(OVERLAY_SOURCES.map((s) => [s, { type: 'geojson', data: EMPTY }]));
}

const SEAMARK_ICON_SIZE: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  12,
  0.5,
  14,
  0.75,
  16,
  1,
  18,
  1.25,
];

function seamarkLayers(visible: boolean): LayerSpecification[] {
  const layout = {
    visibility: visible ? 'visible' : 'none',
    'icon-size': SEAMARK_ICON_SIZE,
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
  } as const;
  return [
    {
      id: SEAMARK_LAYERS[0],
      type: 'symbol',
      source: 'seamark-marks',
      minzoom: 12,
      filter: ['==', ['get', 'notice'], false],
      layout: { ...layout, 'icon-image': ['get', 'icon'] },
    },
    {
      id: SEAMARK_LAYERS[1],
      type: 'symbol',
      source: 'seamark-marks',
      minzoom: 12,
      filter: ['==', ['get', 'flare'], true],
      layout: { ...layout, 'icon-image': 'sm-flare', 'icon-anchor': 'bottom-left', 'icon-offset': [3, -3] },
    },
    {
      id: SEAMARK_LAYERS[2],
      type: 'symbol',
      source: 'seamark-marks',
      minzoom: 14,
      filter: ['==', ['get', 'notice'], true],
      layout: { ...layout, 'icon-image': ['get', 'icon'] },
    },
  ];
}

export function overlayLayers(p: { labelHalo: string }, theme: Theme, o: { seamarks: boolean }): LayerSpecification[] {
  const c = OVERLAY[theme];
  const pc = PLACE_COLORS[theme];
  const byGroup = (harbour: string | number, structure: string | number, town: string | number) =>
    ['match', ['get', 'group'], 'harbour', harbour, 'structure', structure, town] as ExpressionSpecification;
  return [
    ...seamarkLayers(o.seamarks),
    {
      id: 'place-marks',
      type: 'circle',
      source: 'place-marks',
      minzoom: 11,
      paint: {
        'circle-color': byGroup(pc.harbour, pc.structure, pc.town),
        'circle-radius': byGroup(6, 5, 4),
        'circle-stroke-color': p.labelHalo,
        'circle-stroke-width': 2,
      },
    },
    {
      id: 'place-marks-label',
      type: 'symbol',
      source: 'place-marks',
      minzoom: 12,
      filter: ['!=', ['get', 'group'], 'town'],
      layout: {
        'text-field': ['step', ['zoom'], ['get', 'name'], 14, ['get', 'detail']],
        'text-font': ['Noto Sans Medium'],
        'text-size': 11,
        'text-offset': [0, 0.9],
        'text-anchor': 'top',
        'text-max-width': 8,
      },
      paint: {
        'text-color': [
          'case',
          ['==', ['get', 'open'], true],
          pc.opening,
          byGroup(pc.harbour, pc.structure, pc.town),
        ] as ExpressionSpecification,
        'text-halo-color': p.labelHalo,
        'text-halo-width': 2,
      },
    },
    {
      id: 'accuracy',
      type: 'fill',
      source: 'accuracy',
      paint: { 'fill-color': c.acc, 'fill-opacity': 0.12 },
    },
    {
      id: 'tracks',
      type: 'line',
      source: 'tracks',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': c.saved, 'line-width': 3, 'line-opacity': 0.8 },
    },
    {
      id: 'track-live',
      type: 'line',
      source: 'track-live',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': c.track, 'line-width': 4 },
    },
    {
      id: 'route-casing',
      type: 'line',
      source: 'route',
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': p.labelHalo, 'line-width': 7 },
    },
    {
      id: 'route',
      type: 'line',
      source: 'route',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'state'], 'active']],
      paint: {
        'line-color': c.route,
        'line-width': 4,
        'line-dasharray': [2, 1],
        'line-opacity': ['match', ['get', 'state'], 'done', 0.35, 1],
      },
    },
    {
      id: 'route-active',
      type: 'line',
      source: 'route',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'state'], 'active']],
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': c.route, 'line-width': 7 },
    },
    {
      id: 'maneuvers',
      type: 'circle',
      source: 'maneuvers',
      paint: {
        'circle-radius': ['case', ['get', 'next'], 7, 4],
        'circle-color': ['case', ['get', 'next'], c.route, p.labelHalo],
        'circle-stroke-color': c.route,
        'circle-stroke-width': 2,
      },
    },
    {
      id: 'nav-line-casing',
      type: 'line',
      source: 'nav-line',
      paint: { 'line-color': p.labelHalo, 'line-width': 9 },
    },
    {
      id: 'nav-line',
      type: 'line',
      source: 'nav-line',
      layout: { 'line-cap': 'butt' },
      paint: { 'line-color': c.nav, 'line-width': 5, 'line-dasharray': [1.5, 1] },
    },
    {
      id: 'route-leg-label',
      type: 'symbol',
      source: 'route',
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: {
        'symbol-placement': 'line-center',
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Medium'],
        'text-size': 13,
        'text-offset': [0, -1],
      },
      paint: { 'text-color': c.route, 'text-halo-color': p.labelHalo, 'text-halo-width': 2 },
    },
    {
      id: 'anchor-circle',
      type: 'fill',
      source: 'anchor',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': c.anchor, 'fill-opacity': 0.1 },
    },
    {
      id: 'anchor-circle-line',
      type: 'line',
      source: 'anchor',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'line-color': c.anchor, 'line-width': 2.5, 'line-dasharray': [3, 2] },
    },
    {
      id: 'anchor-point',
      type: 'circle',
      source: 'anchor',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-color': c.anchor,
        'circle-radius': 6,
        'circle-stroke-color': p.labelHalo,
        'circle-stroke-width': 2,
      },
    },
    {
      id: 'cog',
      type: 'line',
      source: 'cog',
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': c.cog, 'line-width': 3 },
    },
    {
      id: 'cog-ticks',
      type: 'circle',
      source: 'cog',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-color': c.cog, 'circle-radius': 3.5 },
    },
  ];
}

export function setOverlay(map: MlMap, id: OverlaySource, data: GeoJSON.FeatureCollection | GeoJSON.Feature): void {
  const src = map.getSource(id) as GeoJSONSource | undefined;
  src?.setData(data);
}
