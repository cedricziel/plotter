import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';
import { t } from '../i18n';
import { DestinationCard, PlacementBar } from '../ui/destination';
import { RoutePanel, SettingsPanel, type RouteApp, type SettingsApp } from '../ui/panels/bodies';
import { PlotterScreen, type ScreenBottom, type ScreenSheet } from '../ui/screen';
import { ChartBackdrop } from './chart';
import { DEVICES, Device, type DeviceName } from './device';
import { makeCardApp, makeScreenApp, type ScreenOptions } from './fakes';

interface Page {
  app?: ScreenOptions;
  sheet?: (app: ReturnType<typeof makeScreenApp>) => ScreenSheet;
  bottom?: ScreenBottom;
  toast?: string;
}

const NAVIGATING: ScreenOptions = { route: true, follow: true, maneuver: 'Turn left at the lock' };

const PAGES = {
  chart: { app: { follow: true } },
  navigating: { app: NAVIGATING },
  routeSheet: {
    app: { route: true },
    sheet: (app) => ({
      key: 'route',
      title: t('sheet.route'),
      content: <RoutePanel app={app as unknown as RouteApp} />,
    }),
  },
  settings: {
    sheet: (app) => ({
      key: 'menu',
      title: t('sheet.settings'),
      content: (
        <SettingsPanel
          app={app as unknown as SettingsApp}
          telemetry={{ enabled: () => true, set() {} }}
          version="1.0.0"
        />
      ),
    }),
  },
  destination: {
    bottom: {
      kind: 'card',
      content: (
        <DestinationCard
          app={makeCardApp()}
          place={{
            name: 'Jachthaven Aalsmeer',
            kind: 'marina',
            lat: 52.26,
            lon: 4.75,
            info: { vhf: '31', berths: 240, openingHours: 'Harbour master: 08:00-18:00 daily' },
          }}
          chart={async () => {}}
        />
      ),
    },
  },
  placing: { bottom: { kind: 'placing', content: <PlacementBar readout="2.35 km · 047°" /> } },
  anchorAlarm: { app: { anchorArmed: true, alarmReason: { kind: 'drag', distance: 62, radius: 40 } } },
  night: { app: { ...NAVIGATING, settings: { theme: 'night' } }, toast: 'Waypoint reached – next: Oranjesluizen' },
} satisfies Record<string, Page>;

const page =
  (name: keyof typeof PAGES, device: DeviceName): (() => ReactElement) =>
  () => {
    const p: Page = PAGES[name];
    const app = makeScreenApp(p.app);
    return (
      <Device device={device}>
        <PlotterScreen
          app={app}
          chart={<ChartBackdrop theme={app.settings.theme} route={!!app.activeRoute} />}
          sheet={p.sheet?.(app)}
          bottom={p.bottom}
          toast={p.toast}
        />
      </Device>
    );
  };

const meta: Meta = { title: 'Pages/Plotter screen', component: PlotterScreen };
export default meta;

type Story = StoryObj;

const OVERVIEW_LABELS: Record<keyof typeof PAGES, string> = {
  chart: 'Chart',
  navigating: 'Navigating',
  routeSheet: 'Route sheet',
  settings: 'Settings',
  destination: 'Destination',
  placing: 'Placing',
  anchorAlarm: 'Anchor alarm',
  night: 'Night',
};

const OVERVIEW_SCALE = 0.6;

/** Every screen state side by side on a phone, so the page reads at a glance. */
export const Overview: Story = {
  render: () => {
    const [width, height] = DEVICES['phone-portrait'];
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, max-content)', gap: 16 }}>
        {(Object.keys(PAGES) as (keyof typeof PAGES)[]).map((name) => {
          const Screen = page(name, 'phone-portrait');
          return (
            <figure key={name} style={{ margin: 0 }}>
              <div style={{ width: width * OVERVIEW_SCALE, height: height * OVERVIEW_SCALE, overflow: 'hidden' }}>
                <div style={{ transform: `scale(${OVERVIEW_SCALE})`, transformOrigin: '0 0' }}>
                  <Screen />
                </div>
              </div>
              <figcaption style={{ font: '600 13px system-ui', marginTop: 6 }}>{OVERVIEW_LABELS[name]}</figcaption>
            </figure>
          );
        })}
      </div>
    );
  },
};

export const ChartPhonePortrait: Story = { render: page('chart', 'phone-portrait') };
export const ChartPhoneLandscape: Story = { render: page('chart', 'phone-landscape') };
export const ChartTabletPortrait: Story = { render: page('chart', 'tablet-portrait') };
export const ChartTabletLandscape: Story = { render: page('chart', 'tablet-landscape') };

export const NavigatingPhonePortrait: Story = { render: page('navigating', 'phone-portrait') };
export const NavigatingPhoneLandscape: Story = { render: page('navigating', 'phone-landscape') };
export const NavigatingTabletPortrait: Story = { render: page('navigating', 'tablet-portrait') };
export const NavigatingTabletLandscape: Story = { render: page('navigating', 'tablet-landscape') };

export const RouteSheetPhonePortrait: Story = { render: page('routeSheet', 'phone-portrait') };
export const RouteSheetPhoneLandscape: Story = { render: page('routeSheet', 'phone-landscape') };
export const RouteSheetTabletPortrait: Story = { render: page('routeSheet', 'tablet-portrait') };
export const RouteSheetTabletLandscape: Story = { render: page('routeSheet', 'tablet-landscape') };

export const SettingsPhonePortrait: Story = { render: page('settings', 'phone-portrait') };
export const SettingsPhoneLandscape: Story = { render: page('settings', 'phone-landscape') };
export const SettingsTabletPortrait: Story = { render: page('settings', 'tablet-portrait') };
export const SettingsTabletLandscape: Story = { render: page('settings', 'tablet-landscape') };

export const DestinationPhonePortrait: Story = { render: page('destination', 'phone-portrait') };
export const DestinationPhoneLandscape: Story = { render: page('destination', 'phone-landscape') };
export const DestinationTabletPortrait: Story = { render: page('destination', 'tablet-portrait') };
export const DestinationTabletLandscape: Story = { render: page('destination', 'tablet-landscape') };

export const PlacingPhonePortrait: Story = { render: page('placing', 'phone-portrait') };
export const PlacingPhoneLandscape: Story = { render: page('placing', 'phone-landscape') };
export const PlacingTabletPortrait: Story = { render: page('placing', 'tablet-portrait') };
export const PlacingTabletLandscape: Story = { render: page('placing', 'tablet-landscape') };

export const AnchorAlarmPhonePortrait: Story = { render: page('anchorAlarm', 'phone-portrait') };
export const AnchorAlarmPhoneLandscape: Story = { render: page('anchorAlarm', 'phone-landscape') };
export const AnchorAlarmTabletPortrait: Story = { render: page('anchorAlarm', 'tablet-portrait') };
export const AnchorAlarmTabletLandscape: Story = { render: page('anchorAlarm', 'tablet-landscape') };

export const NightPhonePortrait: Story = { render: page('night', 'phone-portrait') };
export const NightPhoneLandscape: Story = { render: page('night', 'phone-landscape') };
export const NightTabletPortrait: Story = { render: page('night', 'tablet-portrait') };
export const NightTabletLandscape: Story = { render: page('night', 'tablet-landscape') };
