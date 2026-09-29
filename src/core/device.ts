export type DeviceClass = 'iphone' | 'ipad' | 'android-phone' | 'android-tablet' | 'desktop';

export interface DeviceInfo {
  userAgent: string;
  maxTouchPoints: number;
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
  /** running as an installed home-screen app */
  standalone: boolean;
}

export function deviceClass(userAgent: string, maxTouchPoints: number): DeviceClass {
  if (/iPhone|iPod/.test(userAgent)) return 'iphone';
  // iPadOS Safari reports a Mac user agent; only the touch screen gives it away.
  if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return 'ipad';
  if (/Android/.test(userAgent)) return /Mobile/.test(userAgent) ? 'android-phone' : 'android-tablet';
  return 'desktop';
}

/** Resource attributes for telemetry: what kind of device and browser, nothing about who or where. */
export function deviceAttributes(d: DeviceInfo): Record<string, string> {
  return {
    'user_agent.original': d.userAgent,
    'plotter.device.class': deviceClass(d.userAgent, d.maxTouchPoints),
    'plotter.display.mode': d.standalone ? 'standalone' : 'browser',
    'plotter.screen': `${d.screenWidth}x${d.screenHeight}@${d.pixelRatio}`,
  };
}
