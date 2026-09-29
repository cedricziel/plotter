## Why

The UI is built imperatively with a hand-rolled `h()` helper, and every screen re-renders by replacing DOM. Taps must survive the once-a-second refresh, so the code has three separate workarounds for it: `patchChildren` in the guidance strip, and the skeleton diffing, deferred updates and preserved form controls in `updateSheet`. Components cannot be reused outside the app: Storybook stories build them by hand, and the design system cannot be synced to Claude Design, which consumes React components. React's reconciliation does what those workarounds do, and it gives the UI a component model that stories, tests and design tools can share.

## What Changes

- Render the whole screen with React 19 (`src/ui/shell.tsx`, mounted from `src/main.tsx` into `#root`). `#root` is `display: contents`, so the screen's parts stay grid items of `body` and `styles.css` keeps working unchanged.
- The `App` class stays the single source of state. It gains a `version` counter that `emit()` bumps. The shell subscribes with `useSyncExternalStore` and re-renders on every emit.
- Port instruments, guidance strip, destination bar and card, search, seamark card, disclaimer, the sheet host and every sheet (route, waypoint, track, anchor, settings) to function components with identical markup, classes and text.
- Replace the sheet's `updateSheet`/`refresh` and `patchChildren` with React reconciliation. `openSheet(key, title, render)` now takes a render function.
- `toast()` keeps its signature and is backed by a store rendered by `<Toast />`.
- MapLibre markers (own ship, waypoints, destination pin) stay plain DOM elements that MapLibre owns.
- Storybook moves from `@storybook/html-vite` to `@storybook/react-vite`. Stories become `.stories.tsx`, and new stories cover the sheets, search and seamark card.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. No user-visible requirement changes; the screen looks and behaves the same.

## Impact

- iPhone and iPad (Safari and home-screen app): no intended visible change. The risk is tap handling during re-renders, which the old workarounds covered. Tests assert that the guidance strip's and sheet's buttons and inputs keep their identity across updates. Safe-area, viewport-height and standalone handling stay in unchanged CSS. Device check listed in tasks.
- Code: `src/ui/*` rewritten as `.tsx`, `src/main.ts` becomes `src/main.tsx`, `index.html` body reduced to `#root`, small `App` change (`version`, `subscribe` bound).
- Dependencies: `react`, `react-dom`; dev: `@types/react`, `@types/react-dom`, `@storybook/react-vite`, `@testing-library/react`; removed `@storybook/html-vite`.
- Bundle size: React adds about 60 kB gzip. It is precached by the service worker like the rest of the app.
- Tests written first: `tests/stories.test.tsx` renders every story through `composeStories`. The instruments, panels, search and seamark-card tests are ported to `@testing-library/react` before their components. New `tests/destination.test.tsx`.
- Stories: existing Destination card, Navigation (instruments + guidance) and Disclaimer stories ported. New stories for Seamark card, Search and every sheet state.
