# Plotter – virtual chartplotter for Dutch inland waters

A mobile-first Progressive Web App that turns a phone or tablet into a simple
chartplotter for the rivers, canals and lakes of the Netherlands. Static files
only – no backend – so it can be hosted on Nextcloud's web server, any static
host, or a Raspberry Pi on board.

> **⚠ Navigation aid only.** Plotter is not a substitute for official charts
> (Rijkswaterstaat / ANWB Wateralmanak & waterkaarten, vaarweginformatie.nl),
> the BPR / Scheepvaartreglement, notices to skippers, or proper seamanship.
> GPS positions, map data and derived values may be wrong, late or missing.
> The app shows this disclaimer once per browser session and keeps a notice on
> screen.

## Features

- **Own ship** from the Geolocation API (`watchPosition`, high accuracy), ship
  symbol rotated by course over ground, accuracy circle, **COG vector** of
  5/10/30 minutes with minute ticks.
- **Instrument bar**: SOG (tap to toggle km/h ↔ knots), COG, position
  (degrees + decimal minutes), clock (24 h), GPS accuracy/status.
- **Waypoints**: long-press the map (right-click on desktop) to drop, tap to
  rename / go-to / delete, drag to move.
- **Routes** from waypoints with per-leg distance & bearing, total distance,
  distance to go, per-waypoint ETA and route ETA from the current SOG; automatic
  waypoint advance within 30 m; *Go to* a single waypoint.
- **Track recording** (start/stop, distance/time filter, survives reloads) and
  GPX export per track.
- **Anchor alarm**: drop at GPS position or map centre, adjustable radius, audio
  + vibration + flashing screen when the boat leaves the circle (debounced and
  GPS-accuracy aware), also alarms on GPS loss; keeps the screen on with the
  Wake Lock API.
- **Day / night palette**; night mode renders everything – chart, overlays and
  UI – in red only, to preserve dark adaptation.
- **Persistence** of waypoints, routes, tracks, anchor watch and settings in
  IndexedDB.
- **GPX 1.1 import/export** of waypoints and routes (tracks too).
- **Offline**: app shell precached by a service worker; chart ranges, OpenSeaMap
  and OSM tiles cached *as you view them*.
- Metric units by default; nautical miles and knots optional.

## Quick start

Requires Node.js ≥ 20.

```sh
npm install
npm run dev        # http://localhost:5173 – add ?sim for a simulated boat on the IJ
npm test           # Vitest: geodesy, ETA, route progress, anchor check, GPX
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ locally (service worker active)
```

`?sim` replaces the GPS with a simulator (≈9 km/h on the IJ in Amsterdam), handy
for trying the app on a desktop.

Without a PMTiles file the app falls back to online OpenStreetMap raster tiles
and says so; put the chart in place as described next.

## Creating the Netherlands PMTiles extract

The basemap is a vector tile archive in [PMTiles](https://docs.protomaps.com/pmtiles/)
format using the [Protomaps basemap](https://docs.protomaps.com/basemaps/downloads)
schema. The style (`src/map/style.ts`) emphasises waterways, canals, locks,
bridges, harbours and marinas.

1. Install the `pmtiles` CLI ([go-pmtiles releases](https://github.com/protomaps/go-pmtiles/releases)):

   ```sh
   # Linux x86_64 example
   curl -LO https://github.com/protomaps/go-pmtiles/releases/download/v1.30.1/go-pmtiles_1.30.1_Linux_x86_64.tar.gz
   tar xzf go-pmtiles_1.30.1_Linux_x86_64.tar.gz
   # macOS: brew install pmtiles
   ```

2. Pick a recent daily planet build from <https://maps.protomaps.com/builds/>
   (file names are `YYYYMMDD.pmtiles`).

3. Extract the Netherlands by bounding box. `extract` only downloads the byte
   ranges it needs, not the whole planet:

   ```sh
   ./pmtiles extract https://build.protomaps.com/20260927.pmtiles \
       public/tiles/netherlands.pmtiles \
       --bbox=3.2,50.7,7.25,53.6 --maxzoom=14
   ```

   | `--maxzoom` | size (NL bbox, 2026 build) | notes |
   |---|---|---|
   | 14 | ≈ 0.8 GB | recommended; MapLibre overzooms for close-ups |
   | 15 | ≈ 1.9 GB | full detail (Protomaps' maximum) |

   For a quick test, extract just a city, e.g. Amsterdam
   `--bbox=4.80,52.33,5.05,52.43 --maxzoom=15` (≈ 25 MB).
   `./pmtiles show public/tiles/netherlands.pmtiles` verifies the result.

4. The app loads `./tiles/netherlands.pmtiles` by default. Change it at build
   time with `VITE_PMTILES_URL=https://…/nl.pmtiles npm run build`, or at run
   time in *Menu → Chart*. A different origin must send CORS headers
   (`Access-Control-Allow-Origin`, and expose `Content-Range`/`ETag`) and
   support HTTP Range requests.

**Updating the chart:** the service worker caches ranges by URL. When you
replace the archive, give it a new name (e.g. `netherlands-2026-09.pmtiles`)
and point the app at it, or use *Menu → Clear cached map tiles*; mixing ranges
from two builds would corrupt the chart.

Label fonts (Noto Sans, Latin ranges, SIL OFL – see `public/fonts/OFL.txt`) are
bundled in `public/fonts`, from [protomaps/basemaps-assets](https://github.com/protomaps/basemaps-assets).

### Overlays and tile usage policy

- **OpenSeaMap seamarks** (`tiles.openseamap.org`) are an optional raster layer
  (toggle with the ⛯ button). They show buoys, locks, bridge clearances and
  more where mapped; they are online-only unless previously viewed.
- **OpenStreetMap standard tiles** are used only as a fallback when no PMTiles
  archive is available. Tiles are fetched only as you pan and are cached for
  30 days; the app **never bulk-prefetches** from `tile.openstreetmap.org`, per
  the [OSMF tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
  For regular use, please build the PMTiles extract.

## Hosting

`npm run build` produces a fully static `dist/` folder with relative paths, so
it works from any sub-directory. Copy the PMTiles file to `dist/tiles/` (it is
not part of the build).

**HTTPS is required**: browsers expose the Geolocation API, service workers
and the Wake Lock API only in secure contexts (`https://` or `localhost`).

Requirements for the web server:

- serve `*.pmtiles` with **HTTP Range** support (Apache, nginx, Caddy do this
  by default for static files);
- `sw.js` must not be cached aggressively (`Cache-Control: no-cache`) so
  updates arrive;
- `.webmanifest` as `application/manifest+json` (usually automatic).

### Nextcloud

Nextcloud's own file shares are not suitable for serving a web app (downloads
are sent as attachments with a restrictive CSP). Instead, let the web server
that already serves Nextcloud – and already has its TLS certificate – serve the
static folder next to it.

Apache (e.g. in the Nextcloud vhost):

```apache
Alias /plotter /var/www/plotter
<Directory /var/www/plotter>
    Require all granted
    Options -Indexes
    <Files "sw.js">
        Header set Cache-Control "no-cache"
    </Files>
</Directory>
```

nginx:

```nginx
location ^~ /plotter/ {
    alias /var/www/plotter/;
    location = /plotter/sw.js { add_header Cache-Control "no-cache"; }
}
```

Then:

```sh
npm run build
rsync -a dist/ server:/var/www/plotter/
rsync -a public/tiles/netherlands.pmtiles server:/var/www/plotter/tiles/
```

and open `https://cloud.example.org/plotter/`. (If you prefer to manage files
through Nextcloud, point the alias at a folder of a Nextcloud *external
storage* / local mount instead; the web server serves the files directly.)

### Docker / TrueNAS (self-building)

`deploy/docker-compose.yml` is a self-contained stack with no image registry
needed:

- `build` (one-shot, `node:22-alpine`): clones `$REF` from GitHub, runs
  `npm test` and `npm run build`, and publishes `dist/` to `/out/www`.
- `tiles` (one-shot, `alpine`): creates the NL PMTiles extract in `/out/tiles`
  on first start and is skipped afterwards (set `FORCE=1` to refresh).
- `web` (`nginx`): serves both on host port **30250** with Range support, CORS
  on `/tiles/` and `no-cache` for `sw.js`. Its healthcheck fetches the app
  shell, a font and a PMTiles range through nginx.

On TrueNAS, create a dataset (e.g. `hive/apps/plotter`), then install the file
as a *Custom App*. nginx workers run as uid 568 (`apps`), which TrueNAS app
datasets grant access to. **Redeploy** (or restart the app) to rebuild from
the latest commit. Put a reverse proxy/tunnel with TLS in front, e.g.
Pangolin/newt with target `http://<host>:30250`; the app needs HTTPS for GPS.

### Any other static host

Upload `dist/` (plus `tiles/`) to Netlify, Cloudflare Pages, GitHub Pages, an
S3 bucket, Caddy (`caddy file-server --root dist`) etc. Mind the host's
file-size limits for the PMTiles archive – you can host it elsewhere (e.g. an
object store with CORS) and set `VITE_PMTILES_URL`.

### Install and go offline

Open the app once online, then *Add to Home Screen*. The app shell is then
available offline. Chart tiles are cached for areas you have viewed – before a
trip, pan along the route at the zoom levels you will need while you still
have a connection.

## Known limitations

- **Screen off = no GPS.** Browsers throttle or stop geolocation and timers
  when the screen is off or the app is in the background. Keep Plotter in the
  foreground with the charger connected; it requests a screen Wake Lock
  (automatically while recording, with the anchor alarm armed, or when *Keep
  screen awake* is on). This matters most for the **anchor alarm**. A native
  wrapper (Capacitor, with background location) is the planned next step.
- Heading is **course over ground** from GPS; no compass / magnetic heading.
- iOS requires a user tap before sound can play; the alarm sound is unlocked
  when you arm the anchor watch (and on the next tap after a reload).
- OpenStreetMap data is not a nautical chart: no depths, fairway limits,
  clearance heights or lock operating times.

## Project layout

```
src/
  core/        pure, tested logic: geodesy & ETA, route progress, anchor check,
               track filter, units, GPX
  map/         MapLibre style (day/night), overlays, long-press handling
  services/    GPS (+ simulator), IndexedDB, wake lock, alarm sound
  ui/          instrument bar, bottom sheets, disclaimer, styles
  app.ts       application state and map wiring
  main.ts      bootstrap
  sw.ts        service worker (Workbox): precache, PMTiles range cache, tile caches
tests/         Vitest suites
public/        icons, fonts, tiles/ (PMTiles goes here, git-ignored)
```

## Roadmap

- **AIS** targets (via SignalK / AIS receiver over WebSocket) with **CPA/TCPA**
  alarms.
- **SignalK / NMEA 0183/2000** integration for depth, wind, heading and log
  (SignalK server on board → WebSocket).
- **Official ENCs**: Inland ENC (IENC) from Rijkswaterstaat, converted to vector
  tiles (S-57 → MVT/PMTiles) with an S-52-inspired style; fairway, depth areas,
  bridge clearances, lock data.
- **Weather overlay** (KNMI / Open-Meteo wind and rain radar).
- Vaarweginformatie (bridge/lock opening times, notices to skippers).
- Native wrapper with **Capacitor** for background GPS and reliable alarms.
- Magnetic heading from the device compass; north-up / course-up toggle.
- Offline area download for the PMTiles archive (user-selected region, not
  for OSM tiles).
