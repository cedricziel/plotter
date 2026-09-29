import type { Meta, StoryObj } from '@storybook/react-vite';
import { SheetFrame } from '../ui/sheet';
import { Screen } from './screen';
import { AnchorPanel, type AnchorApp } from '../ui/panels/bodies';
import { makeFix, makePanelApp } from './fakes';

const meta: Meta<typeof AnchorPanel> = { title: 'Sheets/Anchor', component: AnchorPanel };
export default meta;

type Story = StoryObj<typeof AnchorPanel>;

const anchor = (armed: boolean) => ({ lat: 52.3731, lon: 4.8922, radius: 40, armed });

export const Disarmed: Story = {
  render: () => (
    <Screen>
      <SheetFrame title="Anchor alarm">
        <AnchorPanel app={makePanelApp({ anchor: anchor(false) }) as unknown as AnchorApp} />
      </SheetFrame>
    </Screen>
  ),
};

export const Armed: Story = {
  render: () => (
    <Screen>
      <SheetFrame title="Anchor alarm">
        <AnchorPanel
          app={
            makePanelApp({
              anchor: anchor(true),
              anchorCheck: { state: 'ok', distance: 12 },
              fix: makeFix(),
            }) as unknown as AnchorApp
          }
        />
      </SheetFrame>
    </Screen>
  ),
};
