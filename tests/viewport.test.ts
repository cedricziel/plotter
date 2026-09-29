import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as MlMap } from 'maplibre-gl';
import { inside, padded, viewportLoader, type Box } from '../src/map/viewport';

describe('padded', () => {
  it('grows the box by the padding on every side', () => {
    const [w, s, e, n] = padded([5, 52, 5.1, 52.05], 0.3, 1.5);
    expect(w).toBeCloseTo(4.97);
    expect(e).toBeCloseTo(5.13);
    expect(s).toBeCloseTo(51.985);
    expect(n).toBeCloseTo(52.065);
  });

  it('never grows past the largest span the API accepts', () => {
    const [w, s, e, n] = padded([5, 52, 6.4, 52.5], 0.3, 1.5);
    expect(e - w).toBeLessThanOrEqual(1.5 + 1e-9);
    expect(n - s).toBeCloseTo(0.5 * 1.6);
  });

  it('keeps a box that is already at the limit', () => {
    const [w, s, e, n] = padded([5, 52, 6.5, 52.5], 0.3, 1.5);
    expect([w, e]).toEqual([5, 6.5]);
    expect(s).toBeCloseTo(51.85);
    expect(n).toBeCloseTo(52.65);
  });
});

describe('inside', () => {
  it('tells whether a box lies within another', () => {
    expect(inside([1, 1, 2, 2], [0, 0, 3, 3])).toBe(true);
    expect(inside([0, 1, 2, 2], [1, 0, 3, 3])).toBe(false);
  });
});

describe('viewportLoader', () => {
  let zoom = 13;
  let view: Box = [5, 52, 5.05, 52.03];
  let handlers: Record<string, () => void> = {};
  const map = {
    on: (ev: string, fn: () => void) => (handlers[ev] = fn),
    getZoom: () => zoom,
    getBounds: () => ({
      getWest: () => view[0],
      getSouth: () => view[1],
      getEast: () => view[2],
      getNorth: () => view[3],
    }),
  } as unknown as MlMap;
  const load = vi.fn<(box: Box, signal: AbortSignal) => Promise<string[]>>();
  const render = vi.fn<(items: string[]) => void>();
  let fallback = vi.fn<(view: Box) => string[]>();
  let enabled = true;
  const mount = () =>
    viewportLoader<string>(map, {
      minZoom: 12,
      pad: 0.3,
      maxSpan: 1.5,
      debounceMs: 400,
      enabled: () => enabled,
      load,
      fallback,
      render,
    });
  const moveTo = async (next: Box) => {
    view = next;
    handlers.moveend();
    await vi.advanceTimersByTimeAsync(400);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    zoom = 13;
    view = [5, 52, 5.05, 52.03];
    handlers = {};
    enabled = true;
    load.mockReset().mockResolvedValue(['a']);
    render.mockReset();
    fallback = vi.fn(() => ['saved']);
  });
  afterEach(() => vi.useRealTimers());

  it('loads the padded viewport when mounted and renders it', async () => {
    mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    const box = load.mock.calls[0][0];
    expect(box[0]).toBeLessThan(view[0]);
    expect(box[2]).toBeGreaterThan(view[2]);
    expect(render).toHaveBeenLastCalledWith(['a']);
  });

  it('does not load again for a small pan inside the loaded area', async () => {
    mount();
    await vi.advanceTimersByTimeAsync(0);
    await moveTo([5.005, 52.002, 5.055, 52.032]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('loads again after a pan beyond the loaded area or a zoom change of a level', async () => {
    mount();
    await vi.advanceTimersByTimeAsync(0);
    await moveTo([5.2, 52, 5.25, 52.03]);
    expect(load).toHaveBeenCalledTimes(2);
    zoom = 14.5;
    handlers.moveend();
    await vi.advanceTimersByTimeAsync(400);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('does not start a second request while one covering the view is still loading', async () => {
    let finish: (items: string[]) => void = () => {};
    load.mockImplementationOnce(() => new Promise<string[]>((resolve) => (finish = resolve)));
    const loader = mount();
    await loader.refresh();
    await loader.refresh();
    expect(load).toHaveBeenCalledTimes(1);
    finish(['a']);
    await vi.advanceTimersByTimeAsync(0);
    expect(render).toHaveBeenLastCalledWith(['a']);
    await loader.refresh();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('waits for the pan to settle', async () => {
    mount();
    await vi.advanceTimersByTimeAsync(0);
    view = [5.3, 52, 5.35, 52.03];
    handlers.moveend();
    await vi.advanceTimersByTimeAsync(399);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does nothing below the minimum zoom', async () => {
    zoom = 11;
    mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).not.toHaveBeenCalled();
  });

  it('does nothing while disabled and loads when refreshed after being enabled', async () => {
    enabled = false;
    const loader = mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).not.toHaveBeenCalled();
    enabled = true;
    await loader.refresh();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('falls back to the saved data when loading fails and tries the same area again only after a while', async () => {
    load.mockRejectedValueOnce(new Error('offline'));
    mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(fallback).toHaveBeenCalledWith(view);
    expect(render).toHaveBeenLastCalledWith(['saved']);
    await moveTo([5.001, 52.001, 5.051, 52.031]);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    await moveTo([5.002, 52.002, 5.052, 52.032]);
    expect(load).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenLastCalledWith(['a']);
  });

  it('tries at once after a failure when the view leaves the failed area', async () => {
    load.mockRejectedValueOnce(new Error('offline'));
    mount();
    await vi.advanceTimersByTimeAsync(0);
    await moveTo([5.3, 52.2, 5.35, 52.23]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('falls back for the view shown when loading fails, not the one it started for', async () => {
    let fail: (e: Error) => void = () => {};
    load.mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)));
    mount();
    const later: Box = [5.002, 52.002, 5.052, 52.032];
    await moveTo(later);
    fail(new Error('offline'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fallback).toHaveBeenLastCalledWith(later);
  });

  it('renders again when the style is replaced', async () => {
    mount();
    await vi.advanceTimersByTimeAsync(0);
    render.mockClear();
    handlers['style.load']();
    expect(render).toHaveBeenCalledWith(['a']);
  });

  it('ignores an aborted request', async () => {
    load.mockImplementationOnce(
      (_, signal) =>
        new Promise<string[]>((_, reject) =>
          signal.addEventListener('abort', () => reject(new DOMException('x', 'AbortError'))),
        ),
    );
    mount();
    await vi.advanceTimersByTimeAsync(0);
    await moveTo([5.5, 52, 5.55, 52.03]);
    expect(fallback).not.toHaveBeenCalled();
    expect(render).toHaveBeenLastCalledWith(['a']);
  });
});
