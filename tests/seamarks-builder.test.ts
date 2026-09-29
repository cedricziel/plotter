import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSeamarks, SEAMARK_TYPES } from '../tools/waterways/seamarks.ts';

const esc = (s: string) => s.replace(/[ ,=%\n@]/g, (c) => `%${c.charCodeAt(0).toString(16)}%`);
const tagStr = (t: Record<string, string>) =>
  Object.entries(t)
    .map(([k, v]) => `${esc(k)}=${esc(v)}`)
    .join(',');
const node = (id: number, tags: Record<string, string>, lon = 4.9045, lat = 52.3795) =>
  `n${id} v1 dV c1 t2024-01-01T00:00:00Z i1 utest T${tagStr(tags)} x${lon} y${lat}`;

describe('seamark extraction', () => {
  it('keeps a lateral buoy with its attributes and rounded position', () => {
    const [s] = buildSeamarks([
      node(
        1,
        {
          'seamark:type': 'buoy_lateral',
          'seamark:buoy_lateral:category': 'port',
          'seamark:buoy_lateral:colour': 'red',
          'seamark:buoy_lateral:shape': 'can',
          'seamark:name': 'IJ 12',
        },
        4.9045123456,
        52.3795987654,
      ),
    ]);
    expect(s).toEqual({
      lat: 52.3796,
      lon: 4.90451,
      type: 'buoy_lateral',
      category: 'port',
      colour: 'red',
      shape: 'can',
      name: 'IJ 12',
    });
  });

  it('keeps buoys, beacons, lights and notices and ignores the rest', () => {
    const types = [
      'buoy_cardinal',
      'buoy_isolated_danger',
      'buoy_safe_water',
      'buoy_special_purpose',
      'beacon_lateral',
      'beacon_cardinal',
      'light_minor',
      'light_major',
      'notice',
      'bridge',
      'harbour',
      'mooring',
      'gate',
    ];
    const out = buildSeamarks(types.map((t, i) => node(i + 1, { 'seamark:type': t })));
    expect(out.map((s) => s.type)).toEqual(types.slice(0, 9));
  });

  it('ignores untagged nodes, other tags, ways and relations', () => {
    const out = buildSeamarks([
      node(1, { name: 'Just a node' }),
      node(2, { 'seamark:type': 'buoy_lateral' }),
      'w5 v1 dV c1 t2024-01-01T00:00:00Z i1 utest Tseamark:type=buoy_lateral Nn1,n2',
      'r9 v1 dV c1 t2024-01-01T00:00:00Z i1 utest Tseamark:type=buoy_lateral Mn1@',
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('buoy_lateral');
  });

  it('reads the topmark and the colour bands of a cardinal mark', () => {
    const [s] = buildSeamarks([
      node(1, {
        'seamark:type': 'buoy_cardinal',
        'seamark:buoy_cardinal:category': 'north',
        'seamark:buoy_cardinal:colour': 'black;yellow',
        'seamark:buoy_cardinal:shape': 'pillar',
        'seamark:topmark:shape': '2 cones up',
      }),
    ]);
    expect(s).toMatchObject({
      category: 'north',
      colour: 'black;yellow',
      shape: 'pillar',
      topmark: '2 cones up',
    });
  });

  it('builds the light character from the light tags', () => {
    const light = (t: Record<string, string>) =>
      buildSeamarks([node(1, { 'seamark:type': 'light_minor', ...t })])[0].light;
    expect(
      light({
        'seamark:light:character': 'Fl',
        'seamark:light:colour': 'green',
        'seamark:light:period': '5',
      }),
    ).toBe('Fl G 5s');
    expect(
      light({
        'seamark:light:character': 'Fl',
        'seamark:light:group': '2',
        'seamark:light:colour': 'white',
        'seamark:light:period': '10',
      }),
    ).toBe('Fl(2) W 10s');
    expect(
      light({
        'seamark:light:character': 'Iso',
        'seamark:light:colour': 'red',
        'seamark:light:period': '4.5',
      }),
    ).toBe('Iso R 4.5s');
    expect(light({})).toBeUndefined();
  });

  it('uses the first numbered light when there is no plain one', () => {
    const [s] = buildSeamarks([
      node(1, {
        'seamark:type': 'light_major',
        'seamark:light:1:character': 'Oc',
        'seamark:light:1:colour': 'white',
        'seamark:light:1:period': '6',
        'seamark:light:2:character': 'F',
        'seamark:light:2:colour': 'red',
      }),
    ]);
    expect(s.light).toBe('Oc W 6s');
  });

  it('gives a light on a buoy to the buoy', () => {
    const [s] = buildSeamarks([
      node(1, {
        'seamark:type': 'buoy_lateral',
        'seamark:light:character': 'Q',
        'seamark:light:colour': 'red',
      }),
    ]);
    expect(s.light).toBe('Q R');
  });

  it('takes the name from seamark:name, then name, then the reference', () => {
    const name = (t: Record<string, string>) =>
      buildSeamarks([node(1, { 'seamark:type': 'buoy_lateral', ...t })])[0].name;
    expect(name({ 'seamark:name': 'A', name: 'B', 'seamark:ref': 'C' })).toBe('A');
    expect(name({ name: 'B', 'seamark:ref': 'C' })).toBe('B');
    expect(name({ 'seamark:ref': 'C' })).toBe('C');
    expect(name({})).toBeUndefined();
  });

  it('omits empty fields', () => {
    const [s] = buildSeamarks([node(1, { 'seamark:type': 'notice', 'seamark:name': ' ' })]);
    expect(Object.keys(s).sort()).toEqual(['lat', 'lon', 'type']);
  });

  it('is fed by the same types the extract job filters for', () => {
    const script = readFileSync(new URL('../deploy/waterways.sh', import.meta.url), 'utf8');
    expect(script).toContain(`n/seamark:type=${SEAMARK_TYPES.join(',')}`);
  });
});
