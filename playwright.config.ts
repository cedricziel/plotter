import { existsSync } from 'node:fs';
import { chromium, defineConfig } from '@playwright/test';

const PORT = 6007;

// Cloud sessions ship one Chromium at /opt/pw-browsers that may not match this Playwright version.
const preinstalled = '/opt/pw-browsers/chromium';
const executablePath = !existsSync(chromium.executablePath()) && existsSync(preinstalled) ? preinstalled : undefined;

export default defineConfig({
  testDir: 'tests/layout',
  fullyParallel: true,
  workers: process.env.CI ? 4 : undefined,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: 'chromium',
    launchOptions: { executablePath },
  },
  webServer: {
    command: `npx vite preview --outDir storybook-static --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/index.json`,
    reuseExistingServer: !process.env.CI,
  },
});
