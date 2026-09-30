// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
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

  it('marks navigation on the root, so the guidance card replaces the status pill', () => {
    const { container, rerender } = render(<PlotterScreen app={makeScreenApp()} />);
    expect(container.querySelector('.plotter')!.classList).not.toContain('navigating');
    rerender(<PlotterScreen app={makeScreenApp({ route: true })} />);
    expect(container.querySelector('.plotter')!.classList).toContain('navigating');
  });

  it('shows how long a track has been recording in the status pill', () => {
    const { container } = render(<PlotterScreen app={makeScreenApp({ recording: true })} />);
    expect(container.querySelector('#status-pill')!.textContent).toContain('REC 1:00:00');
  });
});

describe('menu', () => {
  const items = (root: HTMLElement) =>
    [...root.querySelectorAll('#menu [role="menuitem"] span:first-child')].map((e) => e.textContent);

  it('opens from the dashboard and closes again', () => {
    const { container } = render(<PlotterScreen app={makeScreenApp()} />);
    const button = container.querySelector<HTMLElement>('#btn-menu')!;
    expect(container.querySelector('#menu')).toBeNull();

    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(items(container)).toEqual([
      'Search destination',
      'Set destination on map',
      'Route & waypoints',
      'Track recording',
      'Anchor alarm',
      'Night palette',
      'Settings',
    ]);

    fireEvent.click(button);
    expect(container.querySelector('#menu')).toBeNull();
  });

  it('offers the day palette at night', () => {
    const { container } = render(<PlotterScreen app={makeScreenApp({ settings: { theme: 'night' } })} />);
    fireEvent.click(container.querySelector('#btn-menu')!);
    expect(container.querySelector('#btn-night')!.textContent).toBe('Day palette');
  });

  it('closes the destination card before opening a tool, and closes itself', () => {
    const calls: string[] = [];
    const { container } = render(
      <PlotterScreen
        app={makeScreenApp()}
        controls={{
          beforeTool: () => calls.push('before'),
          tool: (t) => calls.push(t),
          setDestination: () => calls.push('place'),
          toggleNight: () => calls.push('night'),
          search: () => calls.push('search'),
        }}
      />,
    );
    const pick = (id: string) => {
      fireEvent.click(container.querySelector('#btn-menu')!);
      fireEvent.click(container.querySelector(id)!);
    };

    pick('#btn-route');
    expect(container.querySelector('#menu')).toBeNull();
    pick('#btn-settings');
    pick('#btn-search');
    pick('#btn-dest');
    pick('#btn-night');
    expect(calls).toEqual(['before', 'route', 'before', 'menu', 'before', 'search', 'place', 'night']);
  });

  it('closes on Escape', () => {
    const { container } = render(<PlotterScreen app={makeScreenApp()} />);
    fireEvent.click(container.querySelector('#btn-menu')!);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(container.querySelector('#menu')).toBeNull();
  });
});
