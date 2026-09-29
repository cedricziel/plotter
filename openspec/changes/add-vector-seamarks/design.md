# Design

## Context

- The data job (`deploy/waterways.sh`) filters the Netherlands extract with `osmium tags-filter`, converts it to OPL and feeds `tools/waterways/cli.ts`, which writes `waterways-<date>.json` and `places-<date>.json` and publishes them by writing `current.json` last. The API server (`server/data.ts`) loads whatever `current.json` names and hot-swaps.
- Places are the model to copy: `GET /api/places?bbox=` with bbox validation, clamping, a cap, a rate-limit bucket and gzip; `src/map/places.ts` fetches per viewport with debounce and a padded box and falls back to saved trips; corridors carry the places near a course.
- The OpenSeaMap raster overlay is one raster layer in `buildStyle`, toggled by `settings.seamarks`. Night is red on black, painted natively. Overlay layers are re-added on `style.load`; MapLibre drops images when the style is replaced.

## Goals / Non-Goals

**Goals:**

- Seamarks drawn from data we serve, offline through saved trips, tappable, correct in the night palette.
- Reuse the places pipeline shape so the server, client and job stay uniform.

**Non-Goals:**

- Sector lights, light arcs, radar or AIS, fog signals, region B (US) colours, harbour and bridge types (already places).
- Rendering seamarks into the PMTiles chart. That archive is rebuilt by another job and cannot be tapped per feature.
- Any change to routing.

## Decisions

### Data file and wire type

`seamarks-<date>.json` is a JSON array, one object per line like the places file: `{lat, lon, type, category?, colour?, shape?, topmark?, light?, name?}`. `type` is the OSM `seamark:type` value; only `buoy_*`, `beacon_*`, `light_*` and `notice` are kept. Coordinates are rounded to five decimals (about one metre). `colour` is the OSM list (`red;green;red`), `topmark` the topmark shape, and `light` a ready string such as `Fl(2) G 5s` built from `character`, `group`, `colour` and `period` of the first light (numbered `seamark:light:1:*` included; sector lights are not drawn but the first light still names the character). `category` is the type's own category tag. Names come from `seamark:name`, then `name`, then `seamark:ref`. Optional fields are omitted, not null, so gzip has little to do beyond the keys. The manifest gains an optional `seamarks` path; a manifest without it loads with an empty list.

Alternative considered: tuples as in the graph. Rejected: a few tens of thousands of nodes, gzip shrinks repeated keys well, and objects can be sent to the browser unchanged.

### Extraction

`tools/waterways/seamarks.ts` holds a small `SeamarkBuilder` with the same `add(line)` shape as `WaterwayBuilder`, so `cli.ts` feeds each OPL line to both and writes the file next to the others. `deploy/waterways.sh` adds `n/seamark:type=buoy_lateral,buoy_cardinal,...` style filters (one expression per type family, nodes only) to the existing `tags-filter` call. Old seamark files are pruned like the other generations.

### Server

`GET /api/seamarks?bbox=w,s,e,n&limit=` mirrors `/api/places`: 400 for malformed input, clamp to the Netherlands box, 422 above 1.5 degrees of span, limit default 600 and cap 1500, own rate-limit bucket (120 per minute), gzip through the shared `sendJson`. Results are ordered so lateral and cardinal marks survive the cap before notices. `/api/corridor` adds `seamarks` within the buffer, reusing the polyline-distance filter that places use (generalised to any point type). `/api/meta` counts include `seamarks`.

### Client fetching

The bbox padding, "inside the fetched box" check and debounce currently live in `places.ts`. They move to `src/map/viewport.ts` (`padded`, `inside`, and a loader that debounces `moveend`, aborts stale requests and skips small pans), used by places and seamarks. Seamarks start at zoom 12 and are cleared below it. Offline or on a failed request the loader falls back to the seamarks of saved trips in the view (trips saved before this change have none, and that is fine).

### Symbols

What a mark looks like is decided by `symbolSpec(seamark)` in `src/core/seamark-symbol.ts`: the body (buoy, beacon, light or notice), the buoy shape (can, cone, sphere, pillar, spar, barrel), up to four colour bands and a topmark. It reads the OSM tags first and falls back to IALA region A defaults by category (port red can, starboard green cone, preferred channel bands, cardinal bands and topmarks by direction, isolated danger, safe water, special purpose). Dutch inland tagging is handled explicitly: `waterway_left`, `waterway_right`, `harbour_*`, `danger_*` and `channel_*` categories count as left and right sides, and a grey or missing colour on a lateral mark takes the side colour. `symbolKey(spec)` names the image, so equal marks share one image.

`src/map/seamark-svg.ts` turns a spec and a palette into an SVG string (32 by 32 units, rasterised at pixel ratio 2), so both are unit tested without a canvas. `src/map/seamarks.ts` rasterises the SVG through an `Image`, registers it with `map.addImage` before the features that use it are set on the source, and renders again on `style.load`, which is when MapLibre has dropped all images after a theme change. HTMLImageElement is used because `createImageBitmap` on SVG is unreliable in Safari.

The GeoJSON source `seamark-marks` gets one feature per seamark with `icon`, `notice` and `flare` properties. Three symbol layers draw it: the marks (from zoom 12, `icon-size` 0.5 at zoom 12 to 1.25 at zoom 18), a magenta flare beside marks that have a light (a light-only mark's own symbol is the flare), and notices from zoom 14 only, because the extract holds several thousand of them (speed limits, no entry) and they would bury the buoys. All sit below the place marks and the boat.

Night palette: red and black only, with equal green and blue channels. Red lateral marks are solid bright red, green ones a nearly black fill with a bright outline, yellow a light pink, white a paler pink. Shape (can against cone, topmarks, X) carries the meaning; brightness only supports it. A unit test checks that every colour in every night symbol has a red channel at least as large as green and blue, and green equal to blue.

Alternative considered: SDF icons recoloured by `icon-color`. Rejected: banded marks need several colours per symbol.

### Card

Tapping picks the nearest rendered feature within 8 px (as places do) and opens a card built like the destination card, in the same `#dest-bar` slot, so the floating buttons and safe areas already handled for that card apply. Its content is a pure function `seamarkRows(seamark)` returning label and value pairs, so empty rows never appear. The kind text comes from a lookup (`Lateral buoy, port`).

### Toggles and attribution

`settings.seamarks` now shows and hides the vector layers; the FAB is unchanged. The Menu row "OpenSeaMap seamarks (online)" becomes two rows: "Seamarks" (same setting) and "OpenSeaMap overlay (online)" (new `openseamap`, default false). `buildStyle` only adds the OpenSeaMap source and layer when `openseamap` is on, so no tile is requested and its attribution is absent otherwise. Stored settings without the new key get the default.

## Storybook stories (deferred: Storybook is not on main yet)

Added once Storybook lands, each with day and night and 360 px, 390 px and iPad widths:

- `Seamark/Symbols`: a grid of every symbol key on land and water colours (day and night).
- `Seamark/Card`: lateral buoy with light, cardinal mark without name, notice, long name wrapping, unknown type.
- `Menu/SeamarkSettings`: Seamarks on/off and OpenSeaMap overlay on/off rows.
- `Chart/SeamarkStates`: empty (zoomed out), loading, service unreachable with saved trip, service unreachable without trip.

## Tests

- Data (Vitest, OPL fixtures): type whitelist, harbour and bridge types ignored, colours, shape, topmark, light string, name fallback, coordinate rounding, numbered lights, relations and ways ignored. Written first.
- Server (Vitest with the existing server harness): bbox validation and clamp, limit cap, ordering, rate limit, gzip, old manifest without seamarks, corridor including seamarks.
- Unit: `symbolSpec`, `symbolKey`, symbol SVGs for day and night, card rows and DOM, feature properties, viewport helpers (including no second request while one is loading), style layers, settings defaults.
- Browser (Playwright script in the scratchpad, not committed): screenshots at Amsterdam IJ and the Markermeer approach in both palettes, tap card at 360 px and 390 px, existing e2e suites.

## Risks / Trade-offs

- [OSM seamark tagging is uneven; some marks lack category or colour] -> Fall back to colour, then to a generic symbol; the card shows what is known.
- [Thousands of marks in one busy view] -> Cap of 600 per request by default, marks before lights before notices; symbols do not collide-test (allow overlap) so a dense harbour stays complete, and notices only start at zoom 14.
- [Region A only] -> Fine for the Netherlands; noted as a non-goal.
- [Image registration is asynchronous] -> Images are registered before the features that use them are set on the source, and every render waits for them, so a mark is never drawn without its image.
- [Old saved trips lack seamarks] -> Optional field; no migration, they are refreshed the next time the trip is saved.

## Migration Plan

Deploy the server and client together with the data job run once (`FORCE=1`). Until the new file exists the API returns an empty list and the chart shows no seamarks, which is safe. The raster overlay remains one setting away. Rollback: redeploy the previous images; the extra file and manifest key are ignored by old servers.
