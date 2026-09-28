/**
 * Screen Wake Lock with automatic re-acquisition: the browser releases the
 * lock whenever the page is hidden, so we request it again on return.
 */
export class WakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;
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
    this.onChange(false);
  }

  private async acquire(): Promise<boolean> {
    if (!this.supported || this.active) return this.active;
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => this.onChange(false));
      this.onChange(true);
      return true;
    } catch {
      this.onChange(false);
      return false;
    }
  }
}
