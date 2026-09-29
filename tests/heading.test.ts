import { describe, expect, it } from 'vitest';
import { HeadingFilter, headingFromOrientation } from '../src/core/heading';

const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('headingFromOrientation', () => {
  it('takes the iOS compass heading as the direction of the top edge in portrait', () => {
    expect(headingFromOrientation({ webkitCompassHeading: 30, alpha: 123, absolute: false }, 0)).toBe(30);
  });

  it('turns with the screen: in landscape the top of the screen is a quarter turn from the top of the device', () => {
    expect(headingFromOrientation({ webkitCompassHeading: 30, alpha: null, absolute: false }, 90)).toBe(120);
    expect(headingFromOrientation({ webkitCompassHeading: 30, alpha: null, absolute: false }, 270)).toBe(300);
  });

  it('converts an absolute alpha (counter-clockwise from north) to a compass heading', () => {
    expect(headingFromOrientation({ alpha: 90, absolute: true }, 0)).toBe(270);
    expect(headingFromOrientation({ alpha: 0, absolute: true }, 90)).toBe(90);
  });

  it('has no heading from a relative alpha or a missing / negative iOS heading', () => {
    expect(headingFromOrientation({ alpha: 90, absolute: false }, 0)).toBeNull();
    expect(headingFromOrientation({ webkitCompassHeading: -1, alpha: null, absolute: false }, 0)).toBeNull();
    expect(headingFromOrientation({ alpha: null, absolute: true }, 0)).toBeNull();
  });
});

describe('HeadingFilter', () => {
  it('starts at the first reading', () => {
    expect(new HeadingFilter().update(42, 0)).toBe(42);
  });

  it('averages across north without swinging through south', () => {
    const f = new HeadingFilter();
    f.update(350, 0);
    const h = f.update(10, 100);
    expect(angleDiff(h, 0)).toBeLessThan(10);
  });

  it('damps jitter but settles on a new heading within a couple of seconds', () => {
    const f = new HeadingFilter();
    f.update(0, 0);
    const first = f.update(90, 50);
    expect(first).toBeLessThan(30);
    let h = first;
    for (let t = 100; t <= 2000; t += 50) h = f.update(90, t);
    expect(angleDiff(h, 90)).toBeLessThan(3);
  });
});
