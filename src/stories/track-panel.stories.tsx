import type { Meta, StoryObj } from '@storybook/react-vite';
import { SheetFrame } from '../ui/sheet';
import { Screen } from './screen';
import { TrackPanel, type TrackApp } from '../ui/panels/bodies';
import { makePanelApp } from './fakes';

const meta: Meta<typeof TrackPanel> = { title: 'Sheets/Track', component: TrackPanel };
export default meta;

type Story = StoryObj<typeof TrackPanel>;

const track = (over = {}) => ({
  id: 't1',
  name: 'Morning cruise',
  started: Date.now() - 3_600_000,
  ended: Date.now() - 1_800_000,
  points: [
    { lat: 52.37, lon: 4.89, time: 0 },
    { lat: 52.38, lon: 4.95, time: 1 },
  ],
  ...over,
});

export const Idle: Story = {
  render: () => (
    <Screen>
      <SheetFrame title="Track recording">
        <TrackPanel app={makePanelApp({ tracks: new Map([['t1', track()]]) }) as unknown as TrackApp} />
      </SheetFrame>
    </Screen>
  ),
};

const live = track({ id: 't2', name: 'Now', ended: undefined });
export const Recording: Story = {
  render: () => (
    <Screen>
      <SheetFrame title="Track recording">
        <TrackPanel
          app={
            makePanelApp({
              recording: live,
              tracks: new Map([
                ['t2', live],
                ['t1', track()],
              ]),
            }) as unknown as TrackApp
          }
        />
      </SheetFrame>
    </Screen>
  ),
};
