import type { Meta, StoryObj } from '@storybook/react-vite';
import { NavStrip } from '../ui/instruments';
import { LONG_MANEUVER, makeGuidanceApp, type GuidanceOptions } from './fakes';

const guidance = (options: GuidanceOptions) => () => <NavStrip app={makeGuidanceApp(options)} />;

const meta: Meta<typeof NavStrip> = { title: 'Navigation/Guidance strip', component: NavStrip };
export default meta;

type Story = StoryObj<typeof NavStrip>;

export const NextManeuver: Story = {
  render: guidance({ maneuver: 'Turn left at the lock' }),
};
export const LongManeuverName: Story = {
  render: guidance({ maneuver: LONG_MANEUVER }),
};
export const Arrived: Story = {
  render: guidance({
    progress: { finished: true, nextIndex: 2, dtw: 8, remaining: 8 },
  }),
};
export const OffCourse: Story = {
  render: guidance({ offCourse: true, progress: { xte: 180, steer: 65 } }),
};
export const Recalculating: Story = {
  render: guidance({ offCourse: true, recalculating: true }),
};
export const GpsDenied: Story = {
  render: guidance({ status: 'denied', fix: null, progress: null }),
};
export const GpsSearching: Story = {
  render: guidance({ status: 'searching', fix: null, progress: null }),
};
