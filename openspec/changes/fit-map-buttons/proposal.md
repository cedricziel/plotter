## Why

The six round map buttons (`.fabs`) form one column pinned a fixed distance above the toolbar. Two cases break it:

- On a short screen, such as a phone in landscape (844×390), the column is taller than the chart. The top buttons cover the instrument bar and the guidance strip, and the "+" button is cut off.
- With a destination card or the placement bar open, the column moves up by a fixed 130 px or 190 px. The card and bar are taller than that on every device, so the zoom buttons sit behind them. The tablet portrait card shows it most clearly.

## What Changes

- The buttons lay out by the height of the screen (`@container plotter` height queries): one column on tall screens, two columns below 700 px, and three columns (two rows) below 480 px. On very short screens they shrink with the screen height (`cqh`), but never below 44 px. On the four reference devices they keep the full `--tap` size.
- `PlotterScreen` measures the bottom bar (`#dest-bar`) with a `ResizeObserver` and writes its height to `--bottom-bar-h` on `.plotter`. On narrow screens the buttons sit that far plus a gap above the bar, instead of at a fixed offset.
- From 720 px wide, the breakpoint where the sheet becomes a side panel, the bottom bar leaves the button column free on the right. The buttons stay in place beside it, so a tall card on a short, wide screen (phone landscape) does not push them off the chart.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `plotter-screen`: the Screen layout requirement gains scenarios that keep the map buttons inside the chart area on short screens and clear of the bottom bar.

## Impact

- iPhone (Safari and home-screen app): in landscape, the buttons form a 3×2 block at full size instead of a column that runs over the instrument bar. In portrait with a destination card or the placement bar, the zoom buttons sit above the bar instead of behind it. In landscape the bar ends before the button column. Safe-area handling is unchanged. The toolbar and bar offsets still include `--safe-b`, and the container is the viewport.
- iPad: in portrait (820 px wide) and landscape, the card and placement bar leave room for the button column. In a narrow split view (below 720 px), the buttons move above the bar, as on a phone.
- Tests written first:
  - `tests/screen.test.tsx`: `PlotterScreen` writes the bottom bar's measured height to `--bottom-bar-h` on `.plotter` and updates it when the bar resizes.
  - Browser check: the `Pages/Plotter screen` stories are screenshotted on all four devices, and every visible map button is measured to lie inside `#map` and above the bottom bar.
- Stories: `Pages/Plotter screen` already covers chart, navigating, destination and placement on the four devices, and is the review surface for this change. `Chrome/Map controls` › Phone landscape now shows the 3×2 grid. No new stories are needed.
