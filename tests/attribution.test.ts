// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collapseAfter } from '../src/map/attribution';

const SHOW = 'maplibregl-compact-show';
const flush = () => Promise.resolve();

describe('collapseAfter', () => {
  let el: HTMLElement;
  beforeEach(() => {
    vi.useFakeTimers();
    el = document.createElement('details');
    el.className = 'maplibregl-ctrl-attrib maplibregl-compact';
  });
  afterEach(() => vi.useRealTimers());

  it('collapses credits that are open when it starts', () => {
    el.classList.add(SHOW);
    collapseAfter(el, 5000);
    vi.advanceTimersByTime(4999);
    expect(el.classList.contains(SHOW)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(el.classList.contains(SHOW)).toBe(false);
  });

  it('collapses them again after a tap opens them', async () => {
    collapseAfter(el, 5000);
    el.classList.add(SHOW);
    await flush();
    vi.advanceTimersByTime(5000);
    expect(el.classList.contains(SHOW)).toBe(false);
  });
});
