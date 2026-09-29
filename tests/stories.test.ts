// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

interface Story {
  args?: Record<string, unknown>;
  render?: (args: Record<string, unknown>, context: never) => Node | string;
}
interface StoryModule {
  default: Story & { title: string };
  [name: string]: unknown;
}

const modules = import.meta.glob<StoryModule>('../src/**/*.stories.ts', {
  eager: true,
});

describe('stories', () => {
  it('finds story files', () => {
    expect(Object.keys(modules).length).toBeGreaterThan(0);
  });

  for (const [file, mod] of Object.entries(modules)) {
    const { default: meta, ...exports } = mod;
    describe(file, () => {
      for (const [name, story] of Object.entries(exports as Record<string, Story>)) {
        it(`renders ${name}`, () => {
          const render = story.render ?? meta.render;
          expect(render).toBeTypeOf('function');
          const out = render!({ ...meta.args, ...story.args }, {} as never);
          const host = document.createElement('div');
          host.append(out);
          expect(host.childNodes.length).toBeGreaterThan(0);
        });
      }
    });
  }
});
