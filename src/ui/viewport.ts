import { deviceClass } from '../core/device';

/**
 * Height the app should fill, or null to leave it to CSS.
 *
 * iOS home-screen apps with a translucent status bar report a viewport one
 * status bar shorter than the screen, leaving a blank band below the toolbar.
 * On an iPhone the standalone window always covers the whole screen, so the
 * screen size is the true height. iOS keeps screen.width/height in portrait
 * terms, so pick the side by orientation.
 */
export function fullScreenHeight(
  innerWidth: number,
  innerHeight: number,
  screenWidth: number,
  screenHeight: number,
): number | null {
  const landscape = innerWidth > innerHeight;
  const h = landscape ? Math.min(screenWidth, screenHeight) : Math.max(screenWidth, screenHeight);
  return h > innerHeight ? h : null;
}

export function fitStandaloneViewport(): void {
  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!standalone || deviceClass(navigator.userAgent, navigator.maxTouchPoints ?? 0) !== 'iphone') return;

  const root = document.documentElement;
  const fit = () => {
    const h = fullScreenHeight(innerWidth, innerHeight, screen.width, screen.height);
    if (h === null) root.style.removeProperty('--app-h');
    else root.style.setProperty('--app-h', `${h}px`);
  };
  fit();
  addEventListener('resize', fit);
  addEventListener('orientationchange', () => setTimeout(fit, 300));
  document.addEventListener('visibilitychange', fit);
}
