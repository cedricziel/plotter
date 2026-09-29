# Proposal

## Why

The vector chart shows where the water is but not what the shore looks like: moorings, quay walls, trees and building sites. When choosing a berth or an anchorage a skipper wants the aerial photo underneath, and the Netherlands publishes an open, current one (PDOK Luchtfoto).

## What Changes

- A Menu setting "Aerial photo (online)", off by default and remembered, adds the PDOK aerial photo below labels, seamarks and other overlays.
- The photo is never cached for offline use and never part of an offline corridor; the setting's hint says so.
- The photo is hidden in the night palette.
- The chart attribution adds "Luchtfoto © PDOK" while the photo is shown.

## Capabilities

### New Capabilities

### Modified Capabilities

- `plotter-screen`: a new requirement for the optional aerial photo layer.

## Impact

- iPhone and iPad: a raster layer in the map style; nothing device specific. Data use is the concern, so the layer is off by default and tiles load only while it is shown.
- Code: `src/settings.ts`, `src/map/style.ts`, `src/app.ts` (style options), `src/ui/panels.ts` (Menu row and hint). The service worker needs no rule, because it caches only the hosts it names.
- Tests written first: settings default and persistence, the style builder including and excluding the layer (day, night, OSM fallback), and that the service worker names no aerial host.
- Storybook stories (deferred until Storybook lands on main): see design.md.
