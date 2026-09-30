// @vitest-environment happy-dom
import { composeStories } from '@storybook/react-vite';
import { cleanup, render } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import preview from '../.storybook/preview';
import { setLanguage, type Language } from '../src/i18n';

type StoryModule = Parameters<typeof composeStories>[0];
type Composed = ComponentType & { globals?: Record<string, unknown> };

const modules = import.meta.glob<StoryModule>('../src/**/*.stories.tsx', { eager: true });

/** The stories of a file as Storybook renders them, with the toolbar's language set to `language`. */
const compose = (mod: StoryModule, language: Language) =>
  Object.entries(composeStories(mod, { ...preview, initialGlobals: { ...preview.initialGlobals, language } })) as [
    string,
    Composed,
  ][];

afterEach(cleanup);
afterAll(() => setLanguage('en'));

describe('stories', () => {
  it('finds story files', () => {
    expect(Object.keys(modules).length).toBeGreaterThan(0);
  });

  for (const language of ['en', 'de'] as const) {
    for (const [file, mod] of Object.entries(modules)) {
      describe(`${file} in ${language}`, () => {
        for (const [name, Story] of compose(mod, language)) {
          it(`renders ${name}`, () => {
            const { container } = render(<Story />);
            expect(document.body.textContent?.trim() || container.innerHTML).toBeTruthy();
            expect(document.documentElement.lang).toBe(Story.globals?.language ?? language);
          });
        }
      });
    }
  }

  it('renders a story in the language the toolbar picks', () => {
    const mod = modules['../src/stories/instruments.stories.tsx'];
    const story = (language: Language) => Object.fromEntries(compose(mod, language)).GoodFix;
    const Story = story('de');
    render(<Story />);
    expect(document.querySelector('#btn-menu')!.getAttribute('aria-label')).toBe('Menü');
    cleanup();
    const English = story('en');
    render(<English />);
    expect(document.querySelector('#btn-menu')!.getAttribute('aria-label')).toBe('Menu');
  });

  it('keeps a German story German whatever the toolbar says', () => {
    const German = Object.fromEntries(compose(modules['../src/stories/guidance.stories.tsx'], 'en')).GermanOffCourse;
    render(<German />);
    expect(document.querySelector('.nav-off')!.textContent).toBe('Vom Kurs abgekommen — Neu berechnen');
  });
});
