import type { Meta, StoryObj } from '@storybook/react-vite';
import { MapControls } from '../ui/screen';
import { Device, type DeviceName } from './device';

const controls =
  (device: DeviceName = 'phone-portrait', courseUp = true) =>
  () => (
    <Device device={device}>
      <MapControls courseUp={courseUp} />
    </Device>
  );

const meta: Meta = { title: 'Chrome/Map controls', component: MapControls };
export default meta;

type Story = StoryObj;

export const CourseUp: Story = { render: controls() };
export const NorthUp: Story = { render: controls('phone-portrait', false) };
export const PhoneLandscape: Story = { render: controls('phone-landscape') };
export const TabletPortrait: Story = { render: controls('tablet-portrait') };
export const TabletLandscape: Story = { render: controls('tablet-landscape') };
