import type { Meta, StoryObj } from '@storybook/react-vite';
import { Instruments } from '../ui/instruments';
import { makeFix, makeGuidanceApp, type GuidanceOptions } from './fakes';

const instruments = (options: GuidanceOptions) => () => (
  <Instruments app={makeGuidanceApp({ progress: null, ...options })} />
);

const meta: Meta<typeof Instruments> = { title: 'Navigation/Instruments', component: Instruments };
export default meta;

type Story = StoryObj<typeof Instruments>;

export const GoodFix: Story = { render: instruments({}) };
export const Stale: Story = {
  render: instruments({ fix: makeFix({ time: Date.now() - 60_000 }) }),
};
export const Denied: Story = {
  render: instruments({ status: 'denied', fix: null }),
};
