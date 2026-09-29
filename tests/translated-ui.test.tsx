// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../src/app';
import { setLanguage } from '../src/i18n';
import { alarmText, placeLabel } from '../src/i18n/texts';
import { DEFAULT_SETTINGS } from '../src/settings';
import { makeCardApp } from '../src/stories/fakes';
import { Disclaimer } from '../src/ui/disclaimer';
import { SeamarkCard } from '../src/ui/seamark-card';

vi.mock('maplibre-gl', () => ({ Marker: class {} }));
const { DestinationCard } = await import('../src/ui/destination');
const { SearchBox, resetSearch } = await import('../src/ui/search');

beforeEach(() => setLanguage('de'));
afterEach(() => {
  cleanup();
  setLanguage('en');
});

const rows = (el: ParentNode) =>
  Object.fromEntries([...el.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling!.textContent]));

describe('destination card in German', () => {
  it('shows German labels and the name unchanged', () => {
    const { container } = render(
      <DestinationCard
        app={makeCardApp(null)}
        place={{
          name: 'Jachthaven De Pikmar',
          kind: 'marina',
          lat: 53,
          lon: 5.8,
          info: { vhf: '31', berths: 120 },
        }}
        chart={async () => {}}
      />,
    );
    expect(container.querySelector('b')!.textContent).toBe('Jachthaven De Pikmar');
    expect(container.querySelector('small')!.textContent).toBe('Yachthafen');
    expect(rows(container)).toEqual({ UKW: 'Kanal 31', Liegeplätze: '120' });
    expect([...container.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'Kurs berechnen',
      'Direkt hierhin',
      'Als Stopp',
      '✕',
    ]);
    expect(container.querySelector('[aria-label]')!.getAttribute('aria-label')).toBe('Schließen');
  });

  it('describes an opening bridge with a decimal comma', () => {
    const { container } = render(
      <DestinationCard
        app={makeCardApp(null)}
        place={{
          name: 'Schellingwouderbrug',
          kind: 'bridge',
          lat: 52.38,
          lon: 4.99,
          info: {
            source: 'vaarweginformatie',
            canOpen: true,
            clearance: 2.9,
            width: 11.5,
          },
        }}
        chart={async () => {}}
      />,
    );
    expect(container.querySelector('small')!.textContent).toBe('Bewegliche Brücke');
    expect(rows(container)).toMatchObject({
      Durchfahrtshöhe: '2,9 m (geschlossen)',
      Breite: '11,5 m',
      Quelle: 'Vaarweginformatie',
    });
  });
});

describe('place labels', () => {
  it('names bridges by whether they open, else the kind', () => {
    expect(placeLabel({ kind: 'bridge', info: { canOpen: true } })).toBe('Bewegliche Brücke');
    expect(placeLabel({ kind: 'bridge', info: { canOpen: false } })).toBe('Feste Brücke');
    expect(placeLabel({ kind: 'lock' })).toBe('Schleuse');
    setLanguage('en');
    expect(placeLabel({ kind: 'bridge', info: { canOpen: true } })).toBe('Opening bridge');
    expect(placeLabel({ kind: 'harbour' })).toBe('Harbour');
  });
});

describe('disclaimer in German', () => {
  it('says in German that the app is a navigation aid only', () => {
    const { container } = render(<Disclaimer open />);
    expect(container.querySelector('h2')!.textContent).toBe('Nicht zur Navigation');
    expect(container.querySelector('p')!.textContent).toMatch(/^Nur Navigationshilfe\./);
    expect(container.querySelector('button')!.textContent).toBe('Verstanden');
  });

  it('relabels while it is open', () => {
    setLanguage('en');
    const { container } = render(<Disclaimer open />);
    expect(container.querySelector('button')!.textContent).toBe('I understand');
    act(() => setLanguage('de'));
    expect(container.querySelector('button')!.textContent).toBe('Verstanden');
  });
});

describe('search in German', () => {
  it('labels the field and the recent destinations in German', () => {
    const app = {
      fix: null,
      recents: [{ name: 'Hoorn', kind: 'town', lat: 52.6, lon: 5.06 }],
      waypoints: new Map(),
      trips: [],
      settings: DEFAULT_SETTINGS,
    } as unknown as App;
    const { container } = render(<SearchBox app={app} scope="sheet" onPick={() => {}} />);
    const input = container.querySelector('input')!;
    expect(input.placeholder).toBe('Hafen, Schleuse, Ort oder Gewässer suchen…');
    expect(input.getAttribute('aria-label')).toBe('Ziel suchen');
    fireEvent.focus(input);
    expect(container.querySelector('.result-heading')!.textContent).toBe('Letzte Ziele');
    expect(container.querySelector('.result small')!.textContent).toBe('Stadt');

    act(() => setLanguage('en'));
    expect(container.querySelector('.result-heading')!.textContent).toBe('Recent destinations');
    act(() => resetSearch('sheet'));
  });
});

describe('seamark card in German', () => {
  it('labels the kind and the rows in German and keeps the data', () => {
    const { container } = render(
      <SeamarkCard
        seamark={{
          type: 'buoy_lateral',
          category: 'port',
          name: 'IJ 12',
          colour: 'red',
          lat: 52,
          lon: 5,
        }}
        theme="day"
        onClose={() => {}}
      />,
    );
    expect(container.querySelector('b')!.textContent).toBe('Lateraltonne, port');
    expect(rows(container)).toEqual({ Name: 'IJ 12', Farbe: 'red' });
    expect(container.querySelector('button')!.getAttribute('aria-label')).toBe('Schließen');
  });
});

describe('anchor alarm in German', () => {
  it('says why the alarm sounds', () => {
    expect(alarmText({ kind: 'drag', distance: 52.4, radius: 40 })).toBe('Anker slippt: 52 m vom Anker (Radius 40 m)');
    expect(alarmText({ kind: 'gps-lost' })).toBe('GPS-Signal verloren');
    setLanguage('en');
    expect(alarmText({ kind: 'drag', distance: 52.4, radius: 40 })).toBe('Anchor drag: 52 m from anchor (radius 40 m)');
    expect(alarmText({ kind: 'gps-lost' })).toBe('GPS signal lost');
  });
});
