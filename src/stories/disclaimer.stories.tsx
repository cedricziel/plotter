import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { Disclaimer, showDisclaimerOnce } from '../ui/disclaimer';

const meta: Meta = { title: 'Disclaimer' };
export default meta;

export const Modal: StoryObj = {
  render: () => {
    useEffect(() => showDisclaimerOnce(true), []);
    return <Disclaimer />;
  },
};
