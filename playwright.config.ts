import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const cloudChromium = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: 'tests/layout',
  use: {
    baseURL: 'http://localhost:6007',
    launchOptions: existsSync(cloudChromium) ? { executablePath: cloudChromium } : {},
  },
  webServer: {
    command: 'npx vite preview --outDir storybook-static --port 6007 --strictPort',
    url: 'http://localhost:6007/iframe.html',
    reuseExistingServer: true,
  },
});
