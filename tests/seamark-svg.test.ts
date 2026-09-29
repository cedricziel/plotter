import { describe, expect, it } from 'vitest';
import { symbolSpec, type SymbolSpec } from '../src/core/seamark-symbol';
import { flareSvg, symbolSvg } from '../src/map/seamark-svg';
import type { Seamark } from '../src/core/waterway-data';

const svgOf = (type: string, more: Partial<Seamark> = {}, theme: 'day' | 'night' = 'day') =>
  symbolSvg(symbolSpec({ lat: 52, lon: 5, type, ...more }), theme);
const count = (svg: string, tag: string) => svg.match(new RegExp(`<${tag}[ />]`, 'g'))?.length ?? 0;
const colours = (svg: string) => [...svg.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0].toLowerCase());
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const every: SymbolSpec[] = [
  ...['buoy_lateral', 'buoy_cardinal', 'buoy_isolated_danger', 'buoy_safe_water', 'buoy_special_purpose'].map((type) =>
    symbolSpec({
      lat: 0,
      lon: 0,
      type,
      category: type === 'buoy_cardinal' ? 'south' : 'port',
    }),
  ),
  ...['beacon_lateral', 'beacon_cardinal', 'beacon_special_purpose'].map((type) =>
    symbolSpec({
      lat: 0,
      lon: 0,
      type,
      category: type === 'beacon_cardinal' ? 'east' : 'starboard',
    }),
  ),
  symbolSpec({ lat: 0, lon: 0, type: 'light_minor' }),
  symbolSpec({ lat: 0, lon: 0, type: 'notice' }),
];

describe('symbolSvg', () => {
  it('is a sized svg document', () => {
    const svg = svgOf('buoy_lateral', { category: 'port' });
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="64" height="64" viewBox="0 0 32 32">/);
    expect(svg).toMatch(/<\/svg>$/);
  });

  it('draws a port buoy as a can and a starboard buoy as a cone', () => {
    const port = svgOf('buoy_lateral', { category: 'port' });
    const starboard = svgOf('buoy_lateral', { category: 'starboard' });
    expect(count(port, 'rect')).toBeGreaterThan(0);
    expect(count(port, 'polygon')).toBe(0);
    expect(count(starboard, 'polygon')).toBeGreaterThan(0);
    expect(colours(port)).toContain('#d6262b');
    expect(colours(starboard)).toContain('#1e9e46');
  });

  it('paints every colour band of a cardinal mark', () => {
    const svg = svgOf('buoy_cardinal', { category: 'east' });
    const used = colours(svg);
    expect(used).toContain('#1a1a1a');
    expect(used).toContain('#f7d117');
  });

  it('draws topmarks', () => {
    expect(count(svgOf('buoy_cardinal', { category: 'east' }), 'polygon')).toBe(2);
    expect(count(svgOf('beacon_lateral', { category: 'port', topmark: 'sphere' }), 'circle')).toBe(1);
    expect(count(svgOf('beacon_lateral', { category: 'port', topmark: 'x-shape' }), 'line')).toBe(4);
    expect(svgOf('beacon_lateral', { category: 'port' })).not.toBe(
      svgOf('beacon_lateral', { category: 'port', topmark: 'cylinder' }),
    );
  });

  it('draws different symbols for the four cardinal directions', () => {
    const svgs = ['north', 'east', 'south', 'west'].map((category) => svgOf('buoy_cardinal', { category }));
    expect(new Set(svgs).size).toBe(4);
  });

  it('draws beacons as stakes and buoys as bodies', () => {
    expect(svgOf('beacon_lateral', { category: 'port' })).not.toBe(svgOf('buoy_lateral', { category: 'port' }));
  });

  it('draws lights and notices', () => {
    expect(colours(svgOf('light_minor'))).toContain('#c2188f');
    expect(count(svgOf('notice'), 'rect')).toBeGreaterThan(0);
  });

  it('paints the night palette in red and black shades only', () => {
    for (const spec of every) {
      for (const hex of colours(symbolSvg(spec, 'night'))) {
        const [r, g, b] = channels(hex);
        expect(r, hex).toBeGreaterThanOrEqual(g);
        expect(g, hex).toBe(b);
      }
    }
  });

  it('keeps red and green lateral marks apart at night by fill', () => {
    const port = svgOf('buoy_lateral', { category: 'port', shape: 'can' }, 'night');
    const starboard = svgOf('buoy_lateral', { category: 'starboard', shape: 'can' }, 'night');
    expect(port).not.toBe(starboard);
    expect(colours(port)).not.toEqual(colours(starboard));
  });

  it('differs between day and night', () => {
    expect(svgOf('buoy_lateral', { category: 'port' })).not.toBe(svgOf('buoy_lateral', { category: 'port' }, 'night'));
  });
});

describe('flareSvg', () => {
  it('is magenta by day and red at night', () => {
    expect(colours(flareSvg('day'))).toContain('#c2188f');
    for (const hex of colours(flareSvg('night'))) {
      const [r, g, b] = channels(hex);
      expect(r).toBeGreaterThanOrEqual(g);
      expect(g).toBe(b);
    }
  });
});
