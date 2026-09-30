import type { Meta, StoryObj } from '@storybook/react-vite';
import { Dashboard, ToolMenu } from '../ui/screen';
import { Device, type DeviceName } from './device';
import { makeGuidanceApp } from './fakes';

const menu =
  (device: DeviceName = 'phone-portrait', state: { night?: boolean; recording?: boolean } = {}) =>
  () => (
    <Device device={device}>
      <Dashboard app={makeGuidanceApp({ progress: null })} menuOpen />
      <ToolMenu night={state.night} recording={state.recording} />
    </Device>
  );

const meta: Meta = { title: 'Chrome/Menu', component: ToolMenu };
export default meta;

type Story = StoryObj;

export const Open: Story = { render: menu() };
export const Recording: Story = { render: menu('phone-portrait', { recording: true }) };
export const Night: Story = { globals: { theme: 'night' }, render: menu('phone-portrait', { night: true }) };
export const PhoneSmall: Story = { render: menu('phone-small') };
export const PhoneLandscape: Story = { render: menu('phone-landscape') };
export const TabletPortrait: Story = { render: menu('tablet-portrait') };
export const TabletLandscape: Story = { render: menu('tablet-landscape') };
