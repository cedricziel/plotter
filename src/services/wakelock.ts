/**
 * Screen Wake Lock with automatic re-acquisition: the browser releases the
 * lock whenever the page is hidden, so we request it again on return.
 */
export class WakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private pending: Promise<boolean> | null = null;
  private wanted = false;
  private reported = false;
  onChange: (active: boolean) => void = () => {};

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (this.wanted && document.visibilityState === 'visible') void this.acquire();
    });
  }

  get supported(): boolean {
    return 'wakeLock' in navigator;
  }

  get active(): boolean {
    return !!this.sentinel && !this.sentinel.released;
  }

  async enable(): Promise<boolean> {
    this.wanted = true;
    return this.acquire();
  }

  async disable(): Promise<void> {
    this.wanted = false;
    await this.sentinel?.release();
    this.sentinel = null;
    this.report();
  }

  private acquire(): Promise<boolean> {
    if (!this.supported || this.active) return Promise.resolve(this.active);
    this.pending ??= this.request().finally(() => (this.pending = null));
    return this.pending;
  }

  private async request(): Promise<boolean> {
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => this.report());
    } catch {
      /* refused, e.g. no user gesture yet */
    }
    this.report();
    return this.active;
  }

  private report(): void {
    if (this.active === this.reported) return;
    this.reported = this.active;
    this.onChange(this.reported);
  }
}
