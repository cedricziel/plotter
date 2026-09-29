import { describe, expect, it } from 'vitest';
import { symbolKey, symbolSpec } from '../src/core/seamark-symbol';
import type { Seamark } from '../src/core/waterway-data';
import { seamarkFeatures } from '../src/map/seamarks';

const mark = (type: string, more: Partial<Seamark> = {}): Seamark => ({
  lat: 52.38,
  lon: 4.9,
  type,
  ...more,
});

describe('seamarkFeatures', () => {
  it('makes a point per seamark with its index and symbol image', () => {
    const buoy = mark('buoy_lateral', {
      category: 'port',
      lat: 52.4,
      lon: 4.95,
    });
    const { features } = seamarkFeatures([mark('buoy_cardinal', { category: 'north' }), buoy]);
    expect(features).toHaveLength(2);
    expect(features[1].geometry).toEqual({
      type: 'Point',
      coordinates: [4.95, 52.4],
    });
    expect(features[1].properties).toMatchObject({
      i: 1,
      icon: `sm:${symbolKey(symbolSpec(buoy))}`,
    });
  });

  it('flags a flare next to marks that have a light', () => {
    const flag = (m: Seamark) => seamarkFeatures([m]).features[0].properties;
    expect(flag(mark('buoy_lateral', { category: 'port', light: 'Fl R 4s' }))).toMatchObject({ flare: true });
    expect(flag(mark('buoy_lateral', { category: 'port' }))).toMatchObject({
      flare: false,
    });
    expect(flag(mark('light_minor', { light: 'Fl W 5s' }))).toMatchObject({
      flare: false,
    });
  });

  it('flags notices so they can start at a higher zoom', () => {
    const flag = (m: Seamark) => seamarkFeatures([m]).features[0].properties?.notice;
    expect(flag(mark('notice'))).toBe(true);
    expect(flag(mark('buoy_lateral'))).toBe(false);
  });
});
