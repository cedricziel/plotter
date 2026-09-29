## 1. Tests first

- [x] 1.1 Test that `PlotterScreen` writes the bottom bar's measured height to `--bottom-bar-h` on `.plotter`; see it fail
- [x] 1.2 Browser check of the `Pages/Plotter screen` stories (every visible `.fab` inside `#map` and above `#dest-bar`) on all four devices; see it report the overlaps

## 2. Layout

- [x] 2.1 `PlotterScreen` observes `#dest-bar` and sets `--bottom-bar-h`
- [x] 2.2 `.fabs` as a column-flow grid: 1, 2 or 3 columns by `@container plotter` height; size and gap from `cqh`, at most `--tap`, at least 44 px
- [x] 2.3 Buttons above the bottom bar by its real height; from 720 px wide the bar leaves the button column free

## 3. Stories

- [x] 3.1 Review `Pages/Plotter screen` and `Chrome/Map controls` on all four devices

## 4. Verification

- [x] 4.1 `npm test`, `npm run build`, `npm run build-storybook`
- [x] 4.2 Screenshots of the page stories on 390×844, 844×390, 820×1180, 1180×820 with no overlaps reported
- [ ] 4.3 iPhone and iPad (Safari and home-screen app): deferred to a device check
