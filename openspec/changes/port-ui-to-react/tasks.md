## 1. Foundation (tests first)

- [x] 1.1 Port `tests/stories.test.ts` to `tests/stories.test.tsx` rendering every story via `composeStories`; confirm it fails before the stories are ported
- [x] 1.2 Add React, Storybook react-vite and Testing Library; `jsx: react-jsx`; `App.version` bumped on `emit()`
- [x] 1.3 `store.ts` (external stores), `toast.tsx`, `sheet.tsx` host, `icons.tsx` components, `shell.tsx`, `main.tsx`, `#root { display: contents }`

## 2. Components (each: port test, see it fail, implement, port/add stories)

- [x] 2.1 Instruments and guidance strip; tap-in-progress identity test kept
- [x] 2.2 Seamark card and disclaimer; stories for both
- [x] 2.3 Destination bar, card and placement; search box; stories for card and search
- [x] 2.4 Sheets: route, waypoint, track, anchor, settings; typed-input-survives-refresh test kept; stories per sheet state

## 3. Verification

- [x] 3.1 `npm test`, `npm run build`, `npm run build-storybook` pass
- [x] 3.2 Built app at 390x844 and 360x740, iPad portrait and landscape, day and night: screenshots match the pre-port build (pixel diff: only the clock and antialiasing differ)
- [ ] 3.3 iPhone and iPad (Safari and home-screen app): taps on the guidance strip and sheets during GPS updates; deferred to a device check
