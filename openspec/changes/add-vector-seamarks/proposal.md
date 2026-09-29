# Proposal

## Why

Seamarks are drawn today from the OpenSeaMap raster overlay. It needs the network, is blurry when scaled on retina screens, ignores the night palette apart from a dimmed grayscale, cannot be tapped to see what a buoy is, and is never available in a saved offline trip. Buoys, beacons and lights are what a skipper reads on the water, so they belong to the offline vector chart's data and drawing.

## What Changes

- The waterways data job also extracts OpenStreetMap seamark nodes (lateral, cardinal, isolated danger, safe water and special purpose buoys and beacons, lights and notices) into a compact `seamarks-<date>.json`, published in `current.json`. Old manifests without it stay loadable.
- The API server answers `GET /api/seamarks?bbox=` like `/api/places` and adds the seamarks near the course to `/api/corridor`, so saved trips carry them.
- The chart draws seamarks as IALA region A symbols (red can, green cone, preferred channel, cardinal marks with topmarks, isolated danger, safe water, special purpose, beacons as stakes, lights as a magenta flare) from zoom 12, with a red-on-black variant at night. Offline they come from saved trips.
- Tapping a seamark opens a compact card with type, name, colour and light character.
- The seamarks button on the chart toggles this vector layer. The OpenSeaMap raster overlay moves to a Menu setting "OpenSeaMap overlay (online)", off by default. The chart attribution follows what is shown.

## Capabilities

### New Capabilities

### Modified Capabilities

- `plotter-screen`: the "Chart" requirement (seamark source and button), plus new requirements for vector seamark symbols, the seamark card, seamarks offline, and the optional OpenSeaMap overlay.

## Impact

- iPhone and iPad: symbols are images registered with the map, so they work in Safari and the home-screen app alike; taps use a finger-sized hit area and the card sits above the toolbar and home indicator like the destination card. No device API is involved.
- Code: `tools/waterways` (seamark extraction) and `deploy/waterways.sh`, `server/` (data store, `/api/seamarks`, corridor), `src/core` (wire types, corridor filter), `src/map` (seamarks overlay, symbols, style), `src/ui` (card, menu), `src/settings.ts`.
- Data: one new file next to the graph and place files; nothing in them changes.
- Tests written first: OPL fixture tests for extraction, server tests for `/api/seamarks` and the corridor, unit tests for symbol selection, palettes and viewport helpers, style tests for the layers, and browser checks with screenshots at Amsterdam IJ and the Markermeer approach in day and night.
- Storybook stories (deferred until Storybook lands on main): see design.md.
