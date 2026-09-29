## Why

Storybook and the Claude Design project show components at one width, and there are no stories for whole screens. Layouts that change between iPhone and iPad, portrait and landscape (the instrument bar's single row, the sheet becoming a side panel at 720 px) cannot be reviewed there. They can't be framed either: they switch on viewport media queries and `vw`/`dvh` units, and screen state lives on `body` and `<html>`, so a story cannot show a phone-sized or tablet-sized screen inside the Storybook canvas.

## What Changes

- The screen's layout becomes a container, `.plotter`, instead of `body`. Media queries become `@container plotter` queries, and `vw`/`vh`/`dvh` become `cqw`/`cqh`. In the app, the container fills the viewport, so behaviour is unchanged.
- Screen state (`following`, `recording`, `anchor-armed`, `seamarks-on`, `north-up`, `placing`, `destcard`, `data-sheet`) and the theme (`data-theme`) move from `body`/`<html>` onto `.plotter`. Night-theme selectors match any `[data-theme='night']` ancestor.
- New presentational `PlotterScreen`: the whole screen from props (app state, open sheet, bottom bar, toast, disclaimer, control handlers). `Shell` becomes `PlotterScreen` wired to the stores and the map. The map controls, toolbar, anchor alarm and placement bar become their own components.
- Storybook gets a `Device` frame (phone portrait 390×844, phone landscape 844×390, tablet portrait 820×1180, tablet landscape 1180×820) that acts as the screen's container. Every component gets stories on all four devices, and new `Pages` stories show whole screens (chart, navigating, route sheet, settings, destination, placement, anchor alarm, night) on each device.
- Everything is re-synced to the Claude Design project.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. No user-visible requirement changes.

## Impact

- iPhone and iPad (Safari and home-screen app): no intended visible change. Container queries and `cq*` units are supported since Safari 16, below both supported iOS versions. Pixel diffs against `main` at iPhone and iPad sizes, portrait and landscape, day and night, prove the layout is unchanged.
- Code: `src/ui/styles.css` (selectors and units), `src/ui/shell.tsx` split into `screen.tsx` + controls, `src/ui/destination.tsx` and `src/ui/sheet.tsx` stop writing to `body`, `src/app.ts` keeps `<html data-theme>` only for the page background and theme colour.
- Tests first: a test that `PlotterScreen` puts state classes and `data-theme` on its root and none on `body`, and the stories test renders every page story.
- Stories: `Device` frame; four device variants for every component; `Pages/Plotter screen` with 8 states × 4 devices.
