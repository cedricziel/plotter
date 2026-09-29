import { describe, expect, it } from 'vitest';
import { onUserActivation } from '../src/ui/activation';

describe('onUserActivation', () => {
  it('runs on events that grant a user gesture on a touch screen', () => {
    const target = new EventTarget();
    let calls = 0;
    onUserActivation(target, () => calls++);
    for (const type of ['pointerup', 'touchend', 'click', 'keydown']) target.dispatchEvent(new Event(type));
    expect(calls).toBe(4);
  });

  it('ignores a finger landing: iOS grants the gesture only when it lifts', () => {
    const target = new EventTarget();
    let calls = 0;
    onUserActivation(target, () => calls++);
    target.dispatchEvent(new Event('pointerdown'));
    target.dispatchEvent(new Event('touchstart'));
    expect(calls).toBe(0);
  });

  it('stops listening once removed', () => {
    const target = new EventTarget();
    let calls = 0;
    const remove = onUserActivation(target, () => calls++);
    remove();
    target.dispatchEvent(new Event('touchend'));
    expect(calls).toBe(0);
  });
});
