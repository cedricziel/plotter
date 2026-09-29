import type { Meta, StoryObj } from '@storybook/react-vite';
import { SheetFrame } from '../ui/sheet';
import { Screen } from './screen';
import { WaypointPanel, type WaypointApp } from '../ui/panels/bodies';
import { makePanelApp } from './fakes';

const meta: Meta<typeof WaypointPanel> = { title: 'Sheets/Waypoint', component: WaypointPanel };
export default meta;

export const Saved: StoryObj<typeof WaypointPanel> = {
  render: () => (
    <Screen>
      <SheetFrame title="Marina Muiderzand">
        <WaypointPanel app={makePanelApp() as unknown as WaypointApp} id="a" />
      </SheetFrame>
    </Screen>
  ),
};
