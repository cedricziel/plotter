/// <reference lib="webworker" />
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';
import { CacheExpiration, ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

// ---- app shell ---------------------------------------------------------------
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Take over as soon as installed: a page from an older build never posts
// SKIP_WAITING, and update.ts decides when to reload onto the new worker.
self.addEventListener('install', () => void self.skipWaiting());
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});
clientsClaim();

// ---- PMTiles: cache each HTTP range the client actually requested -------------
// The PMTiles client reads the archive with Range requests (header, directories,
// individual tiles). The Cache API cannot store 206 responses, so each range is
// stored as a 200 under a synthetic key and replayed as a 206. Only ranges the
// user has actually viewed are cached; nothing is prefetched. When you replace
// the archive, give it a new file name (cache is keyed by URL).
const PMTILES_CACHE = 'pmtiles-ranges-v1';
const pmExpiration = new CacheExpiration(PMTILES_CACHE, { maxEntries: 40_000, maxAgeSeconds: 180 * 24 * 3600 });

registerRoute(
  ({ url, request }) => url.pathname.endsWith('.pmtiles') && request.headers.has('range'),
  async ({ request }) => {
    const range = request.headers.get('range')!;
    const keyUrl = new URL(request.url);
    keyUrl.searchParams.set('__range', range);
    const key = keyUrl.href;
    const cache = await caches.open(PMTILES_CACHE);

    const hit = await cache.match(key);
    if (hit) {
      void pmExpiration.updateTimestamp(key);
      return new Response(hit.body, { status: 206, statusText: 'Partial Content', headers: hit.headers });
    }

    const res = await fetch(request);
    if (res.status === 206) {
      const body = await res.clone().arrayBuffer();
      const headers = new Headers();
      for (const h of ['content-type', 'content-range', 'content-length', 'etag', 'last-modified']) {
        const v = res.headers.get(h);
        if (v) headers.set(h, v);
      }
      await cache.put(key, new Response(body, { status: 200, headers }));
      void pmExpiration.updateTimestamp(key).then(() => pmExpiration.expireEntries());
    }
    return res;
  },
);

// The chart manifest names the current archive; keep the last one for offline starts.
registerRoute(
  ({ url }) => url.pathname.endsWith('/tiles/current.json'),
  new NetworkFirst({
    cacheName: 'chart-manifest',
    networkTimeoutSeconds: 3,
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  }),
);

// ---- visited raster tiles & fonts ---------------------------------------------
// OSM (fallback basemap) and OpenSeaMap tiles are cached only as they are viewed:
// no bulk download, per the OSMF tile usage policy.
const tileCache = (cacheName: string, maxEntries: number) =>
  new CacheFirst({
    cacheName,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries, maxAgeSeconds: 30 * 24 * 3600, purgeOnQuotaError: true }),
    ],
  });

registerRoute(({ url }) => url.hostname === 'tile.openstreetmap.org', tileCache('osm-tiles', 4000));
registerRoute(({ url }) => url.hostname === 'tiles.openseamap.org', tileCache('seamark-tiles', 4000));
registerRoute(
  ({ url }) => url.pathname.endsWith('.pbf') && url.pathname.includes('/fonts/'),
  new CacheFirst({
    cacheName: 'glyphs',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 600, maxAgeSeconds: 365 * 24 * 3600 }),
    ],
  }),
);
