import { HeadingFilter, headingFromOrientation } from '../core/heading';

type PermissionApi = {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

const EMIT_EVERY_MS = 100;

/**
 * Device compass heading of the top edge of the screen, smoothed. On iOS the
 * sensor needs a permission that can only be asked from a tap, so `enable()`
 * must run inside one; after a reload `resumeOnTap()` waits for the next tap.
 */
export class Compass {
  private filter = new HeadingFilter();
  private listening = false;
  private lastEmit = -Infinity;
  private pendingTap: (() => void) | null = null;

  constructor(private onHeading: (heading: number | null) => void) {}

  get supported(): boolean {
    return 'DeviceOrientationEvent' in window;
  }

  /** Ask for the sensor (call from a tap on iOS) and start listening. */
  async enable(): Promise<boolean> {
    if (!this.supported) return false;
    const api = DeviceOrientationEvent as unknown as PermissionApi;
    if (typeof api.requestPermission === 'function') {
      const state = await api.requestPermission().catch(() => 'denied' as const);
      if (state !== 'granted') return false;
    }
    this.start();
    return true;
  }

  /** Try now; if the browser wants a tap first, try again on the next one. */
  resumeOnTap(): void {
    void this.enable().then((ok) => {
      if (ok || this.pendingTap || !this.supported) return;
      const retry = () => {
        this.cancelTap();
        void this.enable();
      };
      this.pendingTap = retry;
      document.addEventListener('click', retry, true);
      document.addEventListener('touchend', retry, true);
    });
  }

  disable(): void {
    this.cancelTap();
    if (this.listening) {
      window.removeEventListener('deviceorientationabsolute', this.handle);
      window.removeEventListener('deviceorientation', this.handle);
      this.listening = false;
    }
    this.filter = new HeadingFilter();
    this.onHeading(null);
  }

  private start(): void {
    if (this.listening) return;
    this.listening = true;
    // Chrome's plain event is relative to wherever the page loaded; its absolute one points north.
    const type = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(type, this.handle as EventListener);
  }

  private cancelTap(): void {
    if (!this.pendingTap) return;
    document.removeEventListener('click', this.pendingTap, true);
    document.removeEventListener('touchend', this.pendingTap, true);
    this.pendingTap = null;
  }

  private handle = (e: DeviceOrientationEvent): void => {
    const raw = headingFromOrientation(
      {
        webkitCompassHeading: (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading,
        alpha: e.alpha,
        absolute: e.absolute || e.type === 'deviceorientationabsolute',
      },
      screenAngle(),
    );
    if (raw == null) return;
    const heading = this.filter.update(raw, e.timeStamp);
    if (e.timeStamp - this.lastEmit < EMIT_EVERY_MS) return;
    this.lastEmit = e.timeStamp;
    this.onHeading(heading);
  };
}

function screenAngle(): number {
  if (screen.orientation) return screen.orientation.angle;
  const legacy = (window as Window & { orientation?: number }).orientation;
  return typeof legacy === 'number' ? legacy : 0;
}
