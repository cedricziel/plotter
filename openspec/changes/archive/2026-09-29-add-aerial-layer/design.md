# Design

## Context

`buildStyle` (`src/map/style.ts`) assembles the basemap layers (Protomaps vector layers, or one OSM raster layer when the archive is missing), then the OpenSeaMap raster and the overlay layers. Settings live in `src/settings.ts` and are persisted by `updateSettings`; changing the style options restyles the map. The service worker caches only named hosts (OSM, OpenSeaMap, glyphs, the chart), so an unlisted host is never cached.

## Goals / Non-Goals

**Goals:**

- An optional, off-by-default aerial photo with correct layer order, attribution and no offline footprint.

**Non-Goals:**

- Offline aerial photos, an opacity slider, historic imagery, or other aerial providers.

## Decisions

### Source

PDOK Luchtfoto Actueel_orthoHR (RGB, 8 cm) as slippy-map tiles: `https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg`, tile size 256, JPEG. The service was checked: tiles answer 200 with CORS open, and the capabilities list matrix levels 0 to 21 for EPSG:3857. `maxzoom` is 19, past which MapLibre overzooms, because levels 20 and 21 only add bytes for a phone on mobile data. Attribution: `Luchtfoto © <a href="https://www.pdok.nl">PDOK</a>` (text "Luchtfoto © PDOK").

### Layer order

For the vector chart the raster goes directly after the `buildings` layer: it covers water, land use and building fills, while boundaries, rails, roads, bridges, waterway labels, place names and every overlay stay on top. For the OSM fallback it goes after the OSM raster layer. It sits below the OpenSeaMap raster, seamarks, routes, tracks and boat.

### Night: hidden

At night the layer is left out of the style. Options were dimming (`raster-brightness-max` about 0.35) and hiding. MapLibre raster paint has no way to turn a photo red (no blend modes, and the app already avoids blend overlays because mobile Safari does not composite them over the WebGL canvas); saturation -1 gives a grey picture. Even at 0.35 brightness a grey photo is white light on a screen whose night palette is red on black to protect night vision, and an image that dark has little value for reading the shore. Hiding also saves the data. The setting stays on and the photo returns with the day palette. The hint says "Hidden at night".

### Offline

No service worker rule is added, so the tiles use the browser's HTTP cache only; the corridor download lists tiles from the chart archive and never mentions the photo host. The Menu hint says so. A failed tile shows as missing, without a toast, because MapLibre raster tiles fail quietly and the vector chart below stays usable.

### Settings

`aerial: boolean`, default false, persisted with the other settings. Stored settings without the key get the default. Changing it restyles the map, like `theme`.

## Storybook stories (deferred: Storybook is not on main yet)

- `Menu/AerialSetting`: off, on by day, on at night (hint shown), at 360 px and 390 px iPhone widths and iPad portrait and landscape.
- `Chart/AerialLayer`: day with and without the layer at Sixhaven; night showing the layer hidden; tile error state (photo missing over the vector chart).

## Tests

- Vitest: settings default and persistence round trip; style builder with `aerial` false, true by day (layer after `buildings`, source URL, tile size, maxzoom, attribution) and true at night (absent), and in the OSM fallback; the service worker source names no PDOK host. Written first.
- Browser: screenshots at Sixhaven (52.3822, 4.9035, zoom 16.5) with the layer off and on, day and night; a request log shows no PDOK request at night or while off.

## Risks / Trade-offs

- [Photo tiles use mobile data] -> Off by default, requested only while shown and in the day palette, JPEG, maxzoom 19.
- [PDOK changes its tile path] -> One constant in the style module; the layer fails quietly.
- [No offline photo, no warning when offline] -> The hint states it; the chart underneath keeps working.

## Migration Plan

None. Ship with the app; existing settings get the default. Rollback by redeploying; an unknown stored key is ignored.
