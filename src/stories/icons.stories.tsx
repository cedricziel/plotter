import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ManeuverType } from '../core/routing';
import type { PlaceKind } from '../core/waterway-data';
import { KIND_LABEL, KindIcon, ManeuverIcon } from '../ui/icons';

const KINDS = Object.keys(KIND_LABEL) as PlaceKind[];
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

export const PlaceKinds: StoryObj<typeof KindIcon> = {
  render: () => (
    <div style={grid}>
      {KINDS.map((k) => (
        <span key={k} className="result-text" style={{ alignItems: 'center', display: 'flex', gap: 6 }}>
          <KindIcon kind={k} className="result-ico" />
          <small>{KIND_LABEL[k]}</small>
        </span>
      ))}
    </div>
  ),
};

export const Maneuvers: StoryObj<typeof KindIcon> = {
  render: () => (
    <div style={grid}>
      {MANEUVERS.map((m) => (
        <span key={m} style={{ alignItems: 'center', display: 'flex', gap: 6 }}>
          <ManeuverIcon type={m} className="nav-ico" />
          <small>{m}</small>
        </span>
      ))}
    </div>
  ),
};
