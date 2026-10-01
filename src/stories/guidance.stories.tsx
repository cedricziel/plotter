import type { Meta, StoryObj } from '@storybook/react-vite';
import { NavStrip } from '../ui/instruments';
import { Device, type DeviceName } from './device';
import { LONG_MANEUVER, makeGuidanceApp, type GuidanceOptions } from './fakes';

const guidance =
  (options: GuidanceOptions) =>
  (device: DeviceName = 'phone-portrait') => (
    <Device device={device}>
      <NavStrip app={makeGuidanceApp(options)} />
    </Device>
  );

const nextManeuver = guidance({ maneuver: 'Turn left at the lock' });

const meta: Meta<typeof NavStrip> = { title: 'Navigation/Guidance card', component: NavStrip };
export default meta;

type Story = StoryObj<typeof NavStrip>;

export const NextManeuver: Story = {
  render: () => guidance({ maneuver: 'Turn left at the lock' })(),
};
export const ThenAnotherManeuver: Story = {
  render: () =>
    guidance({
      maneuver: { type: 'bridge-open', name: 'Spannenburg brug' },
      following: { type: 'turn-right', name: 'Prinses Margrietkanaal' },
    })(),
};
export const LongManeuverName: Story = {
  render: () => guidance({ maneuver: LONG_MANEUVER })(),
};
export const Arrived: Story = {
  render: () =>
    guidance({
      progress: { finished: true, nextIndex: 2, dtw: 8, remaining: 8 },
    })(),
};
export const OffCourse: Story = {
  render: () => guidance({ offCourse: true, progress: { xte: 180, steer: 65 } })(),
};
export const Recalculating: Story = {
  render: () => guidance({ offCourse: true, recalculating: true })(),
};
export const GpsDenied: Story = {
  render: () => guidance({ status: 'denied', fix: null, progress: null })(),
};
export const GpsSearching: Story = {
  render: () => guidance({ status: 'searching', fix: null, progress: null })(),
};

export const PhoneLandscape: Story = { render: () => nextManeuver('phone-landscape') };

export const TabletPortrait: Story = { render: () => nextManeuver('tablet-portrait') };

export const TabletLandscape: Story = { render: () => nextManeuver('tablet-landscape') };

export const GermanLongManeuver: Story = {
  globals: { language: 'de' },
  render: () => guidance({ maneuver: { type: 'sharp-right', name: 'Amsterdam-Rijnkanaal' } })(),
};
export const GermanOffCourse: Story = {
  globals: { language: 'de' },
  render: () => guidance({ offCourse: true, progress: { xte: 180, steer: 65 } })(),
};
export const GermanWaitingForGps: Story = {
  globals: { language: 'de' },
  render: () => guidance({ status: 'denied', fix: null, progress: null })(),
};
