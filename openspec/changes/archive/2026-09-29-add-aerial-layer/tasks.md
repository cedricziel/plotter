# Tasks

## 1. Settings and style

- [x] 1.1 Add failing tests for the `aerial` setting default and persistence and for the style builder with the layer (included by day above `buildings`, excluded when off, excluded at night, included over the OSM fallback) and see them fail
- [x] 1.2 Add the setting and the style options and layer, and verify the tests pass
- [x] 1.3 Add a test that the service worker source names no aerial host, and verify it passes without a worker change

## 2. Menu and attribution

- [x] 2.1 Add the "Aerial photo (online)" Menu row with the hint (not saved offline, hidden at night), pass the setting to the style, and verify the attribution includes "Luchtfoto © PDOK" only while shown
- [x] 2.2 Verify in the browser at Sixhaven (52.3822, 4.9035, zoom 16.5): layer off and on, day and night, and no PDOK request while off or at night
- [ ] 2.3 Add the Storybook stories listed in design.md (pending: Storybook is not on main yet; do this once it lands)

## 3. Integration

- [x] 3.1 Run typecheck, all Vitest suites, `npm run build` and `npm run build:server`
- [ ] 3.2 Verify on iPhone and iPad, in Safari and as the home-screen app (pending: needs a device)
