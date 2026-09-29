import { describe, expect, it } from 'vitest';
import type { Place } from '../src/core/waterway-data';
import { basemapPlace, markProps } from '../src/map/places';

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

describe('markProps', () => {
  const bridge = (info: Place['info'], name = 'Brug'): Place => ({
    name,
    kind: 'bridge',
    lat: 52,
    lon: 5,
    info,
  });

  it('adds the clearance under a bridge name for close zooms', () => {
    expect(markProps(bridge({ clearance: 2.94 }), 3)).toEqual({
      i: 3,
      name: 'Brug',
      group: 'structure',
      detail: 'Brug\n2.9 m',
      open: false,
    });
  });

  it('marks opening bridges and says so in the label', () => {
    expect(markProps(bridge({ clearance: 3.25, canOpen: true }), 0)).toMatchObject({
      detail: 'Brug\n3.3 m opens',
      open: true,
    });
  });

  it('leaves the name alone without a known clearance and for other kinds', () => {
    expect(markProps(bridge({ canOpen: true }), 0)).toMatchObject({
      detail: 'Brug',
      open: true,
    });
    expect(markProps(bridge(undefined), 0)).toMatchObject({
      detail: 'Brug',
      open: false,
    });
    const lock: Place = {
      name: 'Sluis',
      kind: 'lock',
      lat: 52,
      lon: 5,
      info: { clearance: 4 },
    };
    expect(markProps(lock, 1)).toMatchObject({
      group: 'structure',
      detail: 'Sluis',
      open: false,
    });
  });
});
