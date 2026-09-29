# Design

## Context

- **Where the text comes from today**: every user-visible string is an English literal in one of these places:
  - the React components in `src/ui/*.tsx` and `src/ui/panels/bodies.tsx`, as JSX text and `title` / `aria-label` / `placeholder` attributes. The shell (`src/ui/shell.tsx`) holds the toolbar labels, the floating buttons, the chart notice and the anchor alarm; `index.html` is only `#root`.
  - `src/app.ts` and `src/update.ts`, as toasts
  - a few services and map labels (`src/services/*.ts`, `src/map/places.ts`)
- **Maneuvers**:
  - Routing runs on the server only (`server/app.ts` → `src/core/routing.ts`). Each `Maneuver` carries a finished English `text` built from the maneuver type and a waterway or object name.
  - The client caches maneuvers with a charted course (`src/services/courses.ts`).
  - The client reads `text` in the guidance strip (`instruments.tsx`), the route sheet (`panels/bodies.tsx`) and voice prompts (`app.ts` → `Announcer`).
  - It also reads `text` when a maneuver becomes a waypoint name (`app.ts`).
  - `routing.ts` itself relies on the English text: it matches `'(lock)'` to merge lock pairs.
- **Formatting**: `src/core/units.ts` formats with `toFixed` (always a decimal point) and `toLocaleTimeString([], …)`.
- **Speech**: `src/services/voice.ts` hard-codes `u.lang = 'en-GB'`.
- **Rendering**: React 19 renders the whole screen from `<Shell app={app} />` (`src/main.tsx`):
  - `App.emit()` bumps `app.version`; the shell subscribes with `useSyncExternalStore` (`useVersion`) and re-renders on every emit, and React reconciliation keeps elements, so taps and half-typed fields survive the refresh.
  - The open sheet lives in `sheetStore` as `{ key, title, render }`; the host calls `render()` on each shell render. Its title is a string fixed when the sheet opens.
  - The destination bar keeps its card as a React element created when the card opens (`showDestinationCard`, `showCard`). A re-render of the bar reuses that same element, so React skips re-rendering the card unless the card subscribes to something itself.
  - The toast, the disclaimer and the search boxes keep their state in small external stores (`createStore` / `useStore`); the toast and search notes hold finished strings.
- **Tooling**: Storybook (`@storybook/react-vite`) has theme, viewport and safe-area globals in `.storybook/preview.tsx`. `tests/stories.test.tsx` renders every story through `composeStories` with Testing Library in happy-dom. There is no Playwright suite yet.

## Goals / Non-Goals

**Goals:**

- One place per language for all strings.
- The type checker catches a German key that is missing.
- Switching language re-renders through React, without a reload and without remounting the chart.
- `src/core` stays free of UI state: its formatters take the locale as an argument.

**Non-Goals:**

- Languages beyond English and German. The design allows adding one: a new dictionary plus one entry in the language list.
- Translating map labels. The basemap uses the names in the tiles.
- Translating server error bodies.
- Plural rules beyond one and other.

## Decisions

### 1. A small in-house i18n module, not a library

- **Where**: `src/i18n/` holds:
  - `en.ts`: the source dictionary, `as const`, with flat dotted keys such as `toolbar.route` or `nav.offCourse`
  - `de.ts`, typed `Record<keyof typeof en, string>`
  - `index.ts`, which exports `t(key, params?)`, `language()`, `setLanguage()`, `resolveLanguage(choice, languages)` and a number formatter `num(value, fractionDigits)`
- **Interpolation**: `{name}` placeholders.
- **Plurals**: expressed as separate keys (for example `track.points.one` and `track.points.other`), picked with `Intl.PluralRules`.
- **Alternatives considered**:
  - `i18next` adds about 40 kB and runtime plugins for a two-language app.
  - `Intl.MessageFormat` is not shipped in browsers.
  - JSON dictionaries lose the compile-time completeness check.

### 2. Language resolution and storage

- **Setting**: `Settings.language: 'auto' | 'en' | 'de'`, default `'auto'`.
- **Resolution**: `resolveLanguage` walks `navigator.languages` in order and returns the first of `de` or `en` whose primary subtag matches. If there is no match, it returns `en`.
- **When it runs**: on start, and on every settings change, so a device language change is picked up at the next launch.
- **Persistence**: the choice persists through the existing `saveSettings`. Safari and the home-screen app each keep their own storage, so each remembers its own choice. With Auto, both follow the device language.

### 3. Live switching through React

1. `App.updateSettings({ language })` resolves the language and calls `setLanguage(...)`.
2. `setLanguage` sets `document.documentElement.lang` and notifies its subscribers.
3. `updateSettings` then calls `emit()` as for any other setting.

- **A language value components re-render on**: `src/i18n/index.ts` keeps the current language with a subscribe function; `useLanguage()` (in `src/ui/store.ts`, via `useSyncExternalStore`) returns it. Components call `t()` while rendering, so a re-render is all a relabel needs.
- **Who subscribes**: the shell, so the toolbar, floating buttons, chart notice, alarm, instrument bar, guidance strip and the open sheet re-render with it. Components whose element is kept outside the shell's render also subscribe themselves: the destination card and the seamark card (both stored as elements in the destination bar's store) and the disclaimer (shown before the App has loaded).
- **Sheet titles**: `openSheet` takes the title as a string or a function; the panels pass a function (`() => t('sheet.settings')`), so an open sheet's head relabels too. Its body re-renders like any other; React keeps its form controls.
- **Stored texts**: the toast and search notes are worded when they are shown. A search note or heading is stored as a function that words it at render time, so an open result list relabels; a toast already on screen keeps its language until it fades.
- **Never remount**: keying the tree by language would relabel everything too, but it would recreate the chart's element under MapLibre and drop half-typed input, so it is not used.
- **Start-up**: `src/main.tsx` reads the stored setting and sets the language before `showDisclaimerOnce()`, so the first disclaimer is already in the device's language; `App.init()` sets it again from the same settings.
- **Alternative considered**: reloading the page on change. It is simpler, but it breaks a running track or anchor watch and violates the requirement.

### 4. Maneuver text built on the client from structured fields

- **Routing API**: `Maneuver` gains two optional fields:
  - `name?: string | null`: the waterway, lock, bridge or destination name. The server always sets it on every maneuver, using `null` when there is no name, so the field's presence marks a structured maneuver.
  - `stop?: number`: the via-stop number
- **Server**: `routing.ts` keeps producing the English `text` exactly as today. The lock-pair merge and older clients depend on it, so the API change is additive.
- **Client**: `maneuverText(m)` in `src/i18n/maneuvers.ts` builds the text from `type`, `name`, `stop` and `clearance` with `t(...)`.
  - It falls back to `m.text` only when the `name` field is absent (`!('name' in m)`). That covers cached courses from before the change and older servers. A structured maneuver with `name: null` is still translated: an unnamed lock, a fixed bridge with only a clearance, a via stop with its number.
  - It is used by the strip, the route sheet and voice prompts.
  - A maneuver saved as a waypoint keeps the name produced at save time, in the current language.
- **Alternative considered**: translating on the server with an `Accept-Language` header. Rejected for three reasons:
  - it ties cached offline courses to the language they were fetched in
  - switching language would need a network round trip, which is often unavailable on the water
  - it duplicates strings on the server

### 5. Voice prompts

- **Phrases**: `Announcer` takes a phrase function `(metres, text) => string`, supplied from i18n. English gives "In 500 metres, …", German "In 500 Metern, …".
- **Speech**: `speak(text, lang)` sets `u.lang` to `de-DE` or `en-GB`. Safari picks an installed voice for that language, or its default voice if there is none.

### 6. Numbers and times

- **Locale argument**: `formatSpeed`, `formatDistance`, `formatCoord`, `formatDuration` and `formatTime` take a trailing `locale: 'en' | 'de' = 'en'`.
- **Decimals**: decimal digits are produced as today with fixed precision, then `.` becomes `,` for German. This keeps the output identical to today for English, with no grouping separators and exactly the same rounding.
- **Times**: `formatTime` passes the locale to `toLocaleTimeString` with `hourCycle: 'h23'`.
- **Call sites**: UI call sites pass `language()`.
- **Alternative considered**: `Intl.NumberFormat`. It adds thousands separators (1.250 in German), which would change the English output and confuse distance readings. Its rounding could also differ from the existing unit tests.

### 7. Storybook

- **Language global**: a new `language` global (English / Deutsch) in `.storybook/preview.tsx`. Its decorator calls `setLanguage` before the story renders, which also sets the page language.
- **New German stories** in the `.stories.tsx` files, each pinned with `globals: { language: 'de' }` and checked in day and night themes, at 360 px and 390 px iPhone widths, and on iPad portrait and landscape:
  - `Navigation/Guidance strip / German long maneuver`: "Scharf rechts abbiegen in Amsterdam-Rijnkanaal"
  - `Navigation/Guidance strip / German off course`
  - `Navigation/Guidance strip / German waiting for GPS`: the denied state
  - `Destination card / German opening bridge`: Vaarweginformatie info
  - `Navigation/Instruments / German good fix`: decimal commas
  - `Disclaimer / German`
  - `Sheets/Settings / German`: the Language control
- **Empty, loading and error states**: they have no language-specific layout. The German waiting and denied strips cover the error state.
- **Tests**: `tests/stories.test.tsx` composes every story with the preview's annotations and renders it once per language; a story's own `globals.language` wins.

### 8. Layout, safe areas and standalone mode

- **Layout**: no layout rules change, apart from narrow fixes found by the German stories at 360 px. German labels are longer, so the toolbar keeps its five equal columns with `min-width: 0` and allows the label to shrink font or ellipsize. The guidance strip and destination card already ellipsize long text. Where a German word does not fit its control, a shorter German word is preferred over a layout change.
- **Unchanged**: safe-area insets, viewport-height handling and standalone-mode behaviour.
- **Verification**: the German stories at 360 px and on iPad split-view widths, plus a device check.

### Test strategy, failing tests first

1. **Unit** (Vitest, node):
   - `tests/i18n.test.ts`:
     - `resolveLanguage` for de-first, nl-then-en, fr-only and an explicit choice
     - dictionary completeness: every English key exists in German, no value is empty, placeholder sets are equal
     - `t()` interpolation and plurals
   - `tests/units.test.ts`: German decimals and times.
   - `tests/maneuver-text.test.ts`:
     - every `ManeuverType` in both languages
     - the fallback to `text`
   - `tests/course.test.ts`: German announcer phrases.
2. **Server**: `tests/routing.test.ts` and `tests/server.test.ts`:
   - maneuvers carry `name`, and `stop` for via points
   - `text` is unchanged
3. **DOM** (Vitest, happy-dom, Testing Library): `tests/language-switch.test.tsx` renders `<Shell>` over a real `App` with a stub map. Switching to German relabels the toolbar, floating buttons, notice and an open sheet, sets `<html lang="de">`, and keeps an armed state. The component tests (`instruments`, `panels`, `destination`, `search`, `seamark-card`, `disclaimer`) gain German cases.
4. **Stories**: `tests/stories.test.tsx`, extended to render in both languages.
5. **Guard**: `tests/untranslated.test.ts` parses `src/ui/**/*.tsx` with Vite's `parseAst` and fails on English JSX text or on an English string literal in a `title`, `aria-label`, `placeholder` or `alt` attribute, with an allowlist for symbols, units and instrument abbreviations.
6. **Device**: manual checks on iPhone and iPad, in the Safari tab and the home-screen app. There is no Playwright suite in the repo, so a browser-level test is out of scope here.

## Risks / Trade-offs

- **[A string is missed and stays English]** → The completeness test covers the dictionaries, but not literals left in code. Mitigation: the guard test parses the components and fails on English JSX text or English `title` / `aria-label` / `placeholder` / `alt` literals in `src/ui`, with an allowlist for symbols like "✕" and "⚑". Strings passed through props (such as a `label` prop) are only caught where they are written as JSX text or attributes.
- **[A kept element does not relabel]** → An element stored outside the shell's render (a card in the destination bar) is reused as is. Mitigation: those components subscribe to the language themselves, and the switch test covers the destination card.
- **[German text overflows on 360 px]** → German stories at 360 px, plus the ellipsis rules above, plus the device check.
- **[No German voice installed]** → Safari speaks with its default voice. This is accepted, and the Settings hint says so.
- **[Cached courses keep English maneuvers]** → They fall back to their `text` until the course is recalculated. This is accepted and specified.
- **[A comma in coordinates looks unfamiliar to some German users]** → This follows German chart conventions. Revisit if users object.

## Migration Plan

- **Settings**: `language` defaults to `'auto'` when missing from stored settings, through the existing `{ ...DEFAULT_SETTINGS, ...stored }` merge. No data migration is needed.
- **Deploy order**: the server change is additive, so server and web images can deploy in either order.
- **Rollback**: redeploy the previous images. Stored settings keep an unused `language` key, which is harmless.
