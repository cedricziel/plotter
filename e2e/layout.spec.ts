import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { KNOWN_OVERFLOWS } from './known-overflows';

interface IndexEntry {
  type: 'story' | 'docs';
  id: string;
}

const index = JSON.parse(readFileSync('storybook-static/index.json', 'utf8')) as {
  entries: Record<string, IndexEntry>;
};
const stories = Object.values(index.entries).filter((entry) => entry.type === 'story');

const VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
];
const THEMES = ['day', 'night'] as const;
const LANGUAGES = ['en', 'de'] as const;

interface Overflow {
  kind: 'past-viewport' | 'too-wide';
  element: string;
  detail: string;
  /** Indexes into KNOWN_OVERFLOWS whose selector matches the element. */
  matches: number[];
}

/**
 * Runs in the page. Reports the outermost elements whose box sticks out past the viewport's left or right edge, and
 * the innermost elements whose content is wider than their box although they neither scroll nor ellipsize.
 */
function findOverflows(selectors: string[]): Overflow[] {
  const vw = document.documentElement.clientWidth;
  const SLACK = 1;
  const describe = (el: Element) => {
    const path: string[] = [];
    for (let e: Element | null = el; e && e !== document.body && path.length < 4; e = e.parentElement) {
      const id = e.id ? `#${e.id}` : '';
      const classes = [...e.classList].map((c) => `.${c}`).join('');
      path.unshift(`${e.tagName.toLowerCase()}${id}${classes}`);
    }
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${path.join(' > ')}${text ? ` "${text}"` : ''}`;
  };
  const matches = (el: Element) => selectors.flatMap((s, i) => (el.matches(s) ? [i] : []));
  const scrolls = (style: CSSStyleDeclaration) => style.overflowX === 'auto' || style.overflowX === 'scroll';
  const inScroller = (el: Element) => {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      if (scrolls(getComputedStyle(e))) return true;
    }
    return false;
  };
  const pastViewport = (el: Element) => {
    const r = el.getBoundingClientRect();
    if ((r.width === 0 && r.height === 0) || getComputedStyle(el).visibility === 'hidden') return false;
    return r.right > vw + SLACK || r.left < -SLACK;
  };

  // Shapes inside an SVG are drawing, clipped by the SVG; the SVG's own box is checked.
  const elements = [...document.body.querySelectorAll('*')].filter((el) => !el.parentElement?.closest('svg'));
  const found: Overflow[] = [];
  for (const el of elements) {
    if (pastViewport(el) && !(el.parentElement && pastViewport(el.parentElement)) && !inScroller(el)) {
      const r = el.getBoundingClientRect();
      found.push({
        kind: 'past-viewport',
        element: describe(el),
        detail: `spans ${Math.round(r.left)}..${Math.round(r.right)} in a ${vw} px viewport`,
        matches: matches(el),
      });
    }
  }

  const tooWide = [document.documentElement, document.body, ...elements].filter((el): el is HTMLElement => {
    if (!(el instanceof HTMLElement) || el.clientWidth === 0 || el.matches('input, textarea, select')) return false;
    const style = getComputedStyle(el);
    return !scrolls(style) && style.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + SLACK;
  });
  // Content that is too wide makes its ancestors too wide as well; the innermost element is the one to fix.
  for (const el of tooWide) {
    if (!tooWide.some((other) => other !== el && el.contains(other))) {
      found.push({
        kind: 'too-wide',
        element: describe(el),
        detail: `content ${el.scrollWidth} px wide in a ${el.clientWidth} px box`,
        matches: matches(el),
      });
    }
  }
  return found;
}

const settle = (page: Page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

for (const story of stories) {
  for (const theme of THEMES) {
    for (const language of LANGUAGES) {
      test(`${story.id} ${theme} ${language}`, async ({ page }) => {
        await page.setViewportSize(VIEWPORTS[0]);
        await page.goto(
          `/iframe.html?id=${story.id}&viewMode=story&globals=theme:${theme};language:${language};frame:viewport`,
        );
        await page.locator('#storybook-root > *').first().waitFor();
        await page.evaluate(() => document.fonts.ready);

        const unexpected: string[] = [];
        for (const viewport of VIEWPORTS) {
          await page.setViewportSize(viewport);
          await settle(page);
          const overflows = await page.evaluate(
            findOverflows,
            KNOWN_OVERFLOWS.map((known) => known.selector),
          );
          for (const overflow of overflows) {
            const known = overflow.matches.some((i) => KNOWN_OVERFLOWS[i].widths?.includes(viewport.width) ?? true);
            if (!known)
              unexpected.push(`${viewport.width} px ${overflow.kind}: ${overflow.element} ${overflow.detail}`);
          }
        }
        expect(unexpected, 'elements overflow horizontally; exceptions live in e2e/known-overflows.ts').toEqual([]);
      });
    }
  }
}
