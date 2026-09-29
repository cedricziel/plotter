// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { Seamark } from '../src/core/waterway-data';
import { seamarkCard } from '../src/ui/seamark-card';

const buoy: Seamark = {
  lat: 52.38,
  lon: 4.9,
  type: 'buoy_lateral',
  category: 'port',
  colour: 'red',
  name: 'IJ 12',
  light: 'Fl R 4s',
};
const rows = (card: HTMLElement) =>
  [...card.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);

describe('seamarkCard', () => {
  it('shows the kind, name, colour and light character', () => {
    const card = seamarkCard(buoy, 'day', () => {});
    expect(card.querySelector('.dest-title b')?.textContent).toBe('Lateral buoy, port');
    expect(rows(card)).toEqual([
      ['Name', 'IJ 12'],
      ['Colour', 'red'],
      ['Light', 'Fl R 4s'],
    ]);
  });

  it('shows the symbol of the mark', () => {
    const img = seamarkCard(buoy, 'day', () => {}).querySelector('img');
    expect(img?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(img?.getAttribute('alt')).toBe('');
  });

  it('has no rows for a mark without details', () => {
    const card = seamarkCard({ lat: 0, lon: 0, type: 'notice' }, 'night', () => {});
    expect(card.querySelector('dl')).toBeNull();
    expect(card.querySelector('.dest-title b')?.textContent).toBe('Notice');
  });

  it('closes with its close button', () => {
    const close = vi.fn();
    const button = seamarkCard(buoy, 'day', close).querySelector('button');
    expect(button?.getAttribute('aria-label')).toBe('Close');
    button?.click();
    expect(close).toHaveBeenCalledOnce();
  });
});
