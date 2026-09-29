import type { Meta, StoryObj } from '@storybook/react-vite';
import { Toolbar } from '../ui/screen';
import { Device, type DeviceName } from './device';

const toolbar =
  (device: DeviceName = 'phone-portrait', state: { sheet?: string; recording?: boolean } = {}) =>
  () => (
    <Device device={device} fit>
      <div
        className={state.recording ? 'plotter recording' : 'plotter'}
        data-sheet={state.sheet}
        style={{ position: 'static', containerType: 'normal' }}
      >
        <Toolbar />
      </div>
    </Device>
  );

const meta: Meta = { title: 'Chrome/Toolbar', component: Toolbar };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: toolbar() };
export const RouteOpen: Story = { render: toolbar('phone-portrait', { sheet: 'route' }) };
export const Recording: Story = { render: toolbar('phone-portrait', { recording: true }) };
export const PhoneLandscape: Story = { render: toolbar('phone-landscape') };
export const TabletPortrait: Story = { render: toolbar('tablet-portrait') };
export const TabletLandscape: Story = { render: toolbar('tablet-landscape') };
