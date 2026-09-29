import type { Meta, StoryObj } from '@storybook/react-vite';
import { PlacementBar } from '../ui/destination';
import { Device, type DeviceName } from './device';

const bar =
  (device: DeviceName = 'phone-portrait', props: { readout?: string | null; charting?: boolean } = {}) =>
  () => (
    <Device device={device}>
      <div id="dest-bar">
        <PlacementBar
          readout={props.readout === undefined ? '2.35 km · 047°' : props.readout}
          charting={props.charting}
        />
      </div>
    </Device>
  );

const meta: Meta = { title: 'Destination/Placement bar', component: PlacementBar };
export default meta;

type Story = StoryObj;

export const WithFix: Story = { render: bar() };
export const NoFix: Story = { render: bar('phone-portrait', { readout: null }) };
export const Charting: Story = { render: bar('phone-portrait', { charting: true }) };
export const PhoneLandscape: Story = { render: bar('phone-landscape') };
export const TabletPortrait: Story = { render: bar('tablet-portrait') };
export const TabletLandscape: Story = { render: bar('tablet-landscape') };
