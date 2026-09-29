import type { Meta, StoryObj } from '@storybook/react-vite';
import { Toast } from '../ui/toast';
import { Screen } from './screen';

const meta: Meta<typeof Toast> = {
  title: 'Toast',
  component: Toast,
  render: (args) => (
    <Screen height={240}>
      <Toast {...args} />
    </Screen>
  ),
};
export default meta;

type Story = StoryObj<typeof Toast>;

export const Message: Story = { args: { message: 'Course charted: 15.4 km, 3 maneuvers' } };

export const WithAction: Story = { args: { message: 'Off course – tap to recalculate', onTap: () => {} } };
