import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Place } from '../core/waterway-data';
import { DestinationCard } from '../ui/destination';
import { makeCardApp } from './fakes';
import { Screen } from './screen';

const card = (place: Place) => () => (
  <Screen>
    <div id="dest-bar">
      <DestinationCard app={makeCardApp()} place={place} chart={async () => {}} />
    </div>
  </Screen>
);

const meta: Meta<typeof DestinationCard> = { title: 'Destination card', component: DestinationCard };
export default meta;

type Story = StoryObj;

export const MarinaWithFullInfo: Story = {
  render: card({
    name: 'Jachthaven Aalsmeer',
    kind: 'marina',
    lat: 52.26,
    lon: 4.75,
    info: {
      vhf: '31',
      phone: '+31 20 123 4567',
      website: 'https://www.jachthavenaalsmeer.example/visitors',
      berths: 240,
      openingHours: 'Harbour master: 08:00-18:00 daily',
      operator: 'Watersportvereniging Aalsmeer',
    },
  }),
};

export const OpeningBridgeFromVaarweginformatie: Story = {
  render: card({
    name: 'Schellingwouderbrug',
    kind: 'bridge',
    lat: 52.38,
    lon: 4.99,
    info: {
      source: 'vaarweginformatie',
      canOpen: true,
      clearance: 2.9,
      width: 11.5,
      vhf: '18',
      openingHours:
        'Opens on request, weekdays 06:00-22:00\nNo openings during the morning and evening rush hours (07:00-09:00 and 16:00-18:00)\nSaturdays and Sundays 09:00-19:00; call ahead on VHF channel 18 or by phone',
    },
  }),
};

export const TownWithoutInfo: Story = {
  render: card({ name: 'Weesp', kind: 'town', lat: 52.3, lon: 5.04 }),
};

export const VeryLongName: Story = {
  render: card({
    name: 'Jachthaven en Watersportvereniging De Twee Gebroeders Amsterdam-Noord aan het Noordzeekanaal',
    kind: 'marina',
    lat: 52.4,
    lon: 4.9,
    info: { vhf: '9', berths: 12 },
  }),
};

export const GermanOpeningBridge: Story = {
  globals: { language: 'de' },
  render: card({
    name: 'Schellingwouderbrug',
    kind: 'bridge',
    lat: 52.38,
    lon: 4.99,
    info: {
      source: 'vaarweginformatie',
      canOpen: true,
      clearance: 2.9,
      width: 11.5,
      vhf: '18',
      openingHours:
        'Bediening op verzoek, werkdagen 06:00-22:00\nGeen bediening tijdens de spits (07:00-09:00 en 16:00-18:00)',
    },
  }),
};
