import type { Meta, StoryObj } from '@storybook/react-vite';
import { SeamarkCard } from '../ui/seamark-card';
import { Device, type DeviceName } from './device';

const meta: Meta<typeof SeamarkCard> = {
  title: 'Seamark card',
  component: SeamarkCard,
  args: { theme: 'day', onClose: () => {} },
};
export default meta;

type Story = StoryObj<typeof SeamarkCard>;

const onDevice =
  (device: DeviceName = 'phone-portrait') =>
  (args: React.ComponentProps<typeof SeamarkCard>) => (
    <Device device={device} theme={args.theme === 'night' ? 'night' : undefined}>
      <div id="dest-bar">
        <SeamarkCard {...args} />
      </div>
    </Device>
  );

meta.render = onDevice();

export const LateralBuoy: Story = {
  args: {
    seamark: {
      lat: 52.38,
      lon: 4.9,
      type: 'buoy_lateral',
      category: 'port',
      colour: 'red',
      name: 'IJ 12',
      light: 'Fl R 4s',
    },
  },
};
export const LateralBuoyNight: Story = {
  args: { ...LateralBuoy.args, theme: 'night' },
};
export const Notice: Story = {
  args: { seamark: { lat: 0, lon: 0, type: 'notice' } },
};

export const PhoneLandscape: Story = { args: LateralBuoy.args, render: onDevice('phone-landscape') };

export const TabletPortrait: Story = { args: LateralBuoy.args, render: onDevice('tablet-portrait') };

export const TabletLandscape: Story = { args: LateralBuoy.args, render: onDevice('tablet-landscape') };
