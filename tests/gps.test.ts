// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Gps, type Fix } from '../src/services/gps';

type Success = (p: GeolocationPosition) => void;

let watchers: Success[];
let cleared: number[];

beforeEach(() => {
  watchers = [];
  cleared = [];
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: (ok: Success) => watchers.push(ok),
      clearWatch: (id: number) => cleared.push(id),
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

const position = (t: number, lat: number, speed: number) =>
  ({
    coords: { latitude: lat, longitude: 5.72, accuracy: 2, speed, heading: 190 },
    timestamp: t * 1000,
  }) as unknown as GeolocationPosition;

function start() {
  const fixes: Fix[] = [];
  const gps = new Gps({ onFix: (f) => fixes.push(f), onStatus: () => {} });
  gps.start();
  return { gps, fixes };
}

describe('Gps', () => {
  it('restarts the watch and stops passing fixes on when iOS repeats one while under way', () => {
    const { gps, fixes } = start();
    watchers[0](position(0, 53.01, 1.1));
    for (let t = 1; t <= 15; t++) watchers[0](position(t, 53.01, 1.1));
    for (let t = 16; t <= 20; t++) watchers[1](position(t, 53.01, 1.1));

    expect(cleared).toEqual([1]);
    expect(watchers).toHaveLength(2);
    expect(fixes).toHaveLength(12);
    expect(fixes.at(-1)!.time).toBe(11_000);
    expect(gps.stats.summary()?.['plotter.gps.restarts']).toBe(1);
  });

  it('passes fixes on again once they move', () => {
    const { fixes } = start();
    for (let t = 0; t <= 12; t++) watchers[0](position(t, 53.01, 1.1));
    watchers[1](position(13, 53.0099, 1.1));

    expect(fixes.at(-1)!.time).toBe(13_000);
  });

  it('keeps passing on repeated fixes while stopped', () => {
    const { fixes } = start();
    for (let t = 0; t <= 15; t++) watchers[0](position(t, 53.01, 0));

    expect(cleared).toEqual([]);
    expect(fixes).toHaveLength(16);
  });

  it('passes on fixes that move', () => {
    const { fixes } = start();
    for (let t = 0; t <= 15; t++) watchers[0](position(t, 53.01 - t * 1e-5, 1.1));

    expect(cleared).toEqual([]);
    expect(fixes).toHaveLength(16);
  });
});
