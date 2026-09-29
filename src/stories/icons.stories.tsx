import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ManeuverType } from '../core/routing';
import { Device, type DeviceName } from './device';
import { t } from '../i18n';
import { KindIcon, ManeuverIcon, PLACE_KINDS } from '../ui/icons';

const MANEUVERS: ManeuverType[] = [
  'depart',
  'continue',
  'slight-left',
  'turn-left',
  'sharp-left',
  'slight-right',
  'turn-right',
  'sharp-right',
  'via',
  'lock',
  'bridge-open',
  'bridge-fixed',
  'arrive',
];

const grid = { display: 'flex', flexWrap: 'wrap', gap: 16, padding: 16, color: 'var(--fg)' } as const;

const meta: Meta<typeof KindIcon> = { title: 'Icons', component: KindIcon };
export default meta;

type Story = StoryObj<typeof KindIcon>;

const placeKinds = (device: DeviceName = 'phone-portrait') => (
  <Device device={device} fit>
    <div style={grid}>
      {PLACE_KINDS.map((k) => (
        <span key={k} className="result-text" style={{ alignItems: 'center', display: 'flex', gap: 6 }}>
          <KindIcon kind={k} className="result-ico" />
          <small>{t(`kind.${k}`)}</small>
        </span>
      ))}
    </div>
  </Device>
);

const maneuvers = (device: DeviceName = 'phone-portrait') => (
  <Device device={device} fit>
    <div style={grid}>
      {MANEUVERS.map((m) => (
        <span key={m} style={{ alignItems: 'center', display: 'flex', gap: 6 }}>
          <ManeuverIcon type={m} className="nav-ico" />
          <small>{m}</small>
        </span>
      ))}
    </div>
  </Device>
);

export const PlaceKinds: Story = { render: () => placeKinds() };

export const Maneuvers: Story = { render: () => maneuvers() };

export const PhoneLandscape: Story = { render: () => placeKinds('phone-landscape') };

export const TabletPortrait: Story = { render: () => placeKinds('tablet-portrait') };

export const TabletLandscape: Story = { render: () => placeKinds('tablet-landscape') };
