import type { Meta, StoryObj } from '@storybook/react-vite';
import { SheetFrame } from '../ui/sheet';
import { Screen } from './screen';
import { RoutePanel, type RouteApp } from '../ui/panels/bodies';
import { ACTIVE_ROUTE, makePanelApp } from './fakes';

const meta: Meta<typeof RoutePanel> = { title: 'Sheets/Route', component: RoutePanel };
export default meta;

type Story = StoryObj<typeof RoutePanel>;

export const Empty: Story = {
  render: () => (
    <Screen>
      <SheetFrame title="Route & waypoints">
        <RoutePanel app={makePanelApp({ waypoints: new Map(), routes: new Map() }) as unknown as RouteApp} />
      </SheetFrame>
    </Screen>
  ),
};

export const Active: Story = {
  render: () => (
    <Screen>
      <SheetFrame title="Route & waypoints">
        <RoutePanel
          app={
            makePanelApp({
              activeRoute: ACTIVE_ROUTE,
              progress: {
                nextIndex: 1,
                dtw: 1250,
                btw: 84,
                remaining: 15400,
                ttg: 3600,
                ttgNext: 900,
                xte: 12,
                vmg: 2.1,
                steer: 12,
                finished: false,
              },
            }) as unknown as RouteApp
          }
        />
      </SheetFrame>
    </Screen>
  ),
};
