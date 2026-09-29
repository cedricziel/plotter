## Context

`.plotter` is a size container (`container: plotter / size`), so its layout can react to the screen's height as well as its width. The map buttons are `position: fixed` inside it, anchored to the bottom right. The bottom bar (`#dest-bar`) is fixed just above the toolbar. Its height depends on the content: the placement readout, or a destination card with an info list and wrapped button labels.

## Goals / Non-Goals

- Goal: on the four reference devices, every visible map button is inside the chart area and not behind the bottom bar, with every page state.
- Goal: keep full `--tap` touch targets on phones wherever they fit.
- Non-goal: the height of the destination card itself. In phone landscape it covers most of the chart and part of the instrument bar. That is a separate issue.

## Decisions

### Button grid by container height

`.fabs` becomes a grid that fills columns top to bottom (`grid-auto-flow: column`), so the order stays +, −, seamarks, destination, orientation, follow.

| Container height | Rows | Columns (6 buttons) |
| --- | --- | --- |
| ≥ 700 px | 6 | 1 |
| < 700 px | 3 | 2 |
| < 480 px | 2 | 3 |

The worst case is navigating with the guidance strip open. The chart is then about the height of the container minus 256 px (a two-row instrument bar, the strip and the toolbar). One column needs about 420 px including its margins, three rows about 220 px, and two rows about 155 px. At 390 px high (phone landscape, one-row instrument bar) the chart is about 165 px, so two rows fit.

Button size is `min(var(--tap), max(44px, 15cqh))`. That is the full 56 px down to about 373 px of height, then shrinks to Apple's 44 px minimum. The gap is `min(10px, 2.5cqh)`.

Alternative rejected: a wrapping flex column (`flex-flow: column wrap` with a `max-height`). An auto-sized column-wrap flex container does not widen for its extra columns in WebKit and Chrome, so the wrapped buttons overflow the edge.

### Real bottom-bar height instead of a fixed offset

A `ResizeObserver` on `#dest-bar` writes `offsetHeight` to `--bottom-bar-h` on the `.plotter` root. Observer callbacks run after layout and before paint, so the buttons never show a frame at the old offset. The rule is:

```css
.plotter:is(.placing, .destcard) .fabs {
  bottom: calc(var(--tap) + 24px + var(--safe-b) + var(--bottom-bar-h, 0px));
}
```

The bar's own `bottom` is `var(--tap) + 12px + var(--safe-b)`, so this leaves a 12 px gap. With a bar open, only the two zoom buttons show, so the same rule sets two rows. Otherwise the empty rows would add their gaps below the buttons.

Alternative rejected: moving the buttons and the bar into one bottom-anchored flex "dock". It avoids JavaScript, but it moves the buttons out of their stacking order relative to the sheet and toolbar, and it changes the DOM that the app's map code and tests rely on.

### Beside the bar on wide screens

From 720 px wide, `#dest-bar` gets `right: calc(var(--tap) + 28px)` and the buttons keep their normal offset. On a short, wide screen, the card is taller than the chart, so no offset above it would fit. Beside the card, the two remaining buttons fit.

## Stories

- `Pages/Plotter screen`: chart, navigating, destination and placement on phone portrait (390×844), phone landscape (844×390), tablet portrait (820×1180) and tablet landscape (1180×820), day and night. These already exist. They are the review surface for this change.
- `Chrome/Map controls`: the existing per-device stories render the controls in a `Device` frame, so the phone landscape story now shows the 3×2 grid.

## Test strategy

- Unit (Vitest, happy-dom), first and failing: `PlotterScreen` writes the observed bottom-bar height to `--bottom-bar-h`.
- Browser: a Playwright script against the built Storybook measures every visible `.fab` against `#map` and `#dest-bar` in all 32 page stories, and saves a screenshot of each. Before the change it reports 12 overlaps. After the change it must report none.
- iPhone/iPad device check: deferred. It needs real devices, including the home-screen app with safe-area insets in landscape.

## Risks

- A container shorter than about 330 px (iPhone SE landscape with the guidance strip) still cannot fit two rows. The buttons shrink to 44 px there, and the top row may touch the strip.
- `--safe-b` is unchanged. In landscape, the right safe-area inset (notch side) is still not added to the button column's `right`. That is pre-existing.
