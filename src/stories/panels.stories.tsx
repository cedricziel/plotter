import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import {
  AnchorPanel,
  RoutePanel,
  SettingsPanel,
  TrackPanel,
  WaypointPanel,
  type AnchorApp,
  type RouteApp,
  type SettingsApp,
  type TrackApp,
  type WaypointApp,
} from '../ui/panels/bodies';
import { ACTIVE_ROUTE, makeFix, makePanelApp } from './fakes';

const Sheet = ({ title, children }: { title: string; children: ReactNode }) => (
  <section id="sheet" className="open">
    <div className="sheet-head">
      <h2>{title}</h2>
      <button className="icon-btn" aria-label="Close">
        ✕
      </button>
    </div>
    <div className="sheet-body">{children}</div>
  </section>
);

const meta: Meta = { title: 'Sheets' };
export default meta;

type Story = StoryObj;

export const RouteEmpty: Story = {
  render: () => (
    <Sheet title="Route & waypoints">
      <RoutePanel app={makePanelApp({ waypoints: new Map(), routes: new Map() }) as unknown as RouteApp} />
    </Sheet>
  ),
};

export const RouteActive: Story = {
  render: () => (
    <Sheet title="Route & waypoints">
      <RoutePanel
        app={
          makePanelApp({
            activeRoute: ACTIVE_ROUTE,
            progress: { nextIndex: 1, dtw: 1250, btw: 84, remaining: 15400, ttg: 3600, ttgNext: 900, xte: 12, vmg: 2.1, steer: 12, finished: false },
          }) as unknown as RouteApp
        }
      />
    </Sheet>
  ),
};

export const Waypoint: Story = {
  render: () => (
    <Sheet title="Marina Muiderzand">
      <WaypointPanel app={makePanelApp() as unknown as WaypointApp} id="a" />
    </Sheet>
  ),
};

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

export const TrackIdle: Story = {
  render: () => (
    <Sheet title="Track recording">
      <TrackPanel app={makePanelApp({ tracks: new Map([['t1', track()]]) }) as unknown as TrackApp} />
    </Sheet>
  ),
};

const live = track({ id: 't2', name: 'Now', ended: undefined });
export const TrackRecording: Story = {
  render: () => (
    <Sheet title="Track recording">
      <TrackPanel
        app={makePanelApp({ recording: live, tracks: new Map([['t2', live], ['t1', track()]]) }) as unknown as TrackApp}
      />
    </Sheet>
  ),
};

const anchor = (armed: boolean) => ({ lat: 52.3731, lon: 4.8922, radius: 40, armed });

export const AnchorDisarmed: Story = {
  render: () => (
    <Sheet title="Anchor alarm">
      <AnchorPanel app={makePanelApp({ anchor: anchor(false) }) as unknown as AnchorApp} />
    </Sheet>
  ),
};

export const AnchorArmed: Story = {
  render: () => (
    <Sheet title="Anchor alarm">
      <AnchorPanel
        app={
          makePanelApp({ anchor: anchor(true), anchorCheck: { state: 'ok', distance: 12 }, fix: makeFix() }) as unknown as AnchorApp
        }
      />
    </Sheet>
  ),
};

export const Settings: Story = {
  render: () => (
    <Sheet title="Settings">
      <SettingsPanel app={makePanelApp() as unknown as SettingsApp} telemetry={{ enabled: () => true, set() {} }} version="1.0.0 (storybook)" />
    </Sheet>
  ),
};
