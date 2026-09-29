// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../src/app';
import { DEFAULT_SETTINGS } from '../src/settings';

vi.stubGlobal('__APP_VERSION__', 'test');
vi.stubGlobal('__BUILD_ID__', 'test');
const { openMenu, refresh } = await import('../src/ui/panels');

function fakeApp() {
  return {
    settings: { ...DEFAULT_SETTINGS },
    basemap: 'pmtiles',
    gpsStatus: 'searching',
    gpsMessage: '',
    routes: new Map(),
    waypoints: new Map(),
    updateSettings: vi.fn(async () => {}),
    enableCompass: async () => {},
    importData: async () => {},
  };
}

beforeEach(() => {
  document.body.innerHTML = '<section id="sheet"></section>';
});

describe('settings sheet', () => {
  it('applies the chart URL typed after the sheet re-rendered', () => {
    const app = fakeApp();
    openMenu(app as unknown as App);
    app.gpsStatus = 'ok';
    refresh(app as unknown as App);

    const input = document.querySelector<HTMLInputElement>('#sheet input[type=url]')!;
    input.value = 'https://example.org/chart.pmtiles';
    [...document.querySelectorAll<HTMLButtonElement>('#sheet button')].find((b) => b.textContent === 'Apply')!.click();

    expect(app.updateSettings).toHaveBeenCalledWith({
      pmtilesUrl: 'https://example.org/chart.pmtiles',
    });
  });
});
