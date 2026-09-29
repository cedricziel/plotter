import { describe, expect, it } from 'vitest';
import { kindLabel, seamarkRows, symbolKey, symbolSpec } from '../src/core/seamark-symbol';
import type { Seamark } from '../src/core/waterway-data';

const mark = (type: string, more: Partial<Seamark> = {}): Seamark => ({
  lat: 52.38,
  lon: 4.9,
  type,
  ...more,
});

describe('symbolSpec', () => {
  it('draws a port buoy as a red can and a starboard buoy as a green cone', () => {
    expect(symbolSpec(mark('buoy_lateral', { category: 'port', colour: 'red', shape: 'can' }))).toEqual({
      body: 'buoy',
      shape: 'can',
      bands: ['red'],
    });
    expect(
      symbolSpec(
        mark('buoy_lateral', {
          category: 'starboard',
          colour: 'green',
          shape: 'conical',
        }),
      ),
    ).toEqual({
      body: 'buoy',
      shape: 'cone',
      bands: ['green'],
    });
  });

  it('falls back to the side for shape and colour', () => {
    expect(symbolSpec(mark('buoy_lateral', { category: 'port' }))).toMatchObject({ shape: 'can', bands: ['red'] });
    expect(symbolSpec(mark('buoy_lateral', { category: 'starboard' }))).toMatchObject({
      shape: 'cone',
      bands: ['green'],
    });
  });

  it('uses the side colour for inland marks tagged left and right with no usable colour', () => {
    expect(symbolSpec(mark('beacon_lateral', { category: 'waterway_left', colour: 'grey' })).bands).toEqual(['red']);
    expect(symbolSpec(mark('beacon_lateral', { category: 'waterway_right', colour: 'grey' })).bands).toEqual(['green']);
    expect(symbolSpec(mark('buoy_lateral', { category: 'danger_left' })).bands).toEqual(['red']);
  });

  it('keeps the tagged colour bands, up to four', () => {
    expect(
      symbolSpec(
        mark('buoy_lateral', {
          category: 'harbour_right',
          colour: 'red;white;red;white;red',
        }),
      ).bands,
    ).toEqual(['red', 'white', 'red', 'white']);
    expect(
      symbolSpec(
        mark('buoy_lateral', {
          category: 'preferred_channel_port',
          colour: 'green;red',
        }),
      ).bands,
    ).toEqual(['green', 'red']);
  });

  it('defaults preferred channel marks to their bands', () => {
    expect(symbolSpec(mark('buoy_lateral', { category: 'preferred_channel_port' })).bands).toEqual([
      'red',
      'green',
      'red',
    ]);
    expect(symbolSpec(mark('buoy_lateral', { category: 'preferred_channel_starboard' })).bands).toEqual([
      'green',
      'red',
      'green',
    ]);
  });

  it('gives cardinal marks their bands and topmark by direction', () => {
    const card = (category: string) => symbolSpec(mark('buoy_cardinal', { category }));
    expect(card('north')).toEqual({
      body: 'buoy',
      shape: 'pillar',
      bands: ['black', 'yellow'],
      topmark: 'cones-up',
    });
    expect(card('east')).toMatchObject({
      bands: ['black', 'yellow', 'black'],
      topmark: 'cones-base',
    });
    expect(card('south')).toMatchObject({
      bands: ['yellow', 'black'],
      topmark: 'cones-down',
    });
    expect(card('west')).toMatchObject({
      bands: ['yellow', 'black', 'yellow'],
      topmark: 'cones-point',
    });
  });

  it('prefers the tagged topmark', () => {
    const north = mark('beacon_cardinal', {
      category: 'north',
      topmark: '2 cones down',
    });
    expect(symbolSpec(north)).toMatchObject({
      body: 'beacon',
      topmark: 'cones-down',
    });
  });

  it('reads the topmark descriptions', () => {
    const top = (topmark: string) => symbolSpec(mark('beacon_lateral', { category: 'port', topmark })).topmark;
    expect(top('cone, point up')).toBe('cone-up');
    expect(top('cone, point down')).toBe('cone-down');
    expect(top('cylinder')).toBe('cylinder');
    expect(top('sphere')).toBe('sphere');
    expect(top('x-shape')).toBe('x');
    expect(top('2 cones base together')).toBe('cones-base');
    expect(top('2 cones point together')).toBe('cones-point');
    expect(top('2 cones up')).toBe('cones-up');
    expect(top('2 spheres')).toBe('spheres');
    expect(top('something unheard of')).toBeUndefined();
  });

  it('draws isolated danger, safe water and special purpose marks', () => {
    expect(symbolSpec(mark('buoy_isolated_danger'))).toMatchObject({
      bands: ['black', 'red', 'black'],
      topmark: 'spheres',
    });
    expect(symbolSpec(mark('buoy_safe_water'))).toMatchObject({
      shape: 'sphere',
      bands: ['red', 'white'],
      topmark: 'sphere',
    });
    expect(symbolSpec(mark('buoy_special_purpose', { colour: 'yellow' }))).toMatchObject({
      bands: ['yellow'],
      topmark: 'x',
    });
    expect(symbolSpec(mark('beacon_special_purpose'))).toMatchObject({
      body: 'beacon',
      bands: ['yellow'],
      topmark: 'x',
    });
  });

  it('keeps an unknown colour readable as grey', () => {
    expect(symbolSpec(mark('buoy_special_purpose', { colour: 'magenta' })).bands).toEqual(['grey']);
  });

  it('draws lights and notices without bands', () => {
    expect(symbolSpec(mark('light_minor', { light: 'Fl W 5s' }))).toEqual({
      body: 'light',
      bands: [],
    });
    expect(symbolSpec(mark('light_major'))).toEqual({
      body: 'light',
      bands: [],
    });
    expect(symbolSpec(mark('notice', { category: 'no_entry' }))).toEqual({
      body: 'notice',
      bands: [],
    });
  });
});

describe('symbolKey', () => {
  it('is the same for the same symbol and differs between symbols', () => {
    const a = symbolSpec(mark('buoy_lateral', { category: 'port' }));
    const b = symbolSpec(mark('buoy_lateral', { category: 'port', name: 'other name' }));
    const c = symbolSpec(mark('buoy_lateral', { category: 'starboard' }));
    expect(symbolKey(a)).toBe(symbolKey(b));
    expect(symbolKey(a)).not.toBe(symbolKey(c));
  });
});

describe('kindLabel', () => {
  it('names the kind of mark with its category', () => {
    expect(kindLabel(mark('buoy_lateral', { category: 'port' }))).toBe('Lateral buoy, port');
    expect(kindLabel(mark('beacon_cardinal', { category: 'north' }))).toBe('Cardinal beacon, north');
    expect(kindLabel(mark('buoy_special_purpose'))).toBe('Special purpose buoy');
    expect(kindLabel(mark('buoy_lateral', { category: 'preferred_channel_port' }))).toBe(
      'Lateral buoy, preferred channel port',
    );
    expect(kindLabel(mark('notice', { category: 'no_entry' }))).toBe('Notice, no entry');
    expect(kindLabel(mark('light_minor'))).toBe('Light');
    expect(kindLabel(mark('light_major'))).toBe('Major light');
  });

  it('shows an unknown type readably', () => {
    expect(kindLabel(mark('buoy_installation'))).toBe('Buoy installation');
  });
});

describe('seamarkRows', () => {
  it('lists name, colours and light', () => {
    const rows = seamarkRows(mark('buoy_lateral', { name: 'IJ 12', colour: 'red', light: 'Fl R 4s' }));
    expect(rows).toEqual([
      ['Name', 'IJ 12'],
      ['Colour', 'red'],
      ['Light', 'Fl R 4s'],
    ]);
  });

  it('joins colour bands and lists the topmark', () => {
    const rows = seamarkRows(mark('buoy_cardinal', { colour: 'black;yellow', topmark: '2 cones up' }));
    expect(rows).toEqual([
      ['Colour', 'black, yellow'],
      ['Topmark', '2 cones up'],
    ]);
  });

  it('has no rows for an unnamed mark without details', () => {
    expect(seamarkRows(mark('notice'))).toEqual([]);
  });
});
