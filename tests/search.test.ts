import { describe, expect, it } from 'vitest';
import { PlaceIndex, normalize } from '../src/core/search';
import type { Place } from '../src/core/waterway-data';

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
