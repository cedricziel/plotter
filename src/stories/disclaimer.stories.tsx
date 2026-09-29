import type { Meta, StoryObj } from '@storybook/react-vite';
import { Disclaimer } from '../ui/disclaimer';
import { Screen } from './screen';

const meta: Meta<typeof Disclaimer> = { title: 'Disclaimer', component: Disclaimer };
export default meta;

export const Modal: StoryObj<typeof Disclaimer> = {
  render: () => (
    <Screen>
      <Disclaimer open />
    </Screen>
  ),
};

export const German: StoryObj<typeof Disclaimer> = {
  globals: { language: 'de' },
  render: () => (
    <Screen>
      <Disclaimer open />
    </Screen>
  ),
};
