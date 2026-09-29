import type { ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Toast } from '../ui/toast';
import { Device, type DeviceName } from './device';

const onDevice =
  (device: DeviceName = 'phone-portrait') =>
  (args: ComponentProps<typeof Toast>) => (
    <Device device={device}>
      <Toast {...args} />
    </Device>
  );

const meta: Meta<typeof Toast> = {
  title: 'Toast',
  component: Toast,
  render: onDevice(),
};
export default meta;

type Story = StoryObj<typeof Toast>;

const withAction = { message: 'Off course – tap to recalculate', onTap: () => {} };

export const Message: Story = { args: { message: 'Course charted: 15.4 km, 3 maneuvers' } };

export const WithAction: Story = { args: withAction };

export const PhoneLandscape: Story = { args: withAction, render: onDevice('phone-landscape') };

export const TabletPortrait: Story = { args: withAction, render: onDevice('tablet-portrait') };

export const TabletLandscape: Story = { args: withAction, render: onDevice('tablet-landscape') };
