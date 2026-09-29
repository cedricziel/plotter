## 1. Story render test (first)

- [ ] 1.1 Add `tests/stories.test.ts` that imports every `*.stories.ts` and renders each story; run `npx vitest run tests/stories.test.ts` and confirm it fails because no stories exist

## 2. Storybook setup

- [ ] 2.1 Add Storybook dev dependencies, `.storybook/main.ts` (telemetry off) and `.storybook/preview.ts` with theme, viewport and safe-area toolbar; verify `npm run build-storybook` succeeds
- [ ] 2.2 Add `storybook` and `build-storybook` scripts, ignore `storybook-static/` in git and docker, include `.storybook` and stories in `tsconfig.json`; verify `npx tsc --noEmit`
- [ ] 2.3 Add a `build-storybook` step to the CI test job

## 3. Stories

- [ ] 3.1 Make the destination card renderable without `App` (no behaviour change); add its stories (marina, opening bridge, town, long name); verify `npx vitest run`
- [ ] 3.2 Make the guidance strip and instrument bar renderable without `App`; add their stories (guidance: long maneuver, arrived, off course, GPS denied/searching; instruments: good fix, stale, denied); verify `npx vitest run`
- [ ] 3.3 Add the disclaimer story; verify `npx vitest run`

## 4. Verification

- [ ] 4.1 Open the built Storybook at 390x844 and 360x740, day and night: no horizontal overflow, no console errors, screenshots reviewed
- [ ] 4.2 iPhone and iPad (Safari and home-screen app): no runtime change; nothing to verify on a device beyond a normal smoke test of the app build
