import type { Meta, StoryObj } from '@storybook/react-vite';
import { SheetFrame } from '../ui/sheet';
import { Device, type DeviceName } from './device';
import { WaypointPanel, type WaypointApp } from '../ui/panels/bodies';
import { makePanelApp } from './fakes';

const meta: Meta<typeof WaypointPanel> = { title: 'Sheets/Waypoint', component: WaypointPanel };
export default meta;

const saved = (device: DeviceName = 'phone-portrait') => (
  <Device device={device}>
    <SheetFrame title="Marina Muiderzand">
      <WaypointPanel app={makePanelApp() as unknown as WaypointApp} id="a" />
    </SheetFrame>
  </Device>
);

type Story = StoryObj<typeof WaypointPanel>;

export const Saved: Story = { render: () => saved() };

export const PhoneLandscape: Story = { render: () => saved('phone-landscape') };

export const TabletPortrait: Story = { render: () => saved('tablet-portrait') };

export const TabletLandscape: Story = { render: () => saved('tablet-landscape') };
