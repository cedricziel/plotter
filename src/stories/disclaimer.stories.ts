import type { Meta, StoryObj } from '@storybook/html-vite';
import { showDisclaimerOnce } from '../ui/disclaimer';

const meta: Meta = { title: 'Disclaimer' };
export default meta;

export const Modal: StoryObj = {
  render: () => {
    const host = document.createElement('div');
    showDisclaimerOnce(true);
    const modal = document.querySelector('.modal.disclaimer')!;
    host.append(modal);
    return host;
  },
};
