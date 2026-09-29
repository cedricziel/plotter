import { afterEach, describe, expect, it } from 'vitest';
import { decodeGraph, findRouteVia, type Maneuver, type ManeuverType } from '../src/core/routing';
import { setLanguage } from '../src/i18n';
import { maneuverText, warningText } from '../src/i18n/maneuvers';
import { fixture, latlon } from './graph-fixture';

const m = (type: ManeuverType, fields: Partial<Maneuver> = {}): Maneuver => ({
  type,
  lat: 52,
  lon: 5,
  dist: 0,
  text: 'server text',
  name: null,
  ...fields,
});

const cases: [Maneuver, string, string][] = [
  [m('depart', { name: 'IJ' }), 'Depart on IJ', 'Abfahrt auf IJ'],
  [m('depart'), 'Depart', 'Abfahrt'],
  [m('turn-left', { name: 'IJ' }), 'Turn left into IJ', 'Links abbiegen in IJ'],
  [m('turn-right', { name: 'Pikmar' }), 'Turn right into Pikmar', 'Rechts abbiegen in Pikmar'],
  [m('turn-right'), 'Turn right', 'Rechts abbiegen'],
  [m('slight-left', { name: 'Zaan' }), 'Slight left into Zaan', 'Leicht links abbiegen in Zaan'],
  [m('slight-right', { name: 'Zaan' }), 'Slight right into Zaan', 'Leicht rechts abbiegen in Zaan'],
  [m('sharp-left', { name: 'Vecht' }), 'Sharp left into Vecht', 'Scharf links abbiegen in Vecht'],
  [
    m('sharp-right', { name: 'Amsterdam-Rijnkanaal' }),
    'Sharp right into Amsterdam-Rijnkanaal',
    'Scharf rechts abbiegen in Amsterdam-Rijnkanaal',
  ],
  [m('continue', { name: 'Pikmar' }), 'Continue on Pikmar', 'Weiter auf Pikmar'],
  [m('lock', { name: 'Oranjesluizen' }), 'Pass Oranjesluizen (lock)', 'Schleuse Oranjesluizen passieren'],
  [m('lock'), 'Pass lock', 'Schleuse passieren'],
  [
    m('bridge-open', { name: 'Schellingwoude', clearance: 290 }),
    'Opening bridge: Schellingwoude',
    'Klappbrücke: Schellingwoude',
  ],
  [m('bridge-open'), 'Opening bridge', 'Klappbrücke'],
  [m('bridge-fixed', { clearance: 540 }), 'Fixed bridge, clearance 5.4 m', 'Feste Brücke, 5,4 m Durchfahrtshöhe'],
  [
    m('bridge-fixed', { name: 'Brug X', clearance: 520 }),
    'Fixed bridge Brug X, clearance 5.2 m',
    'Feste Brücke Brug X, 5,2 m Durchfahrtshöhe',
  ],
  [m('bridge-fixed'), 'Fixed bridge, clearance unknown', 'Feste Brücke, Durchfahrtshöhe unbekannt'],
  [m('via', { stop: 2 }), 'Via stop 2', 'Zwischenstopp 2'],
  [m('arrive', { name: 'Jachthaven De Pikmar' }), 'Arrive at Jachthaven De Pikmar', 'Ankunft in Jachthaven De Pikmar'],
  [m('arrive'), 'Arrive', 'Ankunft'],
];

describe('maneuverText', () => {
  afterEach(() => setLanguage('en'));

  it('covers every maneuver type', () => {
    const types = new Set(cases.map(([x]) => x.type));
    expect(types.size).toBe(13);
  });

  for (const [maneuver, english, german] of cases) {
    it(`writes ${maneuver.type} (${maneuver.name ?? 'unnamed'}) in both languages`, () => {
      expect(maneuverText(maneuver)).toBe(english);
      setLanguage('de');
      expect(maneuverText(maneuver)).toBe(german);
    });
  }

  it('shows the stored text of a maneuver saved before names existed', () => {
    const old = {
      type: 'continue',
      lat: 52,
      lon: 5,
      dist: 0,
      text: 'Continue on Pikmar',
    } as Maneuver;
    setLanguage('de');
    expect(maneuverText(old)).toBe('Continue on Pikmar');
  });

  it('translates an unnamed maneuver instead of falling back', () => {
    setLanguage('de');
    expect(maneuverText(m('lock', { text: 'Pass lock', name: null }))).toBe('Schleuse passieren');
  });
});

describe('maneuverText against the router', () => {
  it('reproduces the English text the router sends', () => {
    const g = decodeGraph(
      fixture({ S: [0, 0], J: [5000, 0], T: [10000, 0] }, [
        {
          a: 'S',
          b: 'J',
          name: 'Kanaal',
          obstacles: [
            { pos: 1000, type: 'lock', name: 'Oranjesluizen' },
            { pos: 2000, type: 'movable' },
            { pos: 3000, type: 'fixed', name: 'Brug X', clearance: 520 },
            { pos: 4000, type: 'fixed' },
          ],
        },
        { a: 'J', b: 'T', name: 'Vaart' },
      ]),
    );
    const r = findRouteVia(g, [latlon(0, 0), latlon(5000, 50), latlon(10000, 0)], { destName: 'Einde' });
    if (!r.ok) throw new Error(r.message);
    expect(r.maneuvers.length).toBeGreaterThan(5);
    for (const x of r.maneuvers) expect(maneuverText(x)).toBe(x.text);
  });
});
describe('warningText', () => {
  afterEach(() => setLanguage('en'));

  it('translates the router warning about unknown clearances and keeps other warnings', () => {
    setLanguage('de');
    expect(warningText('1 fixed bridge with unknown clearance')).toBe('1 feste Brücke mit unbekannter Durchfahrtshöhe');
    expect(warningText('3 fixed bridges with unknown clearance')).toBe(
      '3 feste Brücken mit unbekannter Durchfahrtshöhe',
    );
    expect(warningText('Something new')).toBe('Something new');
    setLanguage('en');
    expect(warningText('3 fixed bridges with unknown clearance')).toBe('3 fixed bridges with unknown clearance');
  });
});
