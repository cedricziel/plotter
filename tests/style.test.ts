import { readFileSync } from 'node:fs';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { AERIAL_ATTRIBUTION, AERIAL_TILES, buildStyle, type StyleOptions } from '../src/map/style';

const base: StyleOptions = {
  theme: 'day',
  basemap: 'pmtiles',
  pmtilesUrl: 'https://example.org/nl.pmtiles',
  glyphsUrl: 'https://example.org/{fontstack}/{range}.pbf',
  seamarks: true,
  openseamap: false,
  aerial: false,
};
const style = (o: Partial<StyleOptions> = {}) => buildStyle({ ...base, ...o });
const ids = (o: Partial<StyleOptions> = {}) => style(o).layers.map((l) => l.id);
interface Found {
  minzoom?: number;
  filter?: unknown;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
}
const layer = (id: string, o: Partial<StyleOptions> = {}) =>
  style(o).layers.find((l) => l.id === id) as Found | undefined;

describe('aerial photo layer', () => {
  it('is left out by default', () => {
    expect(ids()).not.toContain('aerial');
    expect(style().sources.aerial).toBeUndefined();
  });

  it('adds the PDOK photo as a raster source by day', () => {
    const s = style({ aerial: true });
    expect(s.sources.aerial).toMatchObject({
      type: 'raster',
      tiles: [AERIAL_TILES],
      tileSize: 256,
      maxzoom: 19,
      attribution: AERIAL_ATTRIBUTION,
    });
    expect(AERIAL_TILES).toBe(
      'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg',
    );
    expect(AERIAL_ATTRIBUTION).toContain('Luchtfoto © ');
    expect(AERIAL_ATTRIBUTION).toContain('PDOK');
  });

  it('sits above the fills and below the labels and every overlay', () => {
    const order = ids({ aerial: true });
    const at = order.indexOf('aerial');
    expect(at).toBeGreaterThan(order.indexOf('buildings'));
    for (const above of [
      'boundaries',
      'roads-minor',
      'bridges',
      'waterway-label',
      'places',
      'place-marks',
      'route',
      'cog',
    ]) {
      expect(order.indexOf(above), above).toBeGreaterThan(at);
    }
    for (const below of ['earth', 'water', 'landuse-urban']) expect(order.indexOf(below), below).toBeLessThan(at);
  });

  it('is left out at night and returns by day', () => {
    expect(ids({ aerial: true, theme: 'night' })).not.toContain('aerial');
    expect(style({ aerial: true, theme: 'night' }).sources.aerial).toBeUndefined();
    expect(ids({ aerial: true, theme: 'day' })).toContain('aerial');
  });

  it('goes over the online fallback basemap', () => {
    const order = ids({ aerial: true, basemap: 'osm' });
    expect(order.indexOf('aerial')).toBeGreaterThan(order.indexOf('osm'));
    expect(order.indexOf('aerial')).toBeLessThan(order.indexOf('place-marks'));
  });
});

describe('OpenSeaMap raster overlay', () => {
  it('is left out by default so no tile is requested', () => {
    expect(ids()).not.toContain('openseamap');
    expect(style().sources.openseamap).toBeUndefined();
  });

  it('is added above the basemap and below the overlays when switched on', () => {
    const s = style({ openseamap: true });
    expect(s.sources.openseamap).toMatchObject({
      type: 'raster',
      tiles: ['https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'],
    });
    const order = ids({ openseamap: true });
    expect(order.indexOf('openseamap')).toBeGreaterThan(order.indexOf('places'));
    expect(order.indexOf('openseamap')).toBeLessThan(order.indexOf('place-marks'));
  });

  it('is dimmed at night', () => {
    expect(layer('openseamap', { openseamap: true, theme: 'night' })?.paint).toMatchObject({ 'raster-saturation': -1 });
  });
});

describe('vector seamark layers', () => {
  it('draw symbols from the seamark source below the place marks', () => {
    const order = ids();
    expect(order).toContain('seamark-marks');
    expect(order.indexOf('seamark-marks')).toBeLessThan(order.indexOf('place-marks'));
    expect(style().sources['seamark-marks']).toMatchObject({ type: 'geojson' });
  });

  it('start at zoom 12, notices at zoom 14', () => {
    expect(layer('seamark-marks')?.minzoom).toBe(12);
    expect(layer('seamark-flare')?.minzoom).toBe(12);
    expect(layer('seamark-notices')?.minzoom).toBe(14);
  });

  it('follow the seamarks setting', () => {
    for (const id of ['seamark-marks', 'seamark-flare', 'seamark-notices']) {
      expect(layer(id)?.layout?.visibility, id).toBe('visible');
      expect(layer(id, { seamarks: false })?.layout?.visibility, id).toBe('none');
    }
  });

  it('use the symbol image chosen per feature and grow with the zoom', () => {
    const l = layer('seamark-marks');
    expect(l?.layout?.['icon-image']).toEqual(['get', 'icon']);
    expect(l?.layout?.['icon-size']).toEqual(expect.arrayContaining(['interpolate', ['linear'], ['zoom']]));
  });

  it('keep the flare and notices apart from the marks layer', () => {
    expect(layer('seamark-marks')?.filter).toEqual(['==', ['get', 'notice'], false]);
    expect(layer('seamark-notices')?.filter).toEqual(['==', ['get', 'notice'], true]);
    expect(layer('seamark-flare')?.filter).toEqual(['==', ['get', 'flare'], true]);
  });
});

describe('service worker', () => {
  it('names no aerial photo host, so the photo is never cached for offline use', () => {
    const worker = readFileSync(new URL('../src/sw.ts', import.meta.url), 'utf8');
    expect(worker).not.toMatch(/pdok/i);
  });
});

describe('style validity', () => {
  it.each([
    { theme: 'day', basemap: 'pmtiles', aerial: true, openseamap: true },
    { theme: 'night', basemap: 'pmtiles', aerial: true, openseamap: true },
    { theme: 'day', basemap: 'osm', aerial: true, openseamap: false },
    {
      theme: 'night',
      basemap: 'osm',
      aerial: false,
      openseamap: true,
      seamarks: false,
    },
  ] as Partial<StyleOptions>[])('passes the style specification: %j', (o) => {
    expect(validateStyleMin(style(o) as never)).toEqual([]);
  });
});
