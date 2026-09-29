// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../src/app';
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
