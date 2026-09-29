// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../src/i18n';
import { makeFix, makeGuidanceApp, type GuidanceOptions } from '../src/stories/fakes';
import { Instruments, NavStrip } from '../src/ui/instruments';

afterEach(() => {
  cleanup();
  setLanguage('en');
});

describe('navigation strip', () => {
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
    expect(nav.querySelector('.nav-text')!.textContent).toBe('In 253 m — Links abbiegen in IJ');
    expect(nav.querySelector('.nav-stop')!.getAttribute('aria-label')).toBe('Navigation beenden');
    expect(nav.textContent).toContain('15,4 km');
    expect(nav.textContent).toContain('ZIEL');
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
    expect(bar.querySelector('[data-value="pos"]')!.textContent).toBe('53°05,288′N\n005°50,524′E');
  });

  it('names the GPS state in German', () => {
    setLanguage('de');
    const bar = render(
      <Instruments app={makeGuidanceApp({ status: 'denied', fix: null, progress: null })} />,
    ).container;
    expect(bar.querySelector('[data-value="acc"]')!.textContent).toBe('SPERRE');
  });
});
