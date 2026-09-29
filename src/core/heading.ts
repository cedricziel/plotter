import { normalizeBearing } from './geo';

/** The parts of a DeviceOrientationEvent a heading comes from. */
export interface OrientationReading {
  /** iOS: degrees clockwise from magnetic north to the top edge of the device in portrait. */
  webkitCompassHeading?: number | null;
  /** degrees counter-clockwise; relative to north only when `absolute` */
  alpha: number | null;
  absolute: boolean;
}

/**
 * Compass heading of the top edge of the screen, in degrees, or null when the
 * reading has none. `screenAngle` is `screen.orientation.angle`: the screen's
 * clockwise rotation from the device's natural (portrait) orientation.
 */
export function headingFromOrientation(e: OrientationReading, screenAngle: number): number | null {
  let device: number | null = null;
  if (e.webkitCompassHeading != null && Number.isFinite(e.webkitCompassHeading) && e.webkitCompassHeading >= 0) {
    device = e.webkitCompassHeading;
  } else if (e.absolute && e.alpha != null && Number.isFinite(e.alpha)) {
    device = 360 - e.alpha;
  }
  return device == null ? null : normalizeBearing(device + screenAngle);
}

const TIME_CONSTANT_MS = 500;
const RAD = Math.PI / 180;

/** Smooths compass jitter, averaging directions as vectors so readings either side of north don't cancel. */
export class HeadingFilter {
  private x = 0;
  private y = 0;
  private last: number | null = null;

  update(heading: number, time: number): number {
    const k = this.last == null ? 1 : 1 - Math.exp(-Math.max(0, time - this.last) / TIME_CONSTANT_MS);
    this.last = time;
    this.x += (Math.sin(heading * RAD) - this.x) * k;
    this.y += (Math.cos(heading * RAD) - this.y) * k;
    return normalizeBearing(Math.atan2(this.x, this.y) / RAD);
  }
}
