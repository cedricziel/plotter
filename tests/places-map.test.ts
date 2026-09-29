import { describe, expect, it } from 'vitest';
import { basemapPlace } from '../src/map/places';

const point = (lon: number, lat: number): GeoJSON.Point => ({
  type: 'Point',
  coordinates: [lon, lat],
});

describe('basemapPlace', () => {
  it('uses the Dutch name and the detail kind', () => {
    expect(basemapPlace({ 'name:nl': 'Hoorn', name: 'Hoorn NL', kind_detail: 'city' }, point(5.06, 52.64))).toEqual({
      name: 'Hoorn',
      kind: 'city',
      lat: 52.64,
      lon: 5.06,
    });
  });

  it('falls back to the population, then to town', () => {
    const kind = (props: Record<string, unknown>) => basemapPlace({ name: 'X', ...props }, point(5, 52))?.kind;
    expect(kind({ kind_detail: 'hamlet' })).toBe('village');
    expect(kind({ population: 120_000 })).toBe('city');
    expect(kind({ population: 900 })).toBe('village');
    expect(kind({ population: 20_000 })).toBe('town');
    expect(kind({})).toBe('town');
  });

  it('ignores unnamed and non-point features', () => {
    expect(basemapPlace({ kind_detail: 'town' }, point(5, 52))).toBeNull();
    expect(basemapPlace({ name: 'X' }, { type: 'LineString', coordinates: [] })).toBeNull();
  });
});
