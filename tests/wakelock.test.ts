import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WakeLock } from "../src/services/wakelock";

class FakeSentinel extends EventTarget {
  released = false;
  async release() {
    this.released = true;
    this.dispatchEvent(new Event("release"));
  }
}

let request: ReturnType<typeof vi.fn>;

beforeEach(() => {
  request = vi.fn(async () => new FakeSentinel());
  vi.stubGlobal("document", new EventTarget());
  vi.stubGlobal("navigator", { wakeLock: { request } });
});
afterEach(() => vi.unstubAllGlobals());

describe("WakeLock", () => {
  it("sends one request while taps pile up before the first answers", async () => {
    const lock = new WakeLock();
    await Promise.all([lock.enable(), lock.enable(), lock.enable()]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(lock.active).toBe(true);
  });

  it("reports only real changes", async () => {
    const lock = new WakeLock();
    const changes: boolean[] = [];
    lock.onChange = (a) => changes.push(a);
    await lock.enable();
    await lock.enable();
    await lock.disable();
    await lock.disable();
    expect(changes).toEqual([true, false]);
  });

  it("stays quiet when a refused request is retried and refused again", async () => {
    request.mockRejectedValue(
      new DOMException("no gesture", "NotAllowedError"),
    );
    const lock = new WakeLock();
    const changes: boolean[] = [];
    lock.onChange = (a) => changes.push(a);
    await lock.enable();
    await lock.enable();
    expect(changes).toEqual([]);
  });
});
