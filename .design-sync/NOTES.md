# design-sync notes

- [GENERAL] Plotter is an app, not a published package. The converter reads component names from `.d.ts`, so `.design-sync/build.sh` emits declarations for `src/ui/index.ts` into `types/` (gitignored) and `package.json` points `types` at them. The bundle entry is the TS source (`cfg.entry: ./src/ui/index.ts`). Run `.design-sync/build.sh` before every converter/driver run: it also rebuilds the reference Storybook.
- [GENERAL] Playwright's bundled chromium version doesn't match the container's. Export `DS_CHROMIUM_PATH=/opt/pw-browsers/chromium` for validate/compare.
- [GENERAL] Sheets, `#dest-bar`, toast and modal are `position: fixed`. Outside a screen they render blank in cards. Stories wrap them in `src/stories/screen.tsx` (a transformed, phone-sized box that becomes their containing block), and their cards use `cardMode: "single"`.
- [GENERAL] Stories must not call module-level helpers that the bundle doesn't export. Those imports redirect to `window.Plotter` and come back undefined. Toast has a `message` prop and Disclaimer has an `open` prop for that reason, and `seedSearch` is exported from `src/ui/index.ts`.
- The disclaimer's ⚠ is a CSS `::before` on its heading, not text. Validate/compare read a cell whose text starts with ⚠ as a caught render error, so keep that glyph (and any other leading ⚠) out of a component's leading text.
- NavStrip "Long Maneuver Name" is graded `close`: the long maneuver wraps and ellipsizes at a different point because the capture widths differ. Same markup and CSS.

## Re-sync risks

- Story titles map to exports through `titleMap`. A renamed story title silently drops its component (`[TITLE_UNMAPPED]`).
- `SheetFrame` ships in the bundle and is named in the conventions header, but has no story or card of its own.
