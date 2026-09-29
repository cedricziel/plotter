import type { Meta, StoryObj } from '@storybook/html-vite';
import { h } from '../ui/dom';
import { mountInstruments } from '../ui/instruments';
import { LONG_MANEUVER, makeFix, makeGuidanceApp, type GuidanceOptions } from './fakes';

const instruments = (options: GuidanceOptions) => () => {
  const bar = h('header', { id: 'instruments' });
  mountInstruments(makeGuidanceApp({ progress: null, ...options }), bar, h('div'))();
  return bar;
};

const guidance = (options: GuidanceOptions) => () => {
  const nav = h('div', { id: 'navstrip' });
  mountInstruments(makeGuidanceApp(options), h('header'), nav)();
  return nav;
};

const meta: Meta = { title: 'Navigation' };
export default meta;

type Story = StoryObj;

export const InstrumentsGoodFix: Story = { render: instruments({}) };
export const InstrumentsStale: Story = {
  render: instruments({ fix: makeFix({ time: Date.now() - 60_000 }) }),
};
export const InstrumentsDenied: Story = {
  render: instruments({ status: 'denied', fix: null }),
};

export const GuidanceNextManeuver: Story = {
  render: guidance({ maneuver: 'Turn left at the lock' }),
};
export const GuidanceLongManeuverName: Story = {
  render: guidance({ maneuver: LONG_MANEUVER }),
};
export const GuidanceArrived: Story = {
  render: guidance({
    progress: { finished: true, nextIndex: 2, dtw: 8, remaining: 8 },
  }),
};
export const GuidanceOffCourse: Story = {
  render: guidance({ offCourse: true, progress: { xte: 180, steer: 65 } }),
};
export const GuidanceRecalculating: Story = {
  render: guidance({ offCourse: true, recalculating: true }),
};
export const GuidanceGpsDenied: Story = {
  render: guidance({ status: 'denied', fix: null, progress: null }),
};
export const GuidanceGpsSearching: Story = {
  render: guidance({ status: 'searching', fix: null, progress: null }),
};
