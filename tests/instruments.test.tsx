// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../src/i18n';
import { makeFix, makeGuidanceApp, type GuidanceOptions } from '../src/stories/fakes';
import { Instruments, NavStrip } from '../src/ui/instruments';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setLanguage('en');
});

const labels = (bar: HTMLElement) => [...bar.querySelectorAll('.inst-label')].map((e) => e.firstChild!.textContent);
const wide = (bar: HTMLElement) =>
  [...bar.querySelectorAll('.inst.wide .inst-label')].map((e) => e.firstChild!.textContent);

describe('dashboard', () => {
  it('shows speed, course and GPS while not navigating', () => {
    const bar = render(<Instruments app={makeGuidanceApp({ progress: null })} />).container;
    expect(labels(bar)).toEqual(['SOG', 'COG', 'GPS']);
    expect(wide(bar)).toEqual([]);
  });

  it('shows the leg while navigating, with course, cross-track and the end only on wide screens', () => {
    const bar = render(<Instruments app={makeGuidanceApp()} />).container;
    expect(labels(bar)).toEqual(['SOG', 'COG', 'DTW', 'XTE ◀', 'ETA', 'END 15.4 km']);
    expect(wide(bar)).toEqual(['COG', 'XTE ◀', 'END 15.4 km']);
  });

  it('keeps the GPS state in view while navigating without a fix', () => {
    const bar = render(<Instruments app={makeGuidanceApp({ status: 'lost' })} />).container;
    expect(labels(bar)).toEqual(['SOG', 'COG', 'GPS', 'DTW', 'XTE ◀', 'ETA', 'END 15.4 km']);
    expect(bar.querySelector('[data-value="acc"]')!.textContent).toBe('LOST');
  });

  it('shows the arrival time at the destination as the value of the end cell', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 30, 10, 0));
    const bar = render(<Instruments app={makeGuidanceApp({ progress: { ttg: 3600, ttgNext: 900 } })} />).container;
    expect(bar.querySelector('[data-value="eta"]')!.textContent).toBe('10:15');
    expect(bar.querySelector('[data-value="end"]')!.textContent).toBe('11:00');
  });
});

describe('guidance card', () => {
  it('shows the distance to the next maneuver apart from its text', () => {
    const nav = render(
      <NavStrip app={makeGuidanceApp({ maneuver: { type: 'turn-left', name: 'IJ' }, progress: { dtw: 253 } })} />,
    ).container;
    expect(nav.querySelector('.nav-dist')!.textContent).toBe('253 m');
    expect(nav.querySelector('.nav-text')!.textContent).toBe('Turn left into IJ');
    expect(nav.querySelector('.nav-next')!.textContent).toContain('Schellingwoude');
  });

  it('gives the bearing to the waypoint while there is no steer cue', () => {
    const still = render(
      <NavStrip app={makeGuidanceApp({ fix: makeFix({ sog: 0 }), progress: { btw: 81 } })} />,
    ).container;
    expect(still.querySelector('.nav-btw')!.textContent).toBe('BTW 081°');
    expect(still.querySelector('.nav-steer')).toBeNull();
  });

  it('keeps its buttons across updates so a tap in progress still lands', () => {
    const app = makeGuidanceApp({ offCourse: true });
    const { container, rerender } = render(<NavStrip app={app} />);
    const stop = container.querySelector('.nav-stop');
    const recalc = container.querySelector('.nav-off');
    expect(stop).not.toBeNull();
    expect(recalc).not.toBeNull();

    app.progress = { ...app.progress!, dtw: 900 };
    rerender(<NavStrip app={app} />);

    expect(container.querySelector('.nav-stop')).toBe(stop);
    expect(container.querySelector('.nav-off')).toBe(recalc);
    expect(container.textContent).toContain('900 m');
  });

  it('still reflects a change in what the strip shows', () => {
    const app = makeGuidanceApp({ offCourse: true });
    const { container, rerender } = render(<NavStrip app={app} />);

    app.offCourse = false;
    app.recalculating = true;
    rerender(<NavStrip app={app} />);

    const recalc = container.querySelector<HTMLButtonElement>('.nav-off')!;
    expect(recalc.textContent).toBe('Recalculating…');
    expect(recalc.disabled).toBe(true);

    app.recalculating = false;
    rerender(<NavStrip app={app} />);
    expect(container.querySelector('.nav-off')).toBeNull();
  });
});

describe('instruments in German', () => {
  const strip = (options: GuidanceOptions) => render(<NavStrip app={makeGuidanceApp(options)} />).container;

  it('shows the next maneuver in German with the name unchanged', () => {
    setLanguage('de');
    const nav = strip({ maneuver: { type: 'turn-left', name: 'IJ' }, progress: { dtw: 253 } });
    expect(nav.querySelector('.nav-dist')!.textContent).toBe('253 m');
    expect(nav.querySelector('.nav-text')!.textContent).toBe('Links abbiegen in IJ');
    expect(nav.querySelector('.nav-stop')!.getAttribute('aria-label')).toBe('Navigation beenden');
  });

  it('writes the leg cells in German', () => {
    setLanguage('de');
    const bar = render(<Instruments app={makeGuidanceApp()} />).container;
    expect(bar.querySelector('.inst-end .inst-label')!.textContent).toBe('ZIEL 15,4 km');
  });

  it('keeps the stored text of a maneuver saved before names existed', () => {
    setLanguage('de');
    const nav = strip({ maneuver: 'Continue on Pikmar', progress: { dtw: 20 } });
    expect(nav.querySelector('.nav-text')!.textContent).toBe('Continue on Pikmar');
  });

  it('offers to recalculate in German', () => {
    setLanguage('de');
    expect(strip({ offCourse: true }).querySelector('.nav-off')!.textContent).toBe(
      'Vom Kurs abgekommen — Neu berechnen',
    );
    cleanup();
    expect(strip({ offCourse: true, recalculating: true }).querySelector('.nav-off')!.textContent).toBe(
      'Wird neu berechnet…',
    );
  });

  it('explains in German why guidance waits', () => {
    setLanguage('de');
    const nav = strip({ status: 'denied', fix: null, progress: null });
    expect(nav.querySelector('.nav-wait')!.textContent).toMatch(/^Standortzugriff gesperrt/);
  });

  it('writes the instrument bar with decimal commas', () => {
    setLanguage('de');
    const fix = makeFix({ lat: 53 + 5.288 / 60, lon: 5 + 50.524 / 60, sog: 9.7 / 3.6 });
    const bar = render(<Instruments app={makeGuidanceApp({ fix, progress: null })} />).container;
    expect(bar.querySelector('[data-value="sog"]')!.textContent).toBe('9,7');
  });

  it('names the GPS state in German', () => {
    setLanguage('de');
    const bar = render(
      <Instruments app={makeGuidanceApp({ status: 'denied', fix: null, progress: null })} />,
    ).container;
    expect(bar.querySelector('[data-value="acc"]')!.textContent).toBe('GESPERRT');
    // A status word is set smaller than a reading, so the longer German words fit the tile at 360 px.
    expect(bar.querySelector('.inst-acc')!.classList.contains('status')).toBe(true);
  });

  it('shows the accuracy as a reading, not a status', () => {
    const bar = render(<Instruments app={makeGuidanceApp({ progress: null })} />).container;
    expect(bar.querySelector('.inst-acc')!.classList.contains('status')).toBe(false);
  });
});
