# Design

## Context

- **Where the text comes from today**: every user-visible string is an English literal in one of these places:
  - `src/ui/*.ts`, built with `h(...)`
  - `src/app.ts` and `src/update.ts`, as toasts
  - `index.html`: toolbar labels, `aria-label`s, the chart notice and the alarm
- **Maneuvers**:
  - Routing runs on the server only (`server/app.ts` → `src/core/routing.ts`). Each `Maneuver` carries a finished English `text` built from the maneuver type and a waterway or object name.
  - The client caches maneuvers with a charted course (`src/services/courses.ts`).
  - The client reads `text` in the guidance strip (`instruments.ts`), the route sheet (`panels.ts`) and voice prompts (`app.ts` → `Announcer`).
  - It also reads `text` when a maneuver becomes a waypoint name (`app.ts`).
  - `routing.ts` itself relies on the English text: it matches `'(lock)'` to merge lock pairs.
- **Formatting**: `src/core/units.ts` formats with `toFixed` (always a decimal point) and `toLocaleTimeString([], …)`.
- **Speech**: `src/services/voice.ts` hard-codes `u.lang = 'en-GB'`.
- **Rendering**: the UI re-renders on `app.emit()`:
  - the instrument bar is built once and patched in place
  - the guidance strip is patched with `patchChildren`
  - an open sheet is refreshed through `updateSheet`, which replaces the body when its skeleton changes
- **Tooling**: Storybook exists with theme, viewport and safe-area globals, and `tests/stories.test.ts` renders every story in happy-dom. There is no Playwright suite yet.

## Goals / Non-Goals

**Goals:**

- One place per language for all strings.
- The type checker catches a German key that is missing.
- Switching language re-renders through the existing emit path, without a reload.
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

### 3. Live switching through the existing render path

1. `App.updateSettings({ language })` calls `setLanguage(...)`.
2. It then applies the static labels.
3. It then calls `emit()`.

- **Static labels**: static elements in `index.html` get `data-i18n="key"`, and `data-i18n-attr="aria-label:key;title:key"` where needed. `applyStaticLabels(document)` sets them and sets `document.documentElement.lang`.
- **Instrument bar**: its label cells are updated in the render function, which already runs on each emit, instead of only at mount.
- **Open sheet**: its skeleton changes when the language changes, so `updateSheet` replaces it. Form controls are kept by the existing control-preservation logic.
- **Guidance strip**: `patchChildren` updates its text in place and keeps its buttons.
- **Alternative considered**: reloading the page on change. It is simpler, but it breaks a running track or anchor watch and violates the requirement.

### 4. Maneuver text built on the client from structured fields

- **Routing API**: `Maneuver` gains two optional fields:
  - `name?: string | null`: the waterway, lock, bridge or destination name
  - `stop?: number`: the via-stop number
- **Server**: `routing.ts` keeps producing the English `text` exactly as today. The lock-pair merge and older clients depend on it, so the API change is additive.
- **Client**: `maneuverText(m)` in `src/i18n/maneuvers.ts` builds the text from `type`, `name`, `stop` and `clearance` with `t(...)`.
  - It falls back to `m.text` when `name` is `undefined`. That covers cached courses from before the change and older servers.
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

- **Language global**: a new `language` global (English / Deutsch) in `.storybook/preview.ts`. The decorator calls `setLanguage` and `applyStaticLabels` before each story renders.
- **New German stories**, each checked in day and night themes, at 360 px and 390 px iPhone widths, and on iPad portrait and landscape:
  - `Guidance strip / German long maneuver`: "Scharf rechts abbiegen in Amsterdam-Rijnkanaal"
  - `Guidance strip / German off course`
  - `Guidance strip / German waiting for GPS`: the denied state
  - `Destination card / German opening bridge`: Vaarweginformatie info
  - `Instrument bar / German good fix`: decimal commas
  - `Disclaimer / German`
- **Empty, loading and error states**: they have no language-specific layout. The German waiting and denied strips cover the error state.
- **Tests**: `tests/stories.test.ts` renders every story once per language.

### 8. Layout, safe areas and standalone mode

- **Layout**: no layout rules change. German labels are longer, so the toolbar keeps its five equal columns with `min-width: 0` and allows the label to shrink font or ellipsize. The guidance strip and destination card already ellipsize long text.
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
3. **DOM** (Vitest, happy-dom): `tests/language-switch.test.ts`. Switching to German relabels the static toolbar and notice and an open sheet, sets `<html lang="de">`, and keeps an armed state.
4. **Stories**: `tests/stories.test.ts`, extended to render in both languages.
5. **Device**: manual checks on iPhone and iPad, in the Safari tab and the home-screen app. There is no Playwright suite in the repo, so a browser-level test is out of scope here.

## Risks / Trade-offs

- **[A string is missed and stays English]** → The completeness test covers the dictionaries, but not literals left in code. Mitigation: a grep-based test fails on `h(` calls with a string literal child in `src/ui`, with an allowlist for symbols like "✕" and "⚑".
- **[German text overflows on 360 px]** → German stories at 360 px, plus the ellipsis rules above, plus the device check.
- **[No German voice installed]** → Safari speaks with its default voice. This is accepted, and the Settings hint says so.
- **[Cached courses keep English maneuvers]** → They fall back to their `text` until the course is recalculated. This is accepted and specified.
- **[A comma in coordinates looks unfamiliar to some German users]** → This follows German chart conventions. Revisit if users object.

## Migration Plan

- **Settings**: `language` defaults to `'auto'` when missing from stored settings, through the existing `{ ...DEFAULT_SETTINGS, ...stored }` merge. No data migration is needed.
- **Deploy order**: the server change is additive, so server and web images can deploy in either order.
- **Rollback**: redeploy the previous images. Stored settings keep an unused `language` key, which is harmless.
