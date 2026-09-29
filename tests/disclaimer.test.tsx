// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Disclaimer, disclaimerState, showDisclaimerOnce } from '../src/ui/disclaimer';

beforeEach(() => {
  localStorage.clear();
  disclaimerState.set('hidden');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const modal = (c: HTMLElement) => c.querySelector('.modal.disclaimer');

describe('Disclaimer', () => {
  it('shows when not acknowledged', () => {
    const { container } = render(<Disclaimer />);
    expect(modal(container)).toBeNull();
    act(() => showDisclaimerOnce());
    expect(modal(container)).not.toBeNull();
  });

  it('stays hidden after an acknowledgement, unless forced', () => {
    localStorage.setItem('plotter.disclaimer.ack', String(Date.now()));
    const { container } = render(<Disclaimer />);
    act(() => showDisclaimerOnce());
    expect(modal(container)).toBeNull();
    act(() => showDisclaimerOnce(true));
    expect(modal(container)).not.toBeNull();
  });

  it('acknowledges on dismiss, keeps a closing modal for 500 ms, then removes it', () => {
    vi.useFakeTimers();
    const { container } = render(<Disclaimer />);
    act(() => showDisclaimerOnce());
    act(() => modal(container)!.dispatchEvent(new Event('pointerup', { bubbles: true, cancelable: true })));
    expect(modal(container)?.classList.contains('closing')).toBe(true);
    expect(localStorage.getItem('plotter.disclaimer.ack')).not.toBeNull();
    act(() => void vi.advanceTimersByTime(500));
    expect(modal(container)).toBeNull();
  });
});
