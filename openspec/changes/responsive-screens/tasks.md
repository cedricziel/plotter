## 1. Tests first

- [ ] 1.1 Test that `PlotterScreen` sets state classes and `data-theme` on `.plotter`, not on `body`; see it fail

## 2. Layout as a container

- [ ] 2.1 `.plotter` root with the grid and `container: plotter / size`; `@container` queries; `cqw`/`cqh` units; state and night selectors on `.plotter`
- [ ] 2.2 `PlotterScreen` (presentational), `MapControls`, `Toolbar`, `AnchorAlarm`, `PlacementBar`; `Shell` wires stores and map; `destination.tsx`/`sheet.tsx` stop writing to `body`

## 3. Stories

- [ ] 3.1 `Device` frame with phone/tablet × portrait/landscape
- [ ] 3.2 Device variants for every component; stories for the new components and `SheetFrame`
- [ ] 3.3 `Pages/Plotter screen`: chart, navigating, route sheet, settings, destination, placement, anchor alarm, night × 4 devices

## 4. Verification

- [ ] 4.1 `npm test`, `npm run build`, `npm run build-storybook`
- [ ] 4.2 Pixel diff of the built app against `main` at 390×844, 844×390, 820×1180, 1180×820, day and night
- [ ] 4.3 Design sync: every component and page graded against Storybook and uploaded
- [ ] 4.4 iPhone and iPad (Safari and home-screen app): deferred to a device check
