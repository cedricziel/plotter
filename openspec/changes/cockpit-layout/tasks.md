## 1. Tests first

- [x] 1.1 Dashboard cells off and on a route, wide-only cells, ETA and END values; see them fail
- [x] 1.2 Guidance card distance and maneuver text, in English and German; see them fail
- [x] 1.3 Menu: open, close, items, day palette at night, `beforeTool`, Escape; see them fail
- [x] 1.4 Status card REC timer and the `navigating` class; see them fail
- [x] 1.5 Language switch relabels the menu and the status card; see it fail

## 2. Screen

- [x] 2.1 `Dashboard` with the menu button and `Instruments`; `Instruments` shows the leg while navigating
- [x] 2.2 `ToolMenu` replaces `Toolbar`; the Shell wires search to the Route sheet's search box
- [x] 2.3 `NavStrip` as the guidance card; `StatusPill` as the status card with clock, GPS, REC and position
- [x] 2.4 `MapControls` without the destination button, with line icons
- [x] 2.5 Glass tokens and the floating layout in `styles.css`

## 3. Stories

- [x] 3.1 `Chrome/Menu` replaces `Chrome/Toolbar`; Navigating stories for the dashboard
- [x] 3.2 Review `Pages/Plotter screen` on all four devices, day and night

## 4. Verification

- [x] 4.1 `npm test`, `npm run build`, `npm run build-storybook`
- [x] 4.2 `npm run test:layout` with no unexpected overflows
- [ ] 4.3 iPhone and iPad (Safari and home-screen app): deferred to a device check
