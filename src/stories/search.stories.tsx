import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ApiSearchResult } from '../core/api';
import { SearchBox, seedSearch, type ScopeName } from '../ui/search';
import { makeSearchApp } from './fakes';
import { Device, type DeviceName } from './device';

const SCOPE: ScopeName = 'sheet';

const RESULTS: ApiSearchResult[] = [
  {
    name: 'Jachthaven Aalsmeer',
    kind: 'marina',
    lat: 52.26,
    lon: 4.75,
    distance: 14200,
  },
  {
    name: 'Schellingwouderbrug',
    kind: 'bridge',
    lat: 52.38,
    lon: 4.99,
    distance: 6100,
  },
  { name: 'Oranjesluizen', kind: 'lock', lat: 52.38, lon: 4.96 },
  { name: 'Weesp', kind: 'town', lat: 52.3, lon: 5.04, distance: 18900 },
];

const box =
  (state: Parameters<typeof seedSearch>[1]) =>
  (device: DeviceName = 'phone-portrait') => {
    seedSearch(SCOPE, state);
    return (
      <Device device={device}>
        <div id="sheet" className="open">
          <div className="sheet-body">
            <SearchBox app={makeSearchApp()} scope={SCOPE} onPick={() => {}} />
          </div>
        </div>
      </Device>
    );
  };

const meta: Meta<typeof SearchBox> = { title: 'Search', component: SearchBox };
export default meta;

type Story = StoryObj;

export const Empty: Story = { render: () => box({})() };

export const RecentDestinations: Story = {
  render: () => box({ heading: 'Recent destinations', rows: RESULTS.slice(0, 3) })(),
};

const results = box({ query: 'aal', rows: RESULTS });

export const Results: Story = { render: () => results() };

export const Searching: Story = {
  render: () => box({ query: 'aalsm', note: 'Searching…' })(),
};

export const ServiceUnreachable: Story = {
  render: () =>
    box({
      query: 'aalsm',
      rows: RESULTS.slice(0, 1),
      note: 'Search service not reachable – showing saved places',
    })(),
};

export const PhoneLandscape: Story = { render: () => results('phone-landscape') };

export const TabletPortrait: Story = { render: () => results('tablet-portrait') };

export const TabletLandscape: Story = { render: () => results('tablet-landscape') };
