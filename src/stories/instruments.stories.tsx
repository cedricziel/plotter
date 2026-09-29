import type { Meta, StoryObj } from '@storybook/react-vite';
import { Instruments } from '../ui/instruments';
import { Device, type DeviceName } from './device';
import { makeFix, makeGuidanceApp, type GuidanceOptions } from './fakes';

const instruments =
  (options: GuidanceOptions) =>
  (device: DeviceName = 'phone-portrait') => (
    <Device device={device} fit>
      <Instruments app={makeGuidanceApp({ progress: null, ...options })} />
    </Device>
  );

const meta: Meta<typeof Instruments> = { title: 'Navigation/Instruments', component: Instruments };
export default meta;

type Story = StoryObj<typeof Instruments>;

export const GoodFix: Story = { render: () => instruments({})() };
export const Stale: Story = {
  render: () => instruments({ fix: makeFix({ time: Date.now() - 60_000 }) })(),
};
export const Denied: Story = {
  render: () => instruments({ status: 'denied', fix: null })(),
};

export const PhoneSmall: Story = { render: () => instruments({})('phone-small') };

export const PhoneSmallStale: Story = {
  render: () => instruments({ fix: makeFix({ time: Date.now() - 60_000 }) })('phone-small'),
};

export const PhoneLandscape: Story = { render: () => instruments({})('phone-landscape') };

export const TabletPortrait: Story = { render: () => instruments({})('tablet-portrait') };

export const TabletLandscape: Story = { render: () => instruments({})('tablet-landscape') };

export const GermanGoodFix: Story = {
  globals: { language: 'de' },
  render: () => instruments({ fix: makeFix({ lat: 53 + 5.288 / 60, lon: 5 + 50.524 / 60, sog: 9.7 / 3.6 }) })(),
};
