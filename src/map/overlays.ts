import type { LayerSpecification, SourceSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import type { Theme } from './style';

/** Overlay colours are chosen to stand out against the waterway palette. */
const OVERLAY = {
  day: { cog: '#000000', route: '#d6008a', track: '#e8590c', saved: '#8f5b2e', anchor: '#c92a2a', acc: '#1c7ed6' },
  night: { cog: '#dddddd', route: '#bbbbbb', track: '#999999', saved: '#666666', anchor: '#ffffff', acc: '#777777' },
};

export const OVERLAY_SOURCES = ['accuracy', 'cog', 'route', 'track-live', 'tracks', 'anchor'] as const;
export type OverlaySource = (typeof OVERLAY_SOURCES)[number];

export const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export function overlaySources(): Record<string, SourceSpecification> {
  return Object.fromEntries(OVERLAY_SOURCES.map((s) => [s, { type: 'geojson', data: EMPTY }]));
}

export function overlayLayers(p: { labelHalo: string }, theme: Theme): LayerSpecification[] {
  const c = OVERLAY[theme];
  return [
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
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': c.route, 'line-width': 4, 'line-dasharray': [2, 1] },
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
      paint: { 'circle-color': c.anchor, 'circle-radius': 6, 'circle-stroke-color': p.labelHalo, 'circle-stroke-width': 2 },
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
