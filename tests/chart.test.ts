import { describe, expect, it } from 'vitest';
import { chartUrlFrom, DEFAULT_CHART_URL } from '../src/services/chart';

describe('chartUrlFrom', () => {
  const cur = { url: './tiles/netherlands-2026-09-01.pmtiles' };

  it('follows the manifest for the default URL', () => {
    expect(chartUrlFrom(DEFAULT_CHART_URL, cur)).toBe(cur.url);
  });

  it('keeps a user-entered URL', () => {
    expect(chartUrlFrom('https://example.org/x.pmtiles', cur)).toBe('https://example.org/x.pmtiles');
  });

  it('falls back when the manifest is missing or unsafe', () => {
    expect(chartUrlFrom(DEFAULT_CHART_URL, null)).toBe(DEFAULT_CHART_URL);
    expect(chartUrlFrom(DEFAULT_CHART_URL, {})).toBe(DEFAULT_CHART_URL);
    expect(chartUrlFrom(DEFAULT_CHART_URL, { url: 'https://evil.example/x.pmtiles' })).toBe(DEFAULT_CHART_URL);
    expect(chartUrlFrom(DEFAULT_CHART_URL, { url: './tiles/../x.pmtiles' })).toBe(DEFAULT_CHART_URL);
    expect(chartUrlFrom(DEFAULT_CHART_URL, { url: 7 })).toBe(DEFAULT_CHART_URL);
  });
});
