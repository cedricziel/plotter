export const DEFAULT_CHART_URL = './tiles/netherlands.pmtiles';
export const CHART_MANIFEST_URL = './tiles/current.json';

/**
 * The chart job publishes each extract under a new file name and points
 * tiles/current.json at it, so clients never mix cached ranges of two builds.
 * Only the default URL follows the manifest; a URL the user entered is kept.
 */
export function chartUrlFrom(configured: string, manifest: unknown): string {
  if (configured !== DEFAULT_CHART_URL) return configured;
  const url = (manifest as { url?: unknown } | null)?.url;
  return typeof url === 'string' && /^\.\/tiles\/[\w.-]+\.pmtiles$/.test(url) ? url : configured;
}

export async function resolveChartUrl(configured: string): Promise<string> {
  if (configured !== DEFAULT_CHART_URL) return configured;
  try {
    const res = await fetch(CHART_MANIFEST_URL, { cache: 'no-cache' });
    return res.ok ? chartUrlFrom(configured, await res.json()) : configured;
  } catch {
    return configured;
  }
}
