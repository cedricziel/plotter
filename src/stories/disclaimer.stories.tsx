import type { Meta, StoryObj } from '@storybook/react-vite';
import { Disclaimer } from '../ui/disclaimer';
import { Device, type DeviceName } from './device';

const meta: Meta<typeof Disclaimer> = { title: 'Disclaimer', component: Disclaimer };
export default meta;

const modal = (device: DeviceName = 'phone-portrait') => (
  <Device device={device}>
    <Disclaimer open />
  </Device>
);

type Story = StoryObj<typeof Disclaimer>;

export const Modal: Story = { render: () => modal() };

export const PhoneLandscape: Story = { render: () => modal('phone-landscape') };

export const TabletPortrait: Story = { render: () => modal('tablet-portrait') };

export const TabletLandscape: Story = { render: () => modal('tablet-landscape') };

export const German: Story = { globals: { language: 'de' }, render: () => modal() };
