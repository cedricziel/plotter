// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { makeGuidanceApp } from '../src/stories/fakes';
import { h } from '../src/ui/dom';
import { mountInstruments } from '../src/ui/instruments';

describe('navigation strip', () => {
  it('keeps its buttons across updates so a tap in progress still lands', () => {
    const app = makeGuidanceApp({ offCourse: true });
    const nav = h('div');
    const render = mountInstruments(app, h('header'), nav);
    render();
    const stop = nav.querySelector('.nav-stop');
    const recalc = nav.querySelector('.nav-off');

    app.progress = { ...app.progress!, dtw: 900 };
    render();

    expect(nav.querySelector('.nav-stop')).toBe(stop);
    expect(nav.querySelector('.nav-off')).toBe(recalc);
    expect(nav.textContent).toContain('900 m');
  });

  it('still reflects a change in what the strip shows', () => {
    const app = makeGuidanceApp({ offCourse: true });
    const nav = h('div');
    const render = mountInstruments(app, h('header'), nav);
    render();

    app.offCourse = false;
    app.recalculating = true;
    render();

    const recalc = nav.querySelector<HTMLButtonElement>('.nav-off')!;
    expect(recalc.textContent).toBe('Recalculating…');
    expect(recalc.disabled).toBe(true);

    app.recalculating = false;
    render();
    expect(nav.querySelector('.nav-off')).toBeNull();
  });
});
