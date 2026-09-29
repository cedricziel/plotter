// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { makeGuidanceApp } from '../src/stories/fakes';
import { NavStrip } from '../src/ui/instruments';

afterEach(cleanup);

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
