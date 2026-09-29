import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('../src/services/db', () => ({
  getKv: async (key: string) => store.get(key),
  setKv: async (key: string, value: unknown) => void store.set(key, value),
}));

const { DEFAULT_SETTINGS, loadSettings, saveSettings } = await import('../src/settings');

describe('settings', () => {
  beforeEach(() => store.clear());

  it('shows the vector seamarks and hides the online overlays by default', async () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      seamarks: true,
      openseamap: false,
    });
    expect(await loadSettings()).toMatchObject({
      seamarks: true,
      openseamap: false,
    });
  });

  it('keeps the online overlay choices across a reload', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, openseamap: true });
    expect(await loadSettings()).toMatchObject({
      openseamap: true,
    });
  });

  it('gives settings stored before the overlays existed their defaults', async () => {
    store.set('settings', { theme: 'night', seamarks: false });
    expect(await loadSettings()).toMatchObject({
      theme: 'night',
      seamarks: false,
      openseamap: false,
    });
  });
});
