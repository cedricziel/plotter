import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../src/i18n';
import { errorText, warningText } from '../src/i18n/texts';
import { api } from '../src/services/api';

const bridges = (count: number) => ({
  code: 'unknown-clearance' as const,
  params: { count },
  text: `${count} fixed bridge${count === 1 ? '' : 's'} with unknown clearance`,
});

afterEach(() => {
  setLanguage('en');
  vi.unstubAllGlobals();
});

describe('warningText', () => {
  it('words a coded warning in the chosen language', () => {
    setLanguage('de');
    expect(warningText(bridges(1))).toBe('1 feste Brücke mit unbekannter Durchfahrtshöhe');
    expect(warningText(bridges(2))).toBe('2 feste Brücken mit unbekannter Durchfahrtshöhe');
    setLanguage('en');
    expect(warningText(bridges(2))).toBe('2 fixed bridges with unknown clearance');
  });

  it('shows the English text of an unknown code', () => {
    setLanguage('de');
    expect(warningText({ code: 'tide', params: {}, text: 'Mind the tide' })).toBe('Mind the tide');
  });

  it('reads the plain strings of an older server or a saved route', () => {
    setLanguage('de');
    expect(warningText('3 fixed bridges with unknown clearance')).toBe(
      '3 feste Brücken mit unbekannter Durchfahrtshöhe',
    );
    expect(warningText('Something new')).toBe('Something new');
  });
});

describe('errorText', () => {
  const cases: [string, Record<string, number> | undefined, string, string][] = [
    [
      'no-snap-start',
      { km: 5 },
      'No charted waterway within 5 km of the start',
      'Kein kartiertes Gewässer im Umkreis von 5 km um den Start',
    ],
    [
      'no-snap-destination',
      { km: 5 },
      'No charted waterway within 5 km of the destination',
      'Kein kartiertes Gewässer im Umkreis von 5 km um das Ziel',
    ],
    ['unreachable', undefined, 'No navigable connection to the destination', 'Keine befahrbare Verbindung zum Ziel'],
    [
      'blocked',
      undefined,
      'No route fits the vessel: a low bridge or a depth or width limit is in the way',
      'Keine Route passt zum Schiff: Eine niedrige Brücke oder eine Tiefen- oder Breitenbegrenzung ist im Weg',
    ],
    ['rate-limited', undefined, 'Too many requests – wait a moment', 'Zu viele Anfragen – bitte kurz warten'],
    ['bad-request', undefined, 'Invalid request', 'Ungültige Anfrage'],
    ['outside-area', undefined, 'Outside the Netherlands', 'Außerhalb der Niederlande'],
    ['not-ready', undefined, 'Routing data not available yet', 'Routendaten noch nicht verfügbar'],
    ['not-found', undefined, 'Not found', 'Nicht gefunden'],
    ['internal', undefined, 'Server error', 'Serverfehler'],
    [
      'corridor-too-large',
      { maxTiles: 3000 },
      'Too many map tiles for one download (more than 3000): the route is too long',
      'Zu viele Kartenkacheln für einen Download (mehr als 3000): Die Route ist zu lang',
    ],
    ['corridor-too-long', { km: 600 }, 'Route longer than 600 km', 'Route länger als 600 km'],
  ];

  it.each(cases)('words %s in both languages', (code, params, english, german) => {
    const body = { error: 'server text', code, params };
    expect(errorText(body)).toBe(english);
    setLanguage('de');
    expect(errorText(body)).toBe(german);
  });

  it('shows the English error of an unknown or missing code', () => {
    setLanguage('de');
    expect(errorText({ error: 'teapot', code: 'teapot' })).toBe('teapot');
    expect(errorText({ error: 'too many requests' })).toBe('too many requests');
  });
});

describe('api errors in the chosen language', () => {
  const stub = (fn: typeof fetch) => {
    vi.stubGlobal('location', { href: 'http://plotter.test/' });
    vi.stubGlobal('fetch', fn);
  };
  const answer = (status: number, body: unknown) =>
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  const route = () => api.route({ from: { lat: 52, lon: 5 }, to: { lat: 52.1, lon: 5 } });

  it('words a coded error body', async () => {
    setLanguage('de');
    stub(
      answer(422, {
        error: 'No charted waterway within 5 km of the destination',
        code: 'no-snap-destination',
        params: { km: 5 },
        reason: 'no-snap',
      }),
    );
    await expect(route()).rejects.toMatchObject({
      kind: 'rejected',
      code: 'no-snap-destination',
      message: 'Kein kartiertes Gewässer im Umkreis von 5 km um das Ziel',
    });
    stub(answer(429, { error: 'too many requests', code: 'rate-limited' }));
    await expect(api.search('ho', null)).rejects.toMatchObject({
      message: 'Zu viele Anfragen – bitte kurz warten',
    });
  });

  it('keeps the English error of an older server', async () => {
    setLanguage('de');
    stub(
      answer(404, {
        error: 'No navigable connection to the destination in the routing data',
      }),
    );
    await expect(route()).rejects.toMatchObject({
      message: 'No navigable connection to the destination in the routing data',
    });
  });

  it('says in German when the service is offline or answers garbage', async () => {
    setLanguage('de');
    stub(vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(route()).rejects.toMatchObject({
      kind: 'unavailable',
      message: 'Routendienst nicht erreichbar',
    });
    stub(vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })));
    await expect(route()).rejects.toMatchObject({
      message: 'Routendienst hat eine unlesbare Antwort gesendet',
    });
  });
});
