import { expect, test } from '@playwright/test';

const WIDTH = 360;
const STORIES = [
  'navigation-instruments--phone-small',
  'navigation-instruments--phone-small-stale',
  'sheets-route--phone-small',
];

test.use({ viewport: { width: WIDTH, height: 740 } });

for (const id of STORIES) {
  for (const language of ['en', 'de']) {
    for (const theme of ['day', 'night']) {
      test(`${id} fits ${WIDTH} px in ${language}, ${theme}`, async ({ page }) => {
        await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=language:${language};theme:${theme}`);
        await page.locator('#storybook-root > *').first().waitFor();
        await page.evaluate(() => document.fonts.ready);

        const overflowing = await page.evaluate((width) => {
          const root = document.querySelector('#storybook-root')!;
          return [...root.querySelectorAll('*')]
            .map((el) => ({ el, right: el.getBoundingClientRect().right }))
            .filter(({ right }) => right > width + 0.5)
            .map(({ el, right }) => `${el.tagName.toLowerCase()}.${el.className} right=${right.toFixed(1)}`);
        }, WIDTH);

        expect(overflowing).toEqual([]);
      });
    }
  }
}
