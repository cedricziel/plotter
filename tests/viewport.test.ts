import { describe, expect, it } from 'vitest';
import { fullScreenHeight } from '../src/ui/viewport';

// iPhone 17 Pro: 402×874 pt, 62 pt status bar.
describe('fullScreenHeight', () => {
  it('stretches a viewport iOS cut short by the status bar', () => {
    expect(fullScreenHeight(402, 812, 402, 874)).toBe(874);
  });

  it('uses the short screen side in landscape', () => {
    expect(fullScreenHeight(874, 380, 402, 874)).toBe(402);
  });

  it('leaves a full-height viewport alone', () => {
    expect(fullScreenHeight(402, 874, 402, 874)).toBeNull();
    expect(fullScreenHeight(874, 402, 402, 874)).toBeNull();
  });
});
