# Tasks

## 1. Data job

- [ ] 1.1 Add failing OPL fixture tests for seamark extraction (whitelist, ignored harbour and bridge types, colour, shape, topmark, light string, name fallback, rounding) and see them fail
- [ ] 1.2 Add the wire types and `tools/waterways/seamarks.ts`, and verify the tests pass
- [ ] 1.3 Write `seamarks-<date>.json` and the manifest key from `cli.ts`, keeping an old manifest loadable, and add the node filters to `deploy/waterways.sh`; verify with a run on a real extract

## 2. Server

- [ ] 2.1 Add failing server tests for `/api/seamarks` (validation, clamp, cap, order, rate limit, gzip, missing data file) and for seamarks in `/api/corridor`
- [ ] 2.2 Load the file in the data store, add the endpoint and the corridor field, and verify the tests pass

## 3. Client data and settings

- [ ] 3.1 Add failing tests for the viewport helpers, the settings defaults (`openseamap` off) and the style builder with and without the OpenSeaMap layer
- [ ] 3.2 Extract `src/map/viewport.ts` from `places.ts`, add the settings and the style options, and verify the tests pass
- [ ] 3.3 Add `api.seamarks`, store seamarks in trips, and verify with a test that older trips without them still load

## 4. Symbols, layer and card

- [ ] 4.1 Add failing tests for `symbolKey`, the day and night symbol SVGs and `seamarkRows`
- [ ] 4.2 Implement `seamark-symbols.ts`, `seamarks.ts` (fetching, offline fallback, image registration on `style.load` and `styleimagemissing`, tap handling) and the card, and verify the tests pass
- [ ] 4.3 Wire the FAB and the Menu rows, update the attribution, and verify in the browser (Amsterdam IJ z15 and Markermeer z13, day and night, card at 360 px and 390 px)
- [ ] 4.4 Add the Storybook stories listed in design.md (pending: Storybook is not on main yet; do this once it lands)

## 5. Integration

- [ ] 5.1 Run typecheck, all Vitest suites, `npm run build` and `npm run build:server`
- [ ] 5.2 Run the browser suites against a preview with a local server
- [ ] 5.3 Verify on iPhone and iPad, in Safari and as the home-screen app (pending: needs a device; not done in this change's automated pass)
