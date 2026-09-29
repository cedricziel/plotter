import type { Meta, StoryObj } from '@storybook/react-vite';
import { SheetFrame } from '../ui/sheet';
import { Screen } from './screen';
import { SettingsPanel, type SettingsApp } from '../ui/panels/bodies';
import { makePanelApp } from './fakes';

const meta: Meta<typeof SettingsPanel> = { title: 'Sheets/Settings', component: SettingsPanel };
export default meta;

export const Default: StoryObj<typeof SettingsPanel> = {
  render: () => (
    <Screen>
      <SheetFrame title="Settings">
        <SettingsPanel
          app={makePanelApp() as unknown as SettingsApp}
          telemetry={{ enabled: () => true, set() {} }}
          version="1.0.0 (storybook)"
        />
      </SheetFrame>
    </Screen>
  ),
};
