import type {
  ExpressionSpecification,
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec';
import { overlayLayers, overlaySources } from './overlays';

export type Theme = 'day' | 'night';
export type Basemap = 'pmtiles' | 'osm';

export interface StyleOptions {
  theme: Theme;
  basemap: Basemap;
  /** absolute URL of the .pmtiles archive */
  pmtilesUrl: string;
  glyphsUrl: string;
  /** vector seamark symbols */
  seamarks: boolean;
  /** OpenSeaMap raster tiles */
  openseamap: boolean;
}

/**
 * Palettes. The night palette is red on black, painted natively (no blend
 * overlay: mobile Safari does not composite those over the WebGL canvas).
 */
interface Palette {
  land: string;
  water: string;
  waterway: string;
  waterwayCasing: string;
  waterLabel: string;
  park: string;
  urban: string;
  industrial: string;
  building: string;
  road: string;
  roadCasing: string;
  majorRoad: string;
  highway: string;
  bridge: string;
  rail: string;
  ferry: string;
  boundary: string;
  label: string;
  labelHalo: string;
  poiHarbour: string;
}

const DAY: Palette = {
  land: '#f3efe4',
  water: '#8ecbf0',
  waterway: '#4aa3e0',
  waterwayCasing: '#1f6fae',
  waterLabel: '#0a4a80',
  park: '#d7ebc6',
  urban: '#ebe5d6',
  industrial: '#e3dde6',
  building: '#d9d0c1',
  road: '#ffffff',
  roadCasing: '#b3a998',
  majorRoad: '#fde9a8',
  highway: '#f7c26b',
  bridge: '#d9480f',
  rail: '#8a8a8a',
  ferry: '#6a3fb0',
  boundary: '#9a7aa0',
  label: '#2b2b2b',
  labelHalo: '#ffffff',
  poiHarbour: '#b0006e',
};

const NIGHT: Palette = {
  land: '#070000',
  water: '#1a0000',
  waterway: '#4a0000',
  waterwayCasing: '#5c0000',
  waterLabel: '#b01818',
  park: '#0a0000',
  urban: '#0a0000',
  industrial: '#0c0000',
  building: '#140000',
  road: '#1f0000',
  roadCasing: '#120000',
  majorRoad: '#2a0000',
  highway: '#330000',
  bridge: '#8a1010',
  rail: '#260000',
  ferry: '#6a0a0a',
  boundary: '#2a0000',
  label: '#b01818',
  labelHalo: '#000000',
  poiHarbour: '#c41e1e',
};

export const palette = (t: Theme) => (t === 'night' ? NIGHT : DAY);

const FONT_MEDIUM = ['Noto Sans Medium'];
const FONT_ITALIC = ['Noto Sans Italic'];

const zoomInterp = (...stops: number[]): ExpressionSpecification =>
  ['interpolate', ['exponential', 1.6], ['zoom'], ...stops] as ExpressionSpecification;

const kindIn = (...kinds: string[]): ExpressionSpecification => ['in', ['get', 'kind'], ['literal', kinds]];

const WATER_LINE_KINDS = ['river', 'canal', 'stream', 'drain', 'ditch'];
/** Navigable-ish waterways get emphasis; small drains and ditches stay thin. */
const NAVIGABLE = ['river', 'canal'];
const HARBOUR_POIS = [
  'marina',
  'harbour',
  'slipway',
  'ferry_terminal',
  'boat_rental',
  'sanitary_dump_station',
  'water_point',
  'lock',
  'lock_gate',
];

const name: ExpressionSpecification = ['coalesce', ['get', 'name:nl'], ['get', 'name'], ''];

function vectorLayers(p: Palette): LayerSpecification[] {
  const src = 'protomaps';
  return [
    { id: 'background', type: 'background', paint: { 'background-color': p.water } },
    { id: 'earth', type: 'fill', source: src, 'source-layer': 'earth', paint: { 'fill-color': p.land } },
    {
      id: 'landuse-urban',
      type: 'fill',
      source: src,
      'source-layer': 'landuse',
      filter: kindIn('residential', 'neighbourhood', 'commercial', 'retail'),
      paint: { 'fill-color': p.urban },
    },
    {
      id: 'landuse-industrial',
      type: 'fill',
      source: src,
      'source-layer': 'landuse',
      filter: kindIn('industrial', 'railway', 'military'),
      paint: { 'fill-color': p.industrial },
    },
    {
      id: 'landuse-green',
      type: 'fill',
      source: src,
      'source-layer': 'landuse',
      filter: kindIn('park', 'forest', 'wood', 'nature_reserve', 'grass', 'meadow', 'golf_course', 'cemetery'),
      paint: { 'fill-color': p.park },
    },
    {
      id: 'landuse-harbour',
      type: 'fill',
      source: src,
      'source-layer': 'landuse',
      filter: kindIn('marina', 'harbour', 'port', 'pier'),
      paint: { 'fill-color': p.poiHarbour, 'fill-opacity': 0.12 },
    },
    {
      id: 'water',
      type: 'fill',
      source: src,
      'source-layer': 'water',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': p.water },
    },
    {
      id: 'water-outline',
      type: 'line',
      source: src,
      'source-layer': 'water',
      filter: ['==', ['geometry-type'], 'Polygon'],
      minzoom: 12,
      paint: { 'line-color': p.waterwayCasing, 'line-width': zoomInterp(12, 0.3, 18, 1.2), 'line-opacity': 0.6 },
    },
    {
      id: 'waterway-minor',
      type: 'line',
      source: src,
      'source-layer': 'water',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], kindIn('stream', 'drain', 'ditch')],
      minzoom: 11,
      paint: { 'line-color': p.waterway, 'line-width': zoomInterp(11, 0.5, 18, 3) },
    },
    {
      id: 'waterway-casing',
      type: 'line',
      source: src,
      'source-layer': 'water',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], kindIn(...NAVIGABLE)],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.waterwayCasing, 'line-width': zoomInterp(6, 1.2, 12, 4, 18, 22) },
    },
    {
      id: 'waterway',
      type: 'line',
      source: src,
      'source-layer': 'water',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], kindIn(...NAVIGABLE)],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.waterway, 'line-width': zoomInterp(6, 0.6, 12, 2.5, 18, 18) },
    },
    {
      id: 'buildings',
      type: 'fill',
      source: src,
      'source-layer': 'buildings',
      minzoom: 14,
      paint: { 'fill-color': p.building, 'fill-opacity': 0.8 },
    },
    {
      id: 'boundaries',
      type: 'line',
      source: src,
      'source-layer': 'boundaries',
      filter: ['<=', ['get', 'kind_detail'], 4],
      paint: { 'line-color': p.boundary, 'line-dasharray': [3, 2], 'line-width': 1 },
    },
    {
      id: 'ferry',
      type: 'line',
      source: src,
      'source-layer': 'roads',
      filter: ['any', ['==', ['get', 'kind'], 'ferry'], ['==', ['get', 'kind_detail'], 'ferry']],
      paint: { 'line-color': p.ferry, 'line-width': 1.5, 'line-dasharray': [4, 3] },
    },
    {
      id: 'ferry-transit',
      type: 'line',
      source: src,
      'source-layer': 'transit',
      filter: ['any', ['==', ['get', 'kind'], 'ferry'], ['==', ['get', 'kind_detail'], 'ferry']],
      paint: { 'line-color': p.ferry, 'line-width': 1.5, 'line-dasharray': [4, 3] },
    },
    {
      id: 'rail',
      type: 'line',
      source: src,
      'source-layer': 'roads',
      filter: ['==', ['get', 'kind'], 'rail'],
      minzoom: 9,
      paint: { 'line-color': p.rail, 'line-width': zoomInterp(9, 0.5, 18, 3), 'line-dasharray': [2, 2] },
    },
    {
      id: 'roads-casing',
      type: 'line',
      source: src,
      'source-layer': 'roads',
      filter: kindIn('highway', 'major_road', 'minor_road'),
      minzoom: 12,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.roadCasing, 'line-width': zoomInterp(12, 1.5, 18, 16) },
    },
    {
      id: 'roads-minor',
      type: 'line',
      source: src,
      'source-layer': 'roads',
      filter: kindIn('minor_road', 'path', 'other'),
      minzoom: 12,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.road, 'line-width': zoomInterp(12, 0.5, 18, 12) },
    },
    {
      id: 'roads-major',
      type: 'line',
      source: src,
      'source-layer': 'roads',
      filter: ['==', ['get', 'kind'], 'major_road'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.majorRoad, 'line-width': zoomInterp(7, 0.5, 18, 14) },
    },
    {
      id: 'roads-highway',
      type: 'line',
      source: src,
      'source-layer': 'roads',
      filter: ['==', ['get', 'kind'], 'highway'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.highway, 'line-width': zoomInterp(5, 0.6, 18, 16) },
    },
    // Bridges are obstacles for a boat: draw them as a bold contrasting bar
    // on top of the road network, visible from mid zooms. Rail viaducts are
    // often long and over land, so they get a thinner bar.
    {
      id: 'bridges-rail',
      type: 'line',
      source: src,
      'source-layer': 'roads',
      filter: ['all', ['==', ['get', 'is_bridge'], true], ['==', ['get', 'kind'], 'rail']],
      minzoom: 12,
      paint: { 'line-color': p.bridge, 'line-width': zoomInterp(12, 1, 18, 5), 'line-opacity': 0.7 },
    },
    {
      id: 'bridges',
      type: 'line',
      source: src,
      'source-layer': 'roads',
      filter: ['all', ['==', ['get', 'is_bridge'], true], kindIn('highway', 'major_road', 'minor_road', 'other')],
      minzoom: 11,
      layout: { 'line-cap': 'butt' },
      paint: { 'line-color': p.bridge, 'line-width': zoomInterp(11, 1.5, 18, 14), 'line-opacity': 0.9 },
    },
    {
      id: 'bridges-path',
      type: 'line',
      source: src,
      'source-layer': 'roads',
      filter: ['all', ['==', ['get', 'is_bridge'], true], ['==', ['get', 'kind'], 'path']],
      minzoom: 14,
      paint: { 'line-color': p.bridge, 'line-width': zoomInterp(14, 1.5, 18, 6) },
    },
    {
      id: 'waterway-label',
      type: 'symbol',
      source: src,
      'source-layer': 'water',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], kindIn(...WATER_LINE_KINDS)],
      minzoom: 10,
      layout: {
        'symbol-placement': 'line',
        'text-field': name,
        'text-font': FONT_ITALIC,
        'text-size': zoomInterp(10, 11, 18, 17),
        'symbol-spacing': 350,
      },
      paint: { 'text-color': p.waterLabel, 'text-halo-color': p.labelHalo, 'text-halo-width': 1.5 },
    },
    {
      id: 'water-label',
      type: 'symbol',
      source: src,
      'source-layer': 'water',
      filter: ['==', ['geometry-type'], 'Point'],
      layout: { 'text-field': name, 'text-font': FONT_ITALIC, 'text-size': 13, 'text-max-width': 8 },
      paint: { 'text-color': p.waterLabel, 'text-halo-color': p.labelHalo, 'text-halo-width': 1.5 },
    },
    {
      id: 'harbour-poi',
      type: 'circle',
      source: src,
      'source-layer': 'pois',
      filter: kindIn(...HARBOUR_POIS),
      minzoom: 11,
      paint: {
        'circle-color': p.poiHarbour,
        'circle-radius': zoomInterp(11, 4, 18, 9),
        'circle-stroke-color': p.labelHalo,
        'circle-stroke-width': 2,
      },
    },
    {
      id: 'harbour-poi-label',
      type: 'symbol',
      source: src,
      'source-layer': 'pois',
      filter: kindIn(...HARBOUR_POIS),
      minzoom: 12,
      layout: {
        'text-field': name,
        'text-font': FONT_MEDIUM,
        'text-size': 13,
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-max-width': 9,
      },
      paint: { 'text-color': p.poiHarbour, 'text-halo-color': p.labelHalo, 'text-halo-width': 2 },
    },
    {
      id: 'places',
      type: 'symbol',
      source: src,
      'source-layer': 'places',
      filter: kindIn('locality', 'neighbourhood', 'macrohood'),
      layout: {
        'text-field': name,
        'text-font': FONT_MEDIUM,
        'text-size': ['interpolate', ['linear'], ['zoom'], 6, 11, 14, 16],
        'text-max-width': 8,
        'symbol-sort-key': ['coalesce', ['get', 'min_zoom'], 20],
      },
      paint: { 'text-color': p.label, 'text-halo-color': p.labelHalo, 'text-halo-width': 2 },
    },
  ];
}

function osmRasterLayers(theme: Theme): LayerSpecification[] {
  const night = theme === 'night';
  return [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
      paint: night
        ? { 'raster-saturation': -1, 'raster-brightness-max': 0.35, 'raster-contrast': 0.2 }
        : { 'raster-saturation': 0.1, 'raster-contrast': 0.05 },
    },
  ];
}

export const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function buildStyle(o: StyleOptions): StyleSpecification {
  const sources: Record<string, SourceSpecification> = {};
  let layers: LayerSpecification[];

  if (o.basemap === 'pmtiles') {
    sources.protomaps = {
      type: 'vector',
      url: `pmtiles://${o.pmtilesUrl}`,
      attribution: `<a href="https://protomaps.com">Protomaps</a> ${OSM_ATTRIBUTION}`,
    };
    layers = vectorLayers(palette(o.theme));
  } else {
    // Fallback only. Tiles are fetched on demand as the user pans (no bulk
    // prefetch) and cached, per https://operations.osmfoundation.org/policies/tiles/
    sources.osm = {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: OSM_ATTRIBUTION,
    };
    layers = osmRasterLayers(o.theme);
  }

  if (o.openseamap) {
    sources.openseamap = {
      type: 'raster',
      tiles: ['https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'],
      tileSize: 256,
      minzoom: 6,
      maxzoom: 18,
      attribution: '<a href="https://www.openseamap.org">OpenSeaMap</a>',
    };
    layers.push({
      id: 'openseamap',
      type: 'raster',
      source: 'openseamap',
      minzoom: 9,
      paint: o.theme === 'night' ? { 'raster-saturation': -1, 'raster-brightness-max': 0.6 } : {},
    });
  }

  Object.assign(sources, overlaySources());
  layers.push(...overlayLayers(palette(o.theme), o.theme, { seamarks: o.seamarks }));

  return {
    version: 8,
    name: `plotter-${o.theme}`,
    glyphs: o.glyphsUrl,
    sources,
    layers,
  };
}
