import type { Decorator, Preview } from '@storybook/react-vite';
import { setLanguage } from '../src/i18n';
import '../src/ui/styles.css';
import './preview.css';

// top, bottom, left, right
const SAFE_AREAS = {
  none: ['0px', '0px', '0px', '0px'],
  notch: ['59px', '34px', '0px', '0px'],
  landscape: ['0px', '21px', '59px', '59px'],
} as const;

const withGlobals: Decorator = (Story, context) => {
  const root = document.documentElement;
  root.dataset.theme = context.globals.theme === 'night' ? 'night' : 'day';
  root.dataset.frame = context.globals.frame === 'viewport' ? 'viewport' : 'device';
  const [top, bottom, left, right] =
    SAFE_AREAS[context.globals.safeAreas as keyof typeof SAFE_AREAS] ?? SAFE_AREAS.none;
  root.style.setProperty('--safe-t', top);
  root.style.setProperty('--safe-b', bottom);
  root.style.setProperty('--safe-l', left);
  root.style.setProperty('--safe-r', right);
  setLanguage(context.globals.language === 'de' ? 'de' : 'en');
  return <Story />;
};

const preview: Preview = {
  decorators: [withGlobals],
  initialGlobals: {
    theme: 'day',
    safeAreas: 'none',
    language: 'en',
    frame: 'device',
    viewport: { value: 'iphone14', isRotated: false },
  },
  globalTypes: {
    theme: {
      description: 'Day or night (red) theme',
      toolbar: {
        title: 'Theme',
        icon: 'contrast',
        dynamicTitle: true,
        items: [
          { value: 'day', title: 'Day' },
          { value: 'night', title: 'Night' },
        ],
      },
    },
    language: {
      description: 'Language of the app texts',
      toolbar: {
        title: 'Language',
        icon: 'globe',
        dynamicTitle: true,
        items: [
          { value: 'en', title: 'English' },
          { value: 'de', title: 'Deutsch' },
        ],
      },
    },
    frame: {
      description: 'Device frames keep their own width, or follow the viewport width',
      toolbar: {
        title: 'Frame',
        icon: 'grow',
        dynamicTitle: true,
        items: [
          { value: 'device', title: 'Frame: device width' },
          { value: 'viewport', title: 'Frame: viewport width' },
        ],
      },
    },
    safeAreas: {
      description: 'Simulated safe-area insets',
      toolbar: {
        title: 'Safe areas',
        icon: 'mobile',
        dynamicTitle: true,
        items: [
          { value: 'none', title: 'Safe areas: none' },
          { value: 'notch', title: 'Safe areas: iPhone notch' },
          { value: 'landscape', title: 'Safe areas: iPhone landscape' },
        ],
      },
    },
  },
  parameters: {
    layout: 'fullscreen',
    viewport: {
      options: {
        iphoneSe: {
          name: 'iPhone SE 375x667',
          styles: { width: '375px', height: '667px' },
          type: 'mobile',
        },
        iphone14: {
          name: 'iPhone 14/15 390x844',
          styles: { width: '390px', height: '844px' },
          type: 'mobile',
        },
        iphone14ProMax: {
          name: 'iPhone 14 Pro Max 430x932',
          styles: { width: '430px', height: '932px' },
          type: 'mobile',
        },
        small: {
          name: 'Small 360x740',
          styles: { width: '360px', height: '740px' },
          type: 'mobile',
        },
        ipadPortrait: {
          name: 'iPad portrait 820x1180',
          styles: { width: '820px', height: '1180px' },
          type: 'tablet',
        },
        ipadLandscape: {
          name: 'iPad landscape 1180x820',
          styles: { width: '1180px', height: '820px' },
          type: 'tablet',
        },
      },
    },
  },
};

export default preview;
