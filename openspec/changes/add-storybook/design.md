# Design

## Context

The UI is plain DOM built with `h()` in `src/ui/dom.ts` and styled by one global `src/ui/styles.css` that targets ids (`#instruments`, `#navstrip`, `#dest-bar`) and reads `--safe-t`/`--safe-b` and `data-theme` on `<html>`. Several components take the whole `App`, which owns a MapLibre map and GPS, so they cannot be rendered alone.

## Goals / Non-Goals

**Goals:** render the real components in Storybook with realistic states; switch theme, viewport and safe areas from the toolbar; fail CI when a story breaks.

**Non-Goals:** visual regression testing, Chromatic, stories for map layers, sheets and panels (later changes), any behaviour change.

## Decisions

- **`@storybook/html-vite`.** The app has no UI framework; the HTML renderer takes a function returning a node. Alternative: a hand-rolled preview page, rejected because it lacks the toolbar, a11y and docs tooling.
- **Hand-written config, no `storybook init`.** Init rewrites files and adds sample stories. Telemetry is disabled in `.storybook/main.ts`.
- **Narrow structural types instead of `App`.** Render code takes a `Pick<App, ...>` of what it reads. `src/stories/fakes.ts` provides typed stubs with only those members, so stories exercise the real functions.
- **Split the destination card.** `showDestinationCard` keeps the map pin, fly-to and `#dest-bar` handling; a new `destinationCard(app, place)` returns the card element. Alternative: render `showDestinationCard` with a fake map, rejected as it needs a MapLibre `Marker`.
- **Instrument code takes its elements.** `mountInstruments` accepts the bar and strip elements, defaulting to `#instruments` and `#navstrip`, so a story mounts real elements carrying those ids.
- **Toolbar globals.** `theme` sets `document.documentElement.dataset.theme`; `viewport` uses the built-in Storybook viewport options with the required devices; `safeAreas` sets `--safe-t`/`--safe-b` on the root (59px/34px for the iPhone notch), applied by a decorator.
- **Global layout override.** `styles.css` fixes `body` as a grid; a small `.storybook/preview.css` loaded after it restores normal flow for the canvas only.
- **Test strategy.** Vitest under happy-dom imports every `*.stories.ts` and calls each story's `render()`; this test is written first and fails before the stories exist. `build-storybook` in CI catches bundling errors; `tsc --noEmit` includes `.storybook` and stories.

## Risks / Trade-offs

- Stubs can drift from `App` → typed with `Pick<App, ...>`, so removed or renamed members fail `tsc`.
- Desktop browsers do not reproduce iOS safe-area or standalone behaviour → the safe-area toggle simulates insets only; device checks remain.
- Importing `destination.ts` pulls MapLibre into the story bundle → accepted, dev-only.
