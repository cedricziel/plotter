// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../src/app';
import type { CourseManeuver } from '../src/core/model';
import { setLanguage } from '../src/i18n';
import { DEFAULT_SETTINGS } from '../src/settings';
import { closeSheet, Sheet } from '../src/ui/sheet';

vi.stubGlobal('__APP_VERSION__', 'test');
vi.stubGlobal('__BUILD_ID__', 'test');
const { openAnchor, openMenu, openRoute } = await import('../src/ui/panels');

function fakeApp(over: Record<string, unknown> = {}) {
  return {
    settings: { ...DEFAULT_SETTINGS },
    basemap: 'pmtiles',
    gpsStatus: 'searching',
    gpsMessage: '',
    routes: new Map(),
    waypoints: new Map(),
    trips: [],
    fix: null,
    activeRoute: null,
    progress: null,
    anchor: null,
    anchorCheck: null,
    wakeLock: { active: false, supported: true },
    updateSettings: vi.fn(async () => {}),
    armAnchor: vi.fn(async () => {}),
    enableCompass: async () => {},
    importData: async () => {},
    ...over,
  };
}

const open = (fn: (app: App) => void, app: ReturnType<typeof fakeApp>) => {
  const view = render(<Sheet />);
  act(() => fn(app as unknown as App));
  return view;
};

afterEach(() => {
  act(() => closeSheet());
  cleanup();
  setLanguage('en');
});

describe('settings sheet', () => {
  it('applies the chart URL typed after the sheet re-rendered', () => {
    const app = fakeApp();
    const { rerender } = open(openMenu, app);
    app.gpsStatus = 'ok';
    const input = screen.getByLabelText('PMTiles URL') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://example.org/chart.pmtiles' } });
    rerender(<Sheet />);
    act(() => openMenu(app as unknown as App));

    fireEvent.click(screen.getByText('Apply'));
    expect(app.updateSettings).toHaveBeenCalledWith({ pmtilesUrl: 'https://example.org/chart.pmtiles' });
  });

  it('marks the active option of a segmented control and updates settings on pick', () => {
    const app = fakeApp();
    open(openMenu, app);
    const group = screen.getByRole('radiogroup', { name: 'Speed' });
    const [kmh, kn] = [...group.querySelectorAll('button')];
    expect(kmh.getAttribute('aria-checked')).toBe(String(DEFAULT_SETTINGS.speedUnit === 'kmh'));
    const other = DEFAULT_SETTINGS.speedUnit === 'kmh' ? kn : kmh;
    expect(other.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(other);
    expect(app.updateSettings).toHaveBeenCalledWith({ speedUnit: other === kn ? 'kn' : 'kmh' });
  });
});

describe('route sheet', () => {
  it('lists the active route waypoints', () => {
    const wps = [
      { id: 'a', name: 'Alpha', lat: 52, lon: 4, created: 0 },
      { id: 'b', name: 'Bravo', lat: 52.1, lon: 4.1, created: 0 },
    ];
    const route = { id: 'r', name: 'Trip', waypointIds: ['a', 'b'], created: 0 };
    const app = fakeApp({
      waypoints: new Map(wps.map((w) => [w.id, w])),
      routes: new Map([[route.id, route]]),
      activeRoute: route,
      routePoints: () => wps,
    });
    open(openRoute, app);
    const legs = [...document.querySelectorAll('#sheet ol.legs .leg-name')].map((e) => e.firstChild?.textContent);
    expect(legs).toEqual(['Alpha', 'Bravo']);
  });
});

describe('anchor sheet', () => {
  it('arms a disarmed anchor', () => {
    const app = fakeApp({ anchor: { lat: 52, lon: 4, radius: 40, armed: false } });
    open(openAnchor, app);
    fireEvent.click(screen.getByText('Arm anchor alarm'));
    expect(app.armAnchor).toHaveBeenCalledWith(true);
  });

  it('disarms an armed anchor', () => {
    const app = fakeApp({ anchor: { lat: 52, lon: 4, radius: 40, armed: true } });
    open(openAnchor, app);
    fireEvent.click(screen.getByText('Disarm alarm'));
    expect(app.armAnchor).toHaveBeenCalledWith(false);
  });
});

describe('language control', () => {
  const choice = () => [...screen.getByRole('radiogroup', { name: 'Language' }).querySelectorAll('button')];

  it('offers Auto, English and Deutsch with the current choice marked', () => {
    const app = fakeApp();
    app.settings.language = 'de';
    open(openMenu, app);
    expect(choice().map((b) => b.textContent)).toEqual(['Auto', 'English', 'Deutsch']);
    expect(choice().map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
    expect(document.querySelector('#sheet')!.textContent).toContain('device');
  });

  it('saves the chosen language', () => {
    const app = fakeApp();
    open(openMenu, app);
    fireEvent.click(choice().find((b) => b.textContent === 'Deutsch')!);
    expect(app.updateSettings).toHaveBeenCalledWith({ language: 'de' });
  });

  it('writes the settings in German', () => {
    setLanguage('de');
    open(openMenu, fakeApp());
    const text = document.querySelector('#sheet')!.textContent!;
    expect(text).toContain('Sprache');
    expect(text).toContain('Anzeige');
    expect(text).not.toContain('Display');
    expect(screen.getByRole('radiogroup', { name: 'Geschwindigkeit' })).toBeTruthy();
  });
});

describe('sheets in German', () => {
  it('lists the maneuvers of a charted course in German with names unchanged', () => {
    setLanguage('de');
    const m = (type: CourseManeuver['type'], dist: number, name: string | null, fields = {}) => ({
      type,
      dist,
      lat: 52,
      lon: 5,
      text: 'english',
      name,
      ...fields,
    });
    const route = {
      id: 'r',
      name: 'Nach Hoorn',
      waypointIds: [],
      created: 0,
      maneuvers: [
        m('depart', 0, 'IJ'),
        m('lock', 1000, 'Oranjesluizen'),
        m('bridge-open', 2000, 'Schellingwoude'),
        m('bridge-fixed', 3000, null, { clearance: 540 }),
        m('arrive', 4000, 'Hoorn'),
      ],
      warnings: ['1 fixed bridge with unknown clearance'],
    };
    const app = fakeApp({ activeRoute: route, routes: new Map([['r', route]]), recents: [], offline: null });
    open(openRoute, app);
    const rows = [...document.querySelectorAll('#sheet .maneuver-text')].map((e) => e.firstChild!.textContent);
    expect(rows).toEqual([
      'Abfahrt auf IJ',
      'Schleuse Oranjesluizen passieren',
      'Klappbrücke: Schellingwoude',
      'Feste Brücke, 5,4 m Durchfahrtshöhe',
      'Ankunft in Hoorn',
    ]);
    expect(document.querySelector('#sheet .warnings')!.textContent).toBe(
      '⚠ 1 feste Brücke mit unbekannter Durchfahrtshöhe',
    );
    expect(document.querySelector('#sheet h2')!.textContent).toBe('Route & Wegpunkte');
  });

  it('labels the anchor sheet in German', () => {
    setLanguage('de');
    open(openAnchor, fakeApp({ anchor: { lat: 52, lon: 4, radius: 40, armed: false } }));
    expect(screen.getByText('Ankeralarm einschalten')).toBeTruthy();
    expect(screen.getByLabelText('Radius vergrößern')).toBeTruthy();
    expect(document.querySelector('#sheet')!.textContent).toContain('Schwoikreis');
  });
});
