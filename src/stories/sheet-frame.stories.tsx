import type { Meta, StoryObj } from '@storybook/react-vite';
import { SheetFrame } from '../ui/sheet';
import { Device, type DeviceName } from './device';

const sheet =
  (device: DeviceName = 'phone-portrait') =>
  () => (
    <Device device={device}>
      <SheetFrame title="Lock ahead">
        <div className="stats">
          <div className="stat">
            <div className="stat-label">Distance</div>
            <div className="stat-value">1.2 km</div>
          </div>
          <div className="stat">
            <div className="stat-label">ETA</div>
            <div className="stat-value">14:05</div>
          </div>
        </div>
        <p className="hint">Oranjesluizen: call on VHF 18 before arrival.</p>
        <div className="row">
          <button className="btn primary grow big">Call lock</button>
          <button className="btn big">Later</button>
        </div>
      </SheetFrame>
    </Device>
  );

const meta: Meta = { title: 'Sheets/Sheet frame', component: SheetFrame };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: sheet() };
export const PhoneLandscape: Story = { render: sheet('phone-landscape') };
export const TabletPortrait: Story = { render: sheet('tablet-portrait') };
export const TabletLandscape: Story = { render: sheet('tablet-landscape') };
