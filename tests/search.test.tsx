// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../src/app';
import { PlaceIndex, normalize } from '../src/core/search';
import type { Place } from '../src/core/waterway-data';
import { DEFAULT_SETTINGS } from '../src/settings';

const search = vi.hoisted(() => vi.fn());
vi.mock('../src/services/api', async (orig) => ({
  ...(await orig<typeof import('../src/services/api')>()),
  api: { search },
}));
const { SearchBox, resetSearch } = await import('../src/ui/search');
const { ApiError } = await import('../src/services/api');

const places: Place[] = [
  { name: 'Hoorn', kind: 'town', lat: 52.65, lon: 5.07 },
  { name: 'Jachthaven Hoorn', kind: 'marina', lat: 52.64, lon: 5.06 },
  { name: 'Hoornse Jaagweg', kind: 'bridge', lat: 52.6, lon: 5.0 },
  { name: 'Hoorn', kind: 'waterway', lat: 52.5, lon: 5.0 },
  { name: 'Oranjesluizen', kind: 'lock', lat: 52.38, lon: 4.96 },
  { name: 'Zaan', kind: 'waterway', lat: 52.45, lon: 4.8 },
  { name: 'Zaandam', kind: 'town', lat: 52.44, lon: 4.83 },
  { name: 'Zaanbrug', kind: 'bridge', lat: 52.45, lon: 4.81 },
  { name: 'Hôtel de Zaan', kind: 'harbour', lat: 52.4, lon: 4.8 },
  { name: 'Sluis Zaanstad', kind: 'lock', lat: 52.44, lon: 4.84 },
  { name: 'Alkmaar', kind: 'city', lat: 52.63, lon: 4.75 },
];
const index = new PlaceIndex(places);
const names = (q: string, near?: { lat: number; lon: number }) =>
  index.search(q, { near }).map((r) => `${r.name}|${r.kind}`);

describe('normalize', () => {
  it('lowercases, strips diacritics and punctuation', () => {
    expect(normalize('Hôtel-de  Zaan!')).toBe('hotel de zaan');
    expect(normalize('  Ærø  ')).toBe('ærø');
  });
});

describe('PlaceIndex.search', () => {
  it('matches prefixes case- and diacritic-insensitively', () => {
    expect(names('hOOr')).toContain('Hoorn|town');
    expect(names('hotel')).toEqual(['Hôtel de Zaan|harbour']);
    expect(names('HOTEL DE')).toEqual(['Hôtel de Zaan|harbour']);
  });

  it('matches prefixes of any word', () => {
    expect(names('zaanst')).toEqual(['Sluis Zaanstad|lock']);
    expect(names('jacht hoorn')).toEqual(['Jachthaven Hoorn|marina']);
  });

  it('ranks exact names first, then name prefixes, then word matches', () => {
    const r = names('zaan');
    expect(r[0]).toBe('Zaan|waterway');
    expect(r.indexOf('Zaandam|town')).toBeLessThan(r.indexOf('Sluis Zaanstad|lock'));
  });

  it('ranks harbours, marinas and locks above towns above waterways above bridges within a match class', () => {
    const r = names('hoorn');
    expect(r.slice(0, 2)).toEqual(['Hoorn|town', 'Hoorn|waterway']);
    expect(r.indexOf('Hoornse Jaagweg|bridge')).toBeGreaterThan(r.indexOf('Hoorn|waterway'));
  });

  it('uses distance from the boat as a tie-breaker', () => {
    const twins = new PlaceIndex([
      { name: 'Jachthaven', kind: 'marina', lat: 52.0, lon: 5.0 },
      { name: 'Jachthaven', kind: 'marina', lat: 53.0, lon: 5.0 },
    ]);
    const r = twins.search('jacht', { near: { lat: 53.01, lon: 5.0 } });
    expect(r[0].lat).toBe(53.0);
    expect(r[0].distance).toBeLessThan(2000);
    expect(r[1].distance).toBeGreaterThan(100_000);
  });

  it('returns nothing for empty or non-matching queries and honours the limit', () => {
    expect(index.search('')).toEqual([]);
    expect(index.search('   ')).toEqual([]);
    expect(index.search('qqqq')).toEqual([]);
    expect(index.search('h', { limit: 2 })).toHaveLength(2);
  });

  it('reports distance only when a position is given', () => {
    expect(index.search('alkmaar')[0].distance).toBeUndefined();
    expect(index.search('alkmaar', { near: { lat: 52.63, lon: 4.75 } })[0].distance).toBeCloseTo(0, 0);
  });
});

describe('SearchBox', () => {
  const recent: Place = {
    name: 'Jachthaven Hoorn',
    kind: 'marina',
    lat: 52.64,
    lon: 5.06,
  };
  const app = {
    fix: null,
    settings: DEFAULT_SETTINGS,
    recents: [recent],
    waypoints: new Map(),
    trips: [],
    map: { getCenter: () => ({ lat: 52, lng: 5 }) },
  } as unknown as App;
  const onPick = vi.fn();
  const box = () => <SearchBox app={app} scope="sheet" onPick={onPick} />;
  const input = () => screen.getByLabelText('Search destination') as HTMLInputElement;
  const type = (v: string) => fireEvent.change(input(), { target: { value: v } });

  beforeEach(() => {
    vi.useFakeTimers();
    search.mockReset();
    onPick.mockReset();
  });
  afterEach(() => {
    cleanup();
    act(() => resetSearch('sheet'));
    vi.useRealTimers();
  });

  it('renders the field with its attributes and a polite note', () => {
    const { container } = render(box());
    expect(container.querySelector('.search')?.getAttribute('data-scope')).toBe('sheet');
    expect(input().getAttribute('enterkeyhint')).toBe('search');
    expect(input().getAttribute('autocomplete')).toBe('off');
    expect(container.querySelector('.search-note')?.getAttribute('aria-live')).toBe('polite');
  });

  it('lists recent destinations on focus', () => {
    render(box());
    fireEvent.focus(input());
    expect(screen.getByText('Recent destinations')).toBeTruthy();
    fireEvent.click(screen.getByText('Jachthaven Hoorn').closest('button')!);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ name: 'Jachthaven Hoorn' }));
  });

  it('asks for two letters before searching', () => {
    render(box());
    type('h');
    expect(screen.getByText('Type at least 2 letters')).toBeTruthy();
    expect(search).not.toHaveBeenCalled();
  });

  it('debounces the lookup and shows the results', async () => {
    search.mockResolvedValue([{ name: 'Hoorn', kind: 'town', lat: 52.65, lon: 5.07 }]);
    render(box());
    type('ho');
    type('hoo');
    expect(search).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0]).toBe('hoo');
    expect(screen.getByText('Hoorn')).toBeTruthy();
  });

  it('falls back to saved places when the service is unreachable', async () => {
    search.mockRejectedValue(new ApiError('unavailable', 0, 'down'));
    render(box());
    type('jacht');
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(screen.getByText('Search service not reachable – showing saved places')).toBeTruthy();
    expect(screen.getByText('Jachthaven Hoorn')).toBeTruthy();
  });

  it('keeps the query when the box remounts and clears it on reset', () => {
    const { unmount } = render(box());
    type('hoorn');
    unmount();
    render(box());
    expect(input().value).toBe('hoorn');
    cleanup();
    act(() => resetSearch('sheet'));
    render(box());
    expect(input().value).toBe('');
  });
});
