import type { Meta, StoryObj } from '@storybook/react-vite';
import { SeamarkCard } from '../ui/seamark-card';

const meta: Meta<typeof SeamarkCard> = {
  title: 'Seamark card',
  component: SeamarkCard,
  args: { theme: 'day', onClose: () => {} },
};
export default meta;

type Story = StoryObj<typeof SeamarkCard>;

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
