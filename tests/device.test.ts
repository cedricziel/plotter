import { describe, expect, it } from 'vitest';
import { deviceAttributes, deviceClass } from '../src/core/device';

// iPadOS Safari asks for desktop sites, so it claims to be a Mac.
const IPAD =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const ANDROID_PHONE =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 15; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

describe('deviceClass', () => {
  it('tells an iPad from a Mac by its touch screen', () => {
    expect(deviceClass(IPAD, 5)).toBe('ipad');
    expect(deviceClass(IPAD, 0)).toBe('desktop');
  });

  it('recognises phones and tablets', () => {
    expect(deviceClass(IPHONE, 5)).toBe('iphone');
    expect(deviceClass(ANDROID_PHONE, 5)).toBe('android-phone');
    expect(deviceClass(ANDROID_TABLET, 10)).toBe('android-tablet');
    expect(deviceClass(WINDOWS, 0)).toBe('desktop');
  });
});

describe('deviceAttributes', () => {
  it('describes the device without anything that identifies the person', () => {
    const attrs = deviceAttributes({
      userAgent: IPAD,
      maxTouchPoints: 5,
      screenWidth: 1180,
      screenHeight: 820,
      pixelRatio: 2,
      standalone: true,
    });
    expect(attrs).toEqual({
      'user_agent.original': IPAD,
      'plotter.device.class': 'ipad',
      'plotter.display.mode': 'standalone',
      'plotter.screen': '1180x820@2',
    });
  });
});
