import type { Meta, StoryObj } from '@storybook/react-vite';
import { SheetFrame } from '../ui/sheet';
import { Device, type DeviceName } from './device';
import { AnchorPanel, type AnchorApp } from '../ui/panels/bodies';
import { makeFix, makePanelApp } from './fakes';

const meta: Meta<typeof AnchorPanel> = { title: 'Sheets/Anchor', component: AnchorPanel };
export default meta;

type Story = StoryObj<typeof AnchorPanel>;

const anchor = (armed: boolean) => ({ lat: 52.3731, lon: 4.8922, radius: 40, armed });

const sheet =
  (armed: boolean) =>
  (device: DeviceName = 'phone-portrait') => (
    <Device device={device}>
      <SheetFrame title="Anchor alarm">
        <AnchorPanel
          app={
            makePanelApp(
              armed
                ? { anchor: anchor(true), anchorCheck: { state: 'ok', distance: 12 }, fix: makeFix() }
                : { anchor: anchor(false) },
            ) as unknown as AnchorApp
          }
        />
      </SheetFrame>
    </Device>
  );

export const Disarmed: Story = { render: () => sheet(false)() };

export const Armed: Story = { render: () => sheet(true)() };

export const PhoneLandscape: Story = { render: () => sheet(true)('phone-landscape') };

export const TabletPortrait: Story = { render: () => sheet(true)('tablet-portrait') };

export const TabletLandscape: Story = { render: () => sheet(true)('tablet-landscape') };
