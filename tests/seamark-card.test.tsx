// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Seamark } from '../src/core/waterway-data';
import { SeamarkCard } from '../src/ui/seamark-card';

afterEach(cleanup);

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

describe('SeamarkCard', () => {
  it('shows the kind, name, colour and light character', () => {
    const { container } = render(<SeamarkCard seamark={buoy} theme="day" onClose={() => {}} />);
    expect(container.querySelector('.dest-title b')?.textContent).toBe('Lateral buoy, port');
    expect(rows(container)).toEqual([
      ['Name', 'IJ 12'],
      ['Colour', 'red'],
      ['Light', 'Fl R 4s'],
    ]);
  });

  it('shows the symbol of the mark', () => {
    const { container } = render(<SeamarkCard seamark={buoy} theme="day" onClose={() => {}} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(img?.getAttribute('alt')).toBe('');
  });

  it('has no rows for a mark without details', () => {
    const { container } = render(
      <SeamarkCard seamark={{ lat: 0, lon: 0, type: 'notice' }} theme="night" onClose={() => {}} />,
    );
    expect(container.querySelector('dl')).toBeNull();
    expect(container.querySelector('.dest-title b')?.textContent).toBe('Notice');
  });

  it('closes with its close button', () => {
    const close = vi.fn();
    const { container } = render(<SeamarkCard seamark={buoy} theme="day" onClose={close} />);
    const button = container.querySelector('button');
    expect(button?.getAttribute('aria-label')).toBe('Close');
    button?.click();
    expect(close).toHaveBeenCalledOnce();
  });
});
