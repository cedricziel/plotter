// @vitest-environment happy-dom
import { composeStories } from '@storybook/react-vite';
import { cleanup, render } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

type StoryModule = Parameters<typeof composeStories>[0];

const modules = import.meta.glob<StoryModule>('../src/**/*.stories.tsx', { eager: true });

afterEach(cleanup);

describe('stories', () => {
  it('finds story files', () => {
    expect(Object.keys(modules).length).toBeGreaterThan(0);
  });

  for (const [file, mod] of Object.entries(modules)) {
    describe(file, () => {
      for (const [name, Story] of Object.entries(composeStories(mod)) as [string, ComponentType][]) {
        it(`renders ${name}`, () => {
          const { container } = render(<Story />);
          expect(document.body.textContent?.trim() || container.innerHTML).toBeTruthy();
        });
      }
    });
  }
});
