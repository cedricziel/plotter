import type { Meta, StoryObj } from '@storybook/react-vite';
import { t } from '../i18n';
import { SheetFrame } from '../ui/sheet';
import { Screen } from './screen';
import { SettingsPanel, type SettingsApp } from '../ui/panels/bodies';
import { makePanelApp } from './fakes';

const meta: Meta<typeof SettingsPanel> = { title: 'Sheets/Settings', component: SettingsPanel };
export default meta;

const panel = () => (
  <Screen>
    <SheetFrame title={t('sheet.settings')}>
      <SettingsPanel
        app={makePanelApp() as unknown as SettingsApp}
        telemetry={{ enabled: () => true, set() {} }}
        version="1.0.0 (storybook)"
      />
    </SheetFrame>
  </Screen>
);

export const Default: StoryObj<typeof SettingsPanel> = { render: panel };

export const German: StoryObj<typeof SettingsPanel> = { globals: { language: 'de' }, render: panel };
