import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Announcer,
  OffCourseMonitor,
  pointAlong,
  projectOnShape,
  shapeInfo,
  shapeProgress,
  withConnectors,
} from '../src/core/course';
import { destination, distance } from '../src/core/geo';
import { setLanguage } from '../src/i18n';
import { announcement } from '../src/i18n/maneuvers';
import { speak } from '../src/services/voice';

const origin = { lat: 52.0, lon: 5.0 };
const at = (east: number, north: number) => {
  const p = destination(destination(origin, 90, east), 0, north);
  return { lat: p.lat, lon: p.lon };
};
const ll = (p: { lat: number; lon: number }): [number, number] => [p.lon, p.lat];
// east 0 -> 2000 m, then north 0 -> 1000 m
const shape = [at(0, 0), at(1000, 0), at(2000, 0), at(2000, 1000)].map(ll);
const info = shapeInfo(shape);

describe('shape geometry', () => {
  it('accumulates distance along the shape', () => {
    expect(info.total).toBeCloseTo(3000, -1);
    expect(info.cum[2]).toBeCloseTo(2000, -1);
  });

  it('finds the point at a distance along the shape', () => {
    const p = pointAlong(info, 2500);
    expect(distance(p, at(2000, 500))).toBeLessThan(5);
    expect(distance(pointAlong(info, -5), at(0, 0))).toBeLessThan(1);
    expect(distance(pointAlong(info, 99999), at(2000, 1000))).toBeLessThan(1);
  });
});

describe('projectOnShape', () => {
  it('returns along distance and signed cross-track error (positive = starboard)', () => {
    const right = projectOnShape(info, at(500, -40));
    expect(right.along).toBeCloseTo(500, -1);
    expect(right.xte).toBeCloseTo(40, -1);
    const left = projectOnShape(info, at(500, 40));
    expect(left.xte).toBeCloseTo(-40, -1);
    const northLeg = projectOnShape(info, at(2030, 400));
    expect(northLeg.along).toBeCloseTo(2400, -1);
    expect(northLeg.xte).toBeCloseTo(30, -1); // heading north, east is starboard
  });

  it('prefers the segment near the previous position when the shape doubles back', () => {
    const loop = shapeInfo([at(0, 0), at(2000, 0), at(2000, 50), at(0, 50)].map(ll));
    const near = projectOnShape(loop, at(1000, 10), 0);
    expect(near.along).toBeLessThan(1500);
    const later = projectOnShape(loop, at(1000, 10), 3000);
    expect(later.along).toBeGreaterThan(2000);
  });

  it('falls back to a global search when far from the hint', () => {
    const p = projectOnShape(info, at(2000, 900), 0);
    expect(p.along).toBeCloseTo(2900, -1);
  });
});

describe('shapeProgress', () => {
  const maneuvers = [{ dist: 0 }, { dist: 2000 }, { dist: 3000 }];

  it('reports distance to the next maneuver, remaining distance and xte', () => {
    const p = shapeProgress(info, maneuvers, at(500, -20), { speed: 2, cog: 90, index: 0 })!;
    expect(p.nextIndex).toBe(0);
    expect(p.dtw).toBeCloseTo(1500, -1);
    expect(p.remaining).toBeCloseTo(2500, -1);
    expect(p.xte).toBeCloseTo(20, -1);
    expect(p.ttg).toBeCloseTo(1250, -1);
    expect(p.finished).toBe(false);
    expect(p.btw).toBeGreaterThan(70);
    expect(p.btw).toBeLessThan(110);
  });

  it('advances to the next maneuver once it is passed', () => {
    const p = shapeProgress(info, maneuvers, at(2000, 200), { speed: 2, cog: 0, index: 0 })!;
    expect(p.nextIndex).toBe(1);
    expect(p.dtw).toBeCloseTo(800, -1);
    expect(p.steer).toBeCloseTo(0, 0);
  });

  it('does not go backwards and finishes at the end', () => {
    const p = shapeProgress(info, maneuvers, at(500, 0), { speed: 2, cog: 90, index: 1 })!;
    expect(p.nextIndex).toBe(1);
    const end = shapeProgress(info, maneuvers, at(2000, 985), { speed: 2, cog: 0, index: 1 })!;
    expect(end.nextIndex).toBe(1);
    expect(end.finished).toBe(true);
  });

  it('has no ETA without a speed', () => {
    const p = shapeProgress(info, maneuvers, at(500, 0), { speed: null, cog: null, index: 0 })!;
    expect(p.ttg).toBeNull();
    expect(p.steer).toBeNull();
  });
});

describe('OffCourseMonitor', () => {
  it('flags off course after 20 s beyond 150 m and recovers when back', () => {
    const m = new OffCourseMonitor();
    expect(m.update(0, 200, true)).toMatchObject({ off: false });
    expect(m.update(19_000, 200, true)).toMatchObject({ off: false });
    expect(m.update(21_000, 200, true)).toMatchObject({ off: true, recalc: false });
    expect(m.update(22_000, 100, true)).toMatchObject({ off: false });
    expect(m.update(23_000, 200, true)).toMatchObject({ off: false });
  });

  it('asks for one automatic recalculation after 60 s', () => {
    const m = new OffCourseMonitor();
    m.update(0, 300, true);
    expect(m.update(59_000, 300, true).recalc).toBe(false);
    expect(m.update(61_000, 300, true).recalc).toBe(true);
    expect(m.update(90_000, 300, true).recalc).toBe(false);
  });

  it('ignores positions without a real fix and can be reset', () => {
    const m = new OffCourseMonitor();
    m.update(0, 300, true);
    expect(m.update(30_000, 300, false)).toMatchObject({ off: false });
    m.update(31_000, 300, true);
    m.reset();
    expect(m.update(60_000, 300, true)).toMatchObject({ off: false });
  });
});

describe('Announcer', () => {
  it('speaks at about 500 m and 100 m, once each per maneuver', () => {
    const a = new Announcer();
    expect(a.update('m1', 900, 'Turn left into Zaan')).toBeNull();
    expect(a.update('m1', 480, 'Turn left into Zaan')).toBe('In 500 metres, Turn left into Zaan');
    expect(a.update('m1', 450, 'Turn left into Zaan')).toBeNull();
    expect(a.update('m1', 95, 'Turn left into Zaan')).toBe('In 100 metres, Turn left into Zaan');
    expect(a.update('m1', 60, 'Turn left into Zaan')).toBeNull();
  });

  it('skips the 500 m call when first seen close by, and starts over for the next maneuver', () => {
    const a = new Announcer();
    expect(a.update('m1', 90, 'Pass Sluis (lock)')).toBe('In 100 metres, Pass Sluis (lock)');
    expect(a.update('m1', 80, 'Pass Sluis (lock)')).toBeNull();
    expect(a.update('m2', 480, 'Arrive')).toBe('In 500 metres, Arrive');
  });
});

describe('Announcer in German', () => {
  afterEach(() => setLanguage('en'));

  it('says the distance in German and keeps nouns capitalised', () => {
    setLanguage('de');
    const a = new Announcer(announcement);
    expect(a.update('m1', 480, 'Rechts abbiegen in Pikmar')).toBe('In 500 Metern, rechts abbiegen in Pikmar');
    expect(a.update('m1', 95, 'Rechts abbiegen in Pikmar')).toBe('In 100 Metern, rechts abbiegen in Pikmar');
    expect(a.update('m2', 480, 'Schleuse Oranjesluizen passieren')).toBe(
      'In 500 Metern, Schleuse Oranjesluizen passieren',
    );
    expect(a.update('m3', 90, 'Feste Brücke, 5,4 m Durchfahrtshöhe')).toBe(
      'In 100 Metern, feste Brücke, 5,4 m Durchfahrtshöhe',
    );
  });

  it('keeps the English phrase', () => {
    expect(new Announcer(announcement).update('m1', 480, 'Turn left into Zaan')).toBe(
      'In 500 metres, Turn left into Zaan',
    );
  });
});

describe('speak', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for a voice in the chosen language', () => {
    const spoken: { text: string; lang: string }[] = [];
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        lang = '';
        constructor(public text: string) {}
      },
    );
    vi.stubGlobal('speechSynthesis', {
      cancel: () => {},
      speak: (u: { text: string; lang: string }) => spoken.push(u),
    });
    speak('In 500 Metern, rechts abbiegen in Pikmar', 'de');
    speak('Off course');
    expect(spoken.map((u) => [u.text, u.lang])).toEqual([
      ['In 500 Metern, rechts abbiegen in Pikmar', 'de-DE'],
      ['Off course', 'en-GB'],
    ]);
  });
});

describe('withConnectors', () => {
  const m = [
    { type: 'depart', dist: 0, ...at(0, 0) },
    { type: 'turn-left', dist: 1000, ...at(1000, 0) },
    { type: 'arrive', dist: 3000, ...at(2000, 1000) },
  ];

  it('adds straight connectors and shifts the maneuvers', () => {
    const r = withConnectors(shape, m, at(-100, 0), at(2000, 1200));
    expect(r.shape).toHaveLength(shape.length + 2);
    expect(r.maneuvers[0]).toMatchObject({ dist: 0, lat: at(-100, 0).lat });
    expect(r.maneuvers[1].dist).toBeCloseTo(1100, -1);
    expect(r.maneuvers[2].dist).toBeCloseTo(3300, -1);
    expect(r.maneuvers[2].lat).toBeCloseTo(at(2000, 1200).lat, 6);
  });

  it('leaves the route alone when start and destination are on the waterway', () => {
    const r = withConnectors(shape, m, at(5, 0), at(2000, 1010));
    expect(r.shape).toHaveLength(shape.length);
    expect(r.maneuvers[1].dist).toBe(1000);
  });
});
