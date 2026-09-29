## Why

The project rules require UI components to be developed and reviewed in Storybook with a story per state, but no Storybook exists. Layouts that depend on long names, safe-area insets, day and night themes and iPhone/iPad widths can only be checked today by driving the full app with a live map and GPS.

## What Changes

- Add Storybook (`@storybook/html-vite`) configured by hand, with telemetry disabled.
- The preview loads `src/ui/styles.css` and offers toolbar controls for theme (day/night), viewport (iPhone SE, iPhone 14/15, iPhone Pro Max, small 360, iPad portrait and landscape) and simulated safe areas (none / iPhone notch).
- Add `storybook` and `build-storybook` npm scripts; `storybook-static/` is git- and docker-ignored.
- First stories: destination card, guidance strip, instrument bar, disclaimer modal, each with its states.
- Make the destination card, guidance strip and instrument bar renderable without the full `App`: the rendering code takes a narrow structural type instead of `App`, and the destination card is built by a function separate from the map side effects. Behaviour is unchanged.
- Add a Vitest test that renders every story, and a `build-storybook` step in CI.

## Capabilities

### New Capabilities

None. This is developer tooling.

### Modified Capabilities

None. No user-visible requirement changes.

## Impact

- iPhone and iPad (Safari and home-screen app): no runtime impact. Storybook is not part of the shipped bundle. It gives a way to check layouts at iPhone and iPad sizes with simulated safe-area insets; real-device verification is unchanged.
- Code: small type-only and extraction refactors in `src/ui/destination.ts` and `src/ui/instruments.ts`; new `.storybook/`, `src/stories/`.
- Dependencies: `storybook`, `@storybook/html-vite`, `@storybook/addon-a11y`, `@storybook/addon-docs` (dev only).
- CI: one extra step in the existing test job.
- Tests written first: `tests/stories.test.ts` renders every story and fails until the stories exist.
- Stories added: `Destination card` (marina, opening bridge from Vaarweginformatie, town without info, very long name), `Guidance strip` (next maneuver with long name, arrived, off course, waiting for GPS denied/searching), `Instrument bar` (good fix, stale, denied), `Disclaimer`.
