// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('__APP_VERSION__', 'test');
vi.stubGlobal('__BUILD_ID__', 'test');
vi.mock('../src/services/db', () => ({
  getKv: async () => undefined,
  setKv: async () => {},
}));
// The destination pin is a MapLibre marker; the stand-in map cannot hold one.
class Marker {
  setLngLat() {
    return this;
  }
  addTo() {
    return this;
  }
  remove() {}
}
vi.mock('maplibre-gl', async (real) => ({ ...(await real<object>()), Marker }));

const { App } = await import('../src/app');
const { setLanguage } = await import('../src/i18n');
const { DEFAULT_SETTINGS } = await import('../src/settings');
const { showDestinationCard } = await import('../src/ui/destination');
const { openMenu } = await import('../src/ui/panels');
const { closeSheet } = await import('../src/ui/sheet');
const { Shell } = await import('../src/ui/shell');

/** A real App with a stand-in map: no style is loaded, so no overlays are drawn. */
function makeApp() {
  const app = new App();
  app.settings = { ...DEFAULT_SETTINGS };
  (app as unknown as { map: unknown }).map = {
    isStyleLoaded: () => false,
    getSource: () => undefined,
    on() {},
    off() {},
    getBearing: () => 0,
    getCenter: () => ({ lat: 52.37, lng: 4.89 }),
    getZoom: () => 12,
    flyTo() {},
  };
  render(<Shell app={app} />);
  return app;
}

const switchTo = (app: InstanceType<typeof App>, language: 'auto' | 'en' | 'de') =>
  act(() => app.updateSettings({ language }));
const menu = () => {
  if (!document.querySelector('#menu')) fireEvent.click(document.querySelector('#btn-menu')!);
  return [...document.querySelectorAll('#menu [role="menuitem"] span:first-child')].map((e) => e.textContent);
};
const aria = (sel: string) => document.querySelector(sel)!.getAttribute('aria-label');
const text = (sel: string) => document.querySelector(sel)!.textContent;

beforeEach(() => {
  document.documentElement.lang = 'en';
});
afterEach(() => {
  act(() => closeSheet());
  cleanup();
  setLanguage('en');
  vi.restoreAllMocks();
});

describe('switching the language', () => {
  it('relabels the menu, the floating buttons and the chart notice, and sets the page language', async () => {
    const app = makeApp();
    await switchTo(app, 'de');

    expect(menu()).toEqual([
      'Ziel suchen',
      'Ziel auf der Karte setzen',
      'Route & Wegpunkte',
      'Trackaufzeichnung',
      'Ankeralarm',
      'Nachtpalette',
      'Einstellungen',
    ]);
    expect(aria('#btn-menu')).toBe('Menü');
    expect(aria('#btn-zoom-in')).toBe('Vergrößern');
    expect(aria('#btn-follow')).toBe('Auf eigene Position zentrieren');
    expect(aria('#menu')).toBe('Werkzeuge');
    expect(text('#notice')).toBe('Nur Navigationshilfe – nicht zur Navigation');
    expect(text('#alarm-silence')).toBe('Stumm schalten');
    expect(document.documentElement.lang).toBe('de');

    await switchTo(app, 'en');
    expect(menu()).toContain('Anchor alarm');
    expect(aria('#btn-zoom-in')).toBe('Zoom in');
    expect(text('#notice')).toBe('Navigation aid only – not for navigation');
    expect(document.documentElement.lang).toBe('en');
  });

  it('relabels an open Settings sheet while it stays open', async () => {
    const app = makeApp();
    act(() => openMenu(app));
    expect(text('#sheet h2')).toBe('Settings');

    await switchTo(app, 'de');

    expect(document.querySelector('#sheet')!.classList.contains('open')).toBe(true);
    expect(text('#sheet h2')).toBe('Einstellungen');
    expect(aria('#sheet .sheet-head .icon-btn')).toBe('Schließen');
  });

  it('relabels the status pill', async () => {
    const app = makeApp();
    await switchTo(app, 'de');
    expect(text('#status-pill .pill-gps')).toMatch(/^GPS (Suche…|AUS|GESPERRT|FEHLT|VERLOREN)/);
    expect(aria('#status-pill .pill-pos')).toBe('Position');
  });

  it('relabels an open destination card', async () => {
    const app = makeApp();
    act(() =>
      showDestinationCard(app, {
        name: 'Jachthaven De Pikmar',
        kind: 'marina',
        lat: 53,
        lon: 5.8,
      }),
    );
    expect(text('#dest-bar .dest-card .btn.primary')).toBe('Chart course');

    await switchTo(app, 'de');

    expect(text('#dest-bar .dest-card .btn.primary')).toBe('Kurs berechnen');
    expect(text('#dest-bar .dest-card b')).toBe('Jachthaven De Pikmar');
  });

  it('keeps an armed anchor watch', async () => {
    const app = makeApp();
    app.anchor = { position: { lat: 52, lon: 5 }, radius: 40, armed: true };
    await switchTo(app, 'de');
    expect(app.anchor?.armed).toBe(true);
  });

  it('follows the device with Auto', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE', 'en']);
    const app = makeApp();
    await switchTo(app, 'auto');
    expect(document.documentElement.lang).toBe('de');
    expect(menu()).toContain('Ankeralarm');
  });
});

describe('voice prompts', () => {
  it('speaks the next maneuver in German with a German voice', async () => {
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
    const app = makeApp();
    await act(() => app.updateSettings({ language: 'de', voicePrompts: true }));
    const route = {
      id: 'r',
      name: 'Nach Pikmar',
      created: 0,
      waypointIds: ['w1', 'w2'],
      maneuvers: [
        { type: 'depart' as const, lat: 53, lon: 5.8, dist: 0, text: 'Depart', name: null },
        {
          type: 'turn-right' as const,
          lat: 53,
          lon: 5.8,
          dist: 900,
          text: 'Turn right into Pikmar',
          name: 'Pikmar',
          wp: 'w1',
        },
        { type: 'arrive' as const, lat: 53, lon: 5.8, dist: 2000, text: 'Arrive', name: null, wp: 'w2' },
      ],
    };
    const progress = {
      nextIndex: 0,
      dtw: 480,
      btw: 0,
      remaining: 1500,
      ttg: null,
      ttgNext: null,
      xte: 0,
      vmg: null,
      steer: null,
      finished: false,
    };
    (app as unknown as { followCourse: (r: unknown, p: unknown) => void }).followCourse(route, progress);

    expect(spoken.map((u) => [u.text, u.lang])).toEqual([['In 500 Metern, rechts abbiegen in Pikmar', 'de-DE']]);
    vi.unstubAllGlobals();
    vi.stubGlobal('__APP_VERSION__', 'test');
    vi.stubGlobal('__BUILD_ID__', 'test');
  });
});
