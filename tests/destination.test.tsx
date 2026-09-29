// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../src/app';
import type { Place } from '../src/core/waterway-data';
import { DEFAULT_SETTINGS } from '../src/settings';

vi.mock('maplibre-gl', () => ({ Marker: class {} }));
const { DestinationCard, closeDestination, destBar, showCard, startPlacement, useDestBar } =
  await import('../src/ui/destination');

function DestBar({ app }: { app: App }) {
  const bar = useDestBar(app);
  return (
    <div className={bar?.kind}>
      <div id="dest-bar" hidden={!bar}>
        {bar?.content}
      </div>
    </div>
  );
}

const place: Place = {
  name: 'Jachthaven Aalsmeer',
  kind: 'marina',
  lat: 52.26,
  lon: 4.75,
  info: {
    vhf: '31',
    phone: '+31 20 123 4567',
    website: 'https://www.jachthaven.example/visitors',
  },
};

function fakeApp() {
  return {
    fix: null,
    settings: DEFAULT_SETTINGS,
    version: 0,
    recents: [],
    waypoints: new Map(),
    trips: [],
    subscribe: () => () => {},
    setFollow: vi.fn(),
    goStraight: vi.fn(async () => {}),
    addWaypoint: vi.fn(),
    addStop: vi.fn(),
    map: { getCenter: () => ({ lat: 52, lng: 5 }), on: vi.fn(), off: vi.fn() },
  };
}

beforeEach(() => {
  document.body.innerHTML = '<div id="map"></div>';
});
afterEach(() => {
  act(() => closeDestination());
  cleanup();
});

describe('DestinationCard', () => {
  it('shows the place info rows', () => {
    const { container } = render(<DestinationCard app={fakeApp()} place={place} chart={async () => {}} />);
    expect(screen.getByText('channel 31')).toBeTruthy();
    expect(screen.getByText('+31 20 123 4567').closest('a')?.getAttribute('href')).toBe('tel:+31201234567');
    expect(screen.getByText('jachthaven.example').closest('a')?.getAttribute('rel')).toBe('noopener');
    expect(container.querySelector('.dest-title b')?.textContent).toBe('Jachthaven Aalsmeer');
  });

  it('disables "Chart course", closes the bar, then charts', async () => {
    const app = fakeApp();
    const chart = vi.fn(async () => {});
    act(() => showCard(app as unknown as App, 'card'));
    render(<DestinationCard app={app} place={place} chart={chart} />);
    const btn = screen.getByText('Chart course') as HTMLButtonElement;
    await act(async () => void fireEvent.click(btn));
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Charting…');
    expect(chart).toHaveBeenCalledOnce();
    expect(destBar.get().kind).toBe('none');
  });

  it('hides the bar from the close button', () => {
    const app = fakeApp();
    render(<DestBar app={app as unknown as App} />);
    act(() => showCard(app as unknown as App, <DestinationCard app={app} place={place} chart={async () => {}} />));
    expect(document.querySelector<HTMLElement>('#dest-bar')!.hidden).toBe(false);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(document.querySelector<HTMLElement>('#dest-bar')!.hidden).toBe(true);
  });
});

describe('placement', () => {
  it('puts the bar in placing mode until closed', () => {
    const app = fakeApp() as unknown as App;
    const { container } = render(<DestBar app={app} />);
    act(() => startPlacement(app));
    expect(container.querySelector('.placing')).not.toBeNull();
    expect(screen.getByText('Pan the map to place the crosshair')).toBeTruthy();
    act(() => closeDestination());
    expect(container.querySelector('.placing')).toBeNull();
    expect(document.querySelector<HTMLElement>('#dest-bar')!.hidden).toBe(true);
  });
});
