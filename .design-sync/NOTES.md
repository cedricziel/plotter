# design-sync notes

- [GENERAL] Plotter is an app, not a published package. The converter reads component names from `.d.ts`, so `.design-sync/build.sh` emits declarations for `src/ui/index.ts` into `types/` (gitignored) and `package.json` points `types` at them. The bundle entry is the TS source (`cfg.entry: ./src/ui/index.ts`). Run `.design-sync/build.sh` before every converter/driver run: it also rebuilds the reference Storybook.
- [GENERAL] Playwright's bundled chromium version doesn't match the container's. Export `DS_CHROMIUM_PATH=/opt/pw-browsers/chromium` for validate/compare.
- [GENERAL] Sheets, `#dest-bar`, toast and modal are `position: fixed`. Outside a screen they render blank in cards. Stories wrap them in `Device` (`src/stories/device.tsx`): a transformed, device-sized box that is both their containing block and the `plotter` size container the CSS's container queries and cq units read. Every component has phone/tablet × portrait/landscape stories, and every card captures at `viewport: 1200x1200`, so run the driver with `--max-stories 40` (the page component has 32 stories).
- [GENERAL] Stories must not call module-level helpers that the bundle doesn't export. Those imports redirect to `window.Plotter` and come back undefined. Toast has a `message` prop and Disclaimer has an `open` prop for that reason, and `seedSearch` is exported from `src/ui/index.ts`.
- The disclaimer's ⚠ is a CSS `::before` on its heading, not text. Validate/compare read a cell whose text starts with ⚠ as a caught render error, so keep that glyph (and any other leading ⚠) out of a component's leading text.
- NavStrip "Long Maneuver Name" is graded `close`: the long maneuver wraps and ellipsizes at a different point because the capture widths differ. Same markup and CSS.

## Re-sync risks

- Story titles map to exports through `titleMap`. A renamed story title silently drops its component (`[TITLE_UNMAPPED]`).
- Story titles with spaces map through titleMap by their squashed last segment (`Chrome/Map controls` → `Mapcontrols`).
- Run `.design-sync/build.sh` after changing `src/ui/index.ts`: stale `types/` silently drops new components (`[TITLE_UNMAPPED]` on the export names themselves).
