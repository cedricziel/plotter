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
- **Search and charted courses**: search harbours, marinas, locks, towns and
  waterways (offline-tolerant, diacritic-insensitive, ranked by kind and
  distance), pick one and **Chart course**: the route follows the water, with
  locks, opening and fixed bridges (clearance where mapped) and turns listed as
  maneuvers. Details in [Search, routing and offline corridors](#search-routing-and-offline-corridors).
- **Turn-by-turn** in the guidance strip (next maneuver, distance to it,
  steering cue, cross-track error against the course line), **off-course
  detection** with recalculation, optional **voice prompts**, and a **vessel
  profile** (air draft, draft, beam) the router respects.
- **Save for offline**: a charted course can be saved with its map tiles and the
  routing graph around it, so search fallbacks and rerouting keep working
  without a connection.
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

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev        # http://localhost:5173 – add ?sim for a simulated boat on the IJ
npm test           # Vitest: geodesy, ETA, route progress, anchor check, GPX
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ locally (service worker active)
npm run test:layout  # Playwright: every Storybook story, checked for horizontal overflow
```

`npm run test:layout` builds Storybook and opens every story from its
`index.json` in Chromium at 360, 390, 820 and 1180 px wide, in day and night
themes and in English and German. A story fails when an element runs past the
viewport's edge, or when an element's content is wider than its box although it
neither scrolls nor ends in an ellipsis. Accepted overflows are listed, each with
a reason, in `e2e/known-overflows.ts`; remove an entry once its overflow is
fixed. Run `npx playwright install chromium` once before the first run.

Search and course charting need the API server (`server/`) and its data; the
map, GPS, waypoints, tracks and the anchor alarm work without it, and *Chart
course* says so and falls back to a straight line. To run everything locally:

```sh
npm run build:server                       # bundles server/ and the data builder into server-dist/
# waterway data from an OSM extract (needs osmium-tool), see "Routing data" below:
osmium tags-filter nl.osm.pbf w/waterway=river,canal,fairway w/bridge w/seamark:type=bridge \
    n/seamark:type=bridge n/waterway=lock_gate w/lock=yes nw/leisure=marina nw/harbour \
    nw/seamark:type=harbour nw/mooring n/place=city,town,village -o filtered.osm.pbf
osmium add-locations-to-ways --ignore-missing-nodes -f opl filtered.osm.pbf \
    | node server-dist/waterways.mjs --out data --source nl.osm.pbf
DATA_DIR=data TILES_DIR=public/tiles npm run serve   # API on :8080
npm run dev                                          # proxies /api to :8080 (API_PROXY=… to change)
```

`?sim` replaces the GPS with a simulator (≈9 km/h on the IJ in Amsterdam), handy
for trying the app on a desktop.

Without a PMTiles file the app falls back to online OpenStreetMap raster tiles
and says so; put the chart in place as described next.

## How to navigate to a destination

1. Open **Route** and type in the search field (or tap **⚑+** and search there).
   Results are big rows with kind, name and straight-line distance; with an empty
   field you get your recent destinations.
2. Tap a result: the map flies there and a card offers **Chart course** (along the
   water), **Go straight here** and **Add as stop**. **Chart course** is also on
   the crosshair bar (pan the map under the crosshair) and in the waypoint sheet.
   A town, city or village has no water of its own, so the course ends at its
   harbour, marina or mooring within 2 km when there is one on the waterways.
3. The strip under the instruments counts down to the next maneuver ("In 1.2 km –
   Turn left into Zaan"), with the steering cue, DTW, BTW, cross-track error and
   ETA. The Route sheet lists every maneuver with its distance and the warnings
   (for example "3 fixed bridges with unknown clearance").
4. Far off the line for 20 s the strip shows **Off course – Recalculate** (also a
   toast to tap); after 60 s off course it recalculates once by itself.
5. **Save for offline** (Route sheet) asks how much it is, downloads the map
   tiles and stores the routing graph around the course; **Saved offline** lists
   the trips with their size.
6. **Stop navigation** with **✕** on the strip or in the Route sheet.

Without a connection the search offers recent destinations, saved waypoints and
the places of saved trips, and *Chart course* reroutes inside a saved corridor.
Without any of that it says why and goes straight there. Holding a finger on the map still drops a
waypoint; a single tap does nothing.

Menu → **Vessel & routing**: air draft, draft and beam in metres (empty =
unknown), the cruise speed used for the ETA while the boat is not moving, and
optional voice prompts (spoken about 500 m and 100 m before a maneuver, and when
off course; off by default).

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

## Search, routing and offline corridors

```
                 OSM extract ──► plotter-waterways job ──► data/ (graph + places JSON)
                                                              │ read by
 PWA ── /api/search /api/route /api/corridor ──► nginx ──► plotter-server (in memory)
  │                                                                   
  └── IndexedDB: recent destinations, saved corridors (graph + places), trips
      service worker: PMTiles ranges of the saved corridors
```

The phone never downloads the routing network. It asks the small API server for
what it needs and keeps only what you save.

### Routing data (`tools/waterways/`, `deploy/waterways.sh`)

OpenStreetMap only: `waterway=river|canal|fairway` lines (the fairway lines are
what crosses IJmeer, Markermeer, Gooimeer, …), without `tunnel=culvert`,
`boat=no` (unless `motorboat=yes`) and `motorboat=no`. The graph is built from
shared OSM node ids and contracted: vertices only at junctions, way ends and
where the tags change; each edge keeps its polyline, class (fairway / river /
canal, CEMT), oneway and `maxdraught` / `maxwidth` / `maxheight`. Only the
largest connected component and components over 1 km are kept.

Obstacles sit on the edges with their position:

- **locks**: `lock=yes` chamber ways and `waterway=lock_gate` nodes, clustered per
  lock. Chambers are often mapped beside the fairway line, so every edge that
  passes a chamber or gate carries the lock;
- **bridges**: `bridge=*` highway, railway and footway ways that cross a
  navigable edge, plus the RWS-derived `seamark:type=bridge` nodes, which is where
  the clearance mostly comes from (`seamark:bridge:clearance_height`,
  `…_closed`; `maxheight:physical`/`clearance` on the way when present). A road's
  own `maxheight` is kept separately (`roadMaxheight`) and never blocks a boat.
  `bridge=movable`, `bridge:movable=*` and the seamark categories mark a bridge
  as opening.

`places-<date>.json` is the search index: harbours, marinas, moorings (named),
locks, named bridges over the waterways, cities/towns/villages and one entry per
named waterway, deduplicated per name and kind within 300 m.
`current.json` is written last (atomic rename), so the server never sees a half
written dataset.

The job (`plotter-waterways` in the server image) downloads the extract
(`OSM_PBF_URL`, default the openstreetmap.fr Netherlands extract; geofabrik works
from the server), filters it with `osmium tags-filter`, builds, publishes, and
skips itself while `current.json` is younger than `MAX_AGE_DAYS` (30) unless
`FORCE=1`.

#### Full Netherlands build (measured)

Input `netherlands-latest.osm.pbf` (openstreetmap.fr, 1.63 GB). The whole job
(`osmium tags-filter`, `add-locations-to-ways`, builder) took **64 s** on a 4-core
sandbox (the builder itself 4.5 s), peak container memory **1.9 GiB**.

| output | raw | gzip |
|---|---|---|
| `waterways-<date>.json` | 3.06 MB | 1.13 MB |
| `places-<date>.json` | 1.21 MB | 0.26 MB |

22,339 vertices and 23,655 edges (15,657 km of waterway); 3,355 connected
components of which the largest plus those over 1 km are kept (2,593 dropped).
Excluded ways: 3,973 culverts, 441 `boat=no`, 425 `motorboat=no`. Obstacles: 1,643
lock entries (a lock appears on every edge that passes it), 13,675 bridges of
which 11,831 fixed and 1,844 opening; 4,514 of the bridges come from RWS
`seamark:type=bridge` nodes. **Clearance is known for 3,487 bridges (25 %)**;
76 bridges only have a road `maxheight`, which is kept apart and never used to
block. 8,525 named bridges, 3,548 waterways, 974 marinas, 142 harbours, 640
moorings, 437 locks and 2,691 cities, towns and villages are searchable
(16,957 places).


### Cost model

Cost = length × class factor (fairway, river, CEMT IV and up: 1.0; CEMT II–III:
1.15; CEMT 0–I or an untagged canal: 1.5) + 10 min at the cruise speed per lock
+ 5 min per opening bridge. That keeps routes on fairways and big canals: IJ →
Hoorn goes through the Oranjesluizen and across the IJmeer/Markermeer instead of
the Broekervaart, IJ → Muiden across the IJmeer instead of the Muidertrekvaart.
Start and destination snap to the nearest point on an edge of the largest
component and the snap distance is reported.

Vessel profile: a fixed bridge with a known clearance below the air draft, an
edge with a lower `maxheight`, `maxdraught` below the draft or `maxwidth` below
the beam is blocked; if that leaves no route you are told so. An unknown
clearance never blocks, but with an air draft set the course warns "N fixed
bridges with unknown clearance".

### API (`server/`)

JSON over HTTP, gzip, validated and clamped to the Netherlands, with a per-client
rate limit (search 120/min, route 30/min, corridor 6/min; behind nginx the real
client comes from `X-Forwarded-For`).

| endpoint | |
|---|---|
| `GET /api/health`, `GET /api/meta` | liveness; data version, built date, counts |
| `GET /api/search?q=&near=lat,lon&limit=` | ranked places: exact name, name prefix, word prefix; then kind (harbour, marina, lock, town, waterway, bridge), then distance |
| `POST /api/route` `{from, to, toKind?, via?, vessel?, speed?}` | `{distance, duration, polyline (precision 6), maneuvers, warnings, snap, end?}`; 404 unreachable or nothing fits the vessel, 422 outside the network |
| `POST /api/corridor` `{polyline, bufferMeters=1000 (≤5000), minZoom=8, maxZoom=14}` | `{tiles, tileCount, estimatedBytes, graph, places}`: the tiles covering the buffered course (capped, 422 when too many), their size read from the PMTiles directory, and the routing subgraph and places inside the buffer |

The server reloads `current.json` every 10 minutes and swaps the data without a
restart; without data it answers 503 "Routing data not available yet".

### Offline corridors

*Save for offline* posts the course to `/api/corridor`, asks you to confirm the
tile count and size, then reads the tiles through the PMTiles client so the
service worker caches the ranges, and stores the subgraph and places in
IndexedDB. Rerouting (off course, recalculate, chart course) tries the server
first and, when it cannot be reached, routes on the saved subgraph if start and
destination lie inside it. Cached tile ranges expire with the service worker's
normal 180-day limit; *Menu → Clear cached map tiles* drops them at once.

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

### Docker / TrueNAS

Two images are built by `.github/workflows/docker.yml` (`linux/amd64` and
`linux/arm64`, tests run inside the builds): **`ghcr.io/cedricziel/plotter`**
(nginx + the built app, the `web` target) and **`ghcr.io/cedricziel/plotter-server`**
(the API server and the waterway data job, the `server` target: Debian slim with
`osmium-tool`, because Alpine has no package for it). Tags: `latest` (default branch), `main` / the sanitised branch name
(e.g. `claude-virtual-chartplotter-pwa-ggfvjo`), `sha-<short>`, and `v1.2.3`,
`1.2` for release tags. Pull requests build without pushing.

`deploy/docker-compose.yml` is the stack used on the TrueNAS host "hive" (also
fine with plain `docker compose up -d`):

- `tiles` (one-shot, same image, entrypoint `plotter-tiles`): extracts the NL
  PMTiles chart into `/mnt/hive/apps/plotter/tiles` as
  `netherlands-<build>.pmtiles` plus `current.json` (the app follows it, so a
  refreshed chart gets a new URL and clients never mix cached ranges). It exits
  immediately when a chart exists; run it with `FORCE=1` to refresh and it
  removes older files after publishing.
- `waterways` (one-shot, `plotter-server` image, entrypoint `plotter-waterways`,
  run as root so it can chown to 568): builds the routing graph and place index
  into `/mnt/hive/apps/plotter/data`. The first run downloads about 1.6 GB and
  takes a few minutes (`OSM_PBF_URL` selects the source); later runs exit at once
  while the data is younger than 30 days (`FORCE=1` rebuilds).
- `server`: the API on port 8080 inside the stack, data and tiles mounted
  read-only, healthcheck on `/api/health`, restarts unless stopped. It starts
  without data and picks it up when the job has published it.
- `web`: nginx on host port **30250**, waits for `tiles` (not for the server or
  the data: `/api/` answers 502 until the server is up and the app copes),
  proxies `/api/` to `server`, mounts the tiles
  directory read-only at `/srv/tiles`; Range support, CORS on `/tiles/`,
  `no-cache` for `sw.js`, `index.html` and `current.json`. Workers run as uid
  568 (`apps`), the only uid the TrueNAS dataset ACL grants access to. The
  image healthcheck fetches the app shell and a bundled font (tiles may be
  absent, so they are not checked).

Set `PLOTTER_TAG` to pin a version (default `latest`); redeploy/pull to update.
**The GHCR package must be public** (GitHub -> Packages -> plotter -> Package
settings -> Change visibility), otherwise the host needs registry credentials
(`docker login ghcr.io` with a token that has `read:packages`). On TrueNAS,
create the dataset (e.g. `hive/apps/plotter`) and install the compose file as a
*Custom App*. Put a reverse proxy/tunnel with TLS in front, e.g. Pangolin/newt
with target `http://<host>:30250`; the app needs HTTPS for GPS.

Local build: `docker build --build-arg BUILD_ID=$(git rev-parse --short HEAD) --target web -t plotter .`
and `docker build --target server -t plotter-server .` for the API/data image.
Run the web image with `docker run -p 8080:80 -v $PWD/public/tiles:/srv/tiles:ro plotter`
and the API with `docker run -p 8081:8080 -v $PWD/data:/srv/data:ro plotter-server`
(the mounted files must be readable by uid 568).

The running build is shown in *Menu → About* (and in `data-build` on `<html>`).
The service worker checks for a new version hourly, when the page becomes
visible and when the device comes online, then applies it and reloads. While an
anchor watch is armed, an alarm is sounding or a sheet input has focus, the
reload waits: tap the "Update ready" toast, or it happens when the page is
hidden.

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
- OpenStreetMap data is not a nautical chart. Routing uses what OSM has:
  clearance is known for a minority of fixed bridges, depth and width limits are
  rarely tagged, lock and bridge **opening times, tides and currents are not
  considered**, and a route can pass a waterway that is closed or private.
  Locks mapped away from the fairway line can be missed. Treat a charted course
  as a suggestion and keep the official charts and notices to skippers at hand.
- Offline rerouting only works inside a saved corridor; the tile size in the
  confirmation is what the PMTiles archive holds, not counting the routing data.

## Project layout

```
src/
  core/        pure, tested logic: geodesy & ETA, route progress, anchor check,
               track filter, units, GPX, and the shared routing code: graph
               router, place search, polyline, corridors, course progress
  map/         MapLibre style (day/night), overlays, long-press handling
  services/    GPS (+ simulator), IndexedDB, wake lock, alarm sound
  ui/          instrument bar, bottom sheets, disclaimer, styles
  app.ts       application state and map wiring
  main.ts      bootstrap
  sw.ts        service worker (Workbox): precache, PMTiles range cache, tile caches
server/        API server (node:http): search, route, corridor, data reload
tools/waterways/  OSM → routing graph and place index builder (OPL in, JSON out)
deploy/        docker-compose stack, nginx config, tiles and waterways jobs
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
