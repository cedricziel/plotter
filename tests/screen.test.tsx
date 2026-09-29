// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeScreenApp } from '../src/stories/fakes';
import { PlotterScreen } from '../src/ui/screen';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A ResizeObserver whose callbacks the test fires by hand. */
function stubResizeObserver() {
  const observers: { callback: ResizeObserverCallback; targets: Element[] }[] = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      targets: Element[] = [];
      constructor(callback: ResizeObserverCallback) {
        observers.push({ callback, targets: this.targets });
      }
      observe(el: Element) {
        this.targets.push(el);
      }
      unobserve() {}
      disconnect() {
        this.targets.length = 0;
      }
    },
  );
  return (el: HTMLElement, height: number) => {
    Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height });
    for (const o of observers.filter((o) => o.targets.includes(el))) {
      act(() => o.callback([], {} as ResizeObserver));
    }
  };
}

describe('plotter screen', () => {
  it('keeps screen state and theme on its own root, not on body', () => {
    const app = makeScreenApp({ follow: true, settings: { theme: 'night', seamarks: true } });
    const { container } = render(
      <PlotterScreen app={app} sheet={{ key: 'route', title: 'Route & waypoints', content: <p>legs</p> }} />,
    );

    const root = container.querySelector('.plotter')!;
    expect(root.classList).toContain('following');
    expect(root.classList).toContain('seamarks-on');
    expect(root.getAttribute('data-sheet')).toBe('route');
    expect(root.getAttribute('data-theme')).toBe('night');
    expect(document.body.className).toBe('');
    expect(document.body.dataset.sheet).toBeUndefined();
  });

  it('lets go of a sheet that is sliding out', () => {
    const { container } = render(
      <PlotterScreen app={makeScreenApp()} sheet={{ key: 'route', title: 'Route', content: 'legs', closing: true }} />,
    );
    expect(container.querySelector('.plotter')!.hasAttribute('data-sheet')).toBe(false);
    expect(container.querySelector('#sheet')!.classList).not.toContain('open');
    expect(container.querySelector('#sheet')!.textContent).toContain('legs');
  });

  it('marks placement and a destination card on the root', () => {
    const app = makeScreenApp();
    const { container, rerender } = render(<PlotterScreen app={app} bottom={{ kind: 'placing', content: 'bar' }} />);
    expect(container.querySelector('.plotter')!.classList).toContain('placing');
    expect(container.querySelector('#crosshair')).not.toBeNull();

    rerender(<PlotterScreen app={app} bottom={{ kind: 'card', content: 'card' }} />);
    expect(container.querySelector('.plotter')!.classList).toContain('destcard');
    expect(container.querySelector('#crosshair')).toBeNull();
  });

  it('shows the anchor alarm only with a reason', () => {
    const quiet = render(<PlotterScreen app={makeScreenApp()} />);
    expect(quiet.container.querySelector<HTMLElement>('#alarm')!.hidden).toBe(true);
    quiet.unmount();

    const { container } = render(
      <PlotterScreen app={makeScreenApp({ alarmReason: { kind: 'drag', distance: 62, radius: 40 } })} />,
    );
    expect(container.querySelector<HTMLElement>('#alarm')!.hidden).toBe(false);
    expect(container.querySelector('#alarm-reason')!.textContent).toContain('62');
  });

  it('tells the layout how tall the bottom bar is, so the map buttons can sit above it', () => {
    const resize = stubResizeObserver();
    const { container } = render(<PlotterScreen app={makeScreenApp()} bottom={{ kind: 'card', content: 'card' }} />);
    const root = container.querySelector<HTMLElement>('.plotter')!;
    const bar = container.querySelector<HTMLElement>('#dest-bar')!;

    resize(bar, 312);
    expect(root.style.getPropertyValue('--bottom-bar-h')).toBe('312px');

    resize(bar, 148);
    expect(root.style.getPropertyValue('--bottom-bar-h')).toBe('148px');
  });
});
