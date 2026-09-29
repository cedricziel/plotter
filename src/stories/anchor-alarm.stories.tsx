import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnchorAlarm } from '../ui/screen';
import { Device, type DeviceName } from './device';

const alarm =
  (device: DeviceName = 'phone-portrait') =>
  () => (
    <Device device={device}>
      <AnchorAlarm reason="Anchor dragging: 62 m from the drop point (radius 40 m)" />
    </Device>
  );

const meta: Meta = { title: 'Chrome/Anchor alarm', component: AnchorAlarm };
export default meta;

type Story = StoryObj;

export const Dragging: Story = { render: alarm() };
export const PhoneLandscape: Story = { render: alarm('phone-landscape') };
export const TabletPortrait: Story = { render: alarm('tablet-portrait') };
export const TabletLandscape: Story = { render: alarm('tablet-landscape') };
