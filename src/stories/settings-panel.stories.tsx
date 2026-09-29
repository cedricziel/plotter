import type { Meta, StoryObj } from '@storybook/react-vite';
import { t } from '../i18n';
import { SheetFrame } from '../ui/sheet';
import { Device, type DeviceName } from './device';
import { SettingsPanel, type SettingsApp } from '../ui/panels/bodies';
import { makePanelApp } from './fakes';

const meta: Meta<typeof SettingsPanel> = { title: 'Sheets/Settings', component: SettingsPanel };
export default meta;

const settings = (device: DeviceName = 'phone-portrait') => (
  <Device device={device}>
    <SheetFrame title={t('sheet.settings')}>
      <SettingsPanel
        app={makePanelApp() as unknown as SettingsApp}
        telemetry={{ enabled: () => true, set() {} }}
        version="1.0.0 (storybook)"
      />
    </SheetFrame>
  </Device>
);

type Story = StoryObj<typeof SettingsPanel>;

export const Default: Story = { render: () => settings() };

export const PhoneLandscape: Story = { render: () => settings('phone-landscape') };

export const TabletPortrait: Story = { render: () => settings('tablet-portrait') };

export const TabletLandscape: Story = { render: () => settings('tablet-landscape') };

export const German: Story = { globals: { language: 'de' }, render: () => settings() };
