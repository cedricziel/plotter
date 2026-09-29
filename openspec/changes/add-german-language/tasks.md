# Tasks

## 1. i18n core

- [ ] 1.1 **Language resolution (test first).** Write `tests/i18n.test.ts` for `resolveLanguage`: de-first → `de`, nl-then-en → `en`, fr-only → `en`, and an explicit `en`/`de` choice wins over the device. Show it failing, then implement `resolveLanguage`, `language()` and `setLanguage()` in `src/i18n/index.ts`. Verify: the tests pass.
- [ ] 1.2 **Dictionaries (test first).** Add tests that every key in `en` exists in `de`, no German value is empty, and each key has the same set of `{placeholders}` in both. Add `t()` interpolation and one/other plural tests. Implement `src/i18n/en.ts`, `src/i18n/de.ts` (typed `Record<keyof typeof en, string>`) and `t()`. Verify: the tests pass and `npm run typecheck` fails when a German key is deleted.
- [ ] 1.3 **Setting.** Add `language: 'auto' | 'en' | 'de'` (default `'auto'`) to `Settings`. Extend `tests/i18n.test.ts` so stored settings without `language` load as `'auto'`. Verify: the tests pass.

## 2. Numbers and times

- [ ] 2.1 **German formatting (test first).** Extend `tests/units.test.ts` with German cases: `9,7`, `1,25 km`, `0,53 NM`, `53°05,288′N`, `005°50,524′E`, `1 h 05 min`, and a 24-hour `13:46`. Keep the existing English expectations unchanged. Implement the `locale` argument in `src/core/units.ts`. Verify: all unit tests pass with unchanged English output.

## 3. Maneuvers and voice

- [ ] 3.1 **Maneuver fields (test first).** Extend `tests/routing.test.ts` (and `tests/server.test.ts` for the API response) so maneuvers carry `name`, and `stop` for via points, while `text` stays byte-identical to today. Implement it in `src/core/routing.ts`. Verify: the routing and server tests pass.
- [ ] 3.2 **Maneuver texts (test first).** Write `tests/maneuver-text.test.ts` covering every `ManeuverType` in both languages:
  - turn into a name
  - continue on a name
  - lock with and without a name
  - opening and fixed bridge with clearance "5,4 m" in German
  - via stop number
  - arrive with and without a destination
  - the fallback to `text` when `name` is undefined

  Implement `src/i18n/maneuvers.ts`. Verify: the tests pass.

- [ ] 3.3 **Voice prompts (test first).** Extend `tests/course.test.ts` so `Announcer` with the German phrase function returns "In 500 Metern, rechts abbiegen in Pikmar" and "In 100 Metern, …". Implement the phrase function argument, and `speak(text, lang)` with `de-DE` / `en-GB` in `src/services/voice.ts`. Verify: the tests pass.

## 4. Live switching and static labels

- [ ] 4.1 **Switching test first.** Write `tests/language-switch.test.ts` (happy-dom), loading `index.html`'s body markup. Setting German must:
  - relabel the toolbar to Route, Track, Anker, Nacht and Menü, with German `aria-label`s on the floating buttons
  - relabel the chart notice to "Nur Navigationshilfe – nicht zur Navigation"
  - set `<html lang="de">`
  - relabel an open Settings sheet to German while it stays open

  Show it failing.

- [ ] 4.2 **Static labels.** Add `data-i18n` / `data-i18n-attr` to `index.html`, implement `applyStaticLabels()`, and wire `App.updateSettings` and startup to `setLanguage` → `applyStaticLabels` → `emit`. Verify: the 4.1 tests pass.

## 5. Translate the UI (each task: strings to `t()`, German entries, stories)

- [ ] 5.1 **Instrument bar and guidance strip.**
  - Translate their labels in `src/ui/instruments.ts`, including the waiting/denied texts, stop and recalculate. Use `maneuverText` and `language()` for numbers.
  - Add the stories `Instrument bar / German good fix`, `Guidance strip / German long maneuver`, `German off course` and `German waiting for GPS`.
  - Verify: `tests/stories.test.ts` and `tests/instruments.test.ts` pass, and the German stories show no horizontal overflow at 360 px in day and night themes.
- [ ] 5.2 **Sheets.**
  - Translate route, track, anchor, waypoint and settings (`src/ui/panels.ts`), including the route sheet's maneuver list through `maneuverText`.
  - Add the Language control (Auto / English / Deutsch) to Settings, with a hint that spoken prompts use the device's voice.
  - Extend `tests/panels.test.ts` so the Language control saves `language`.
  - Verify: the tests pass.
- [ ] 5.3 **Destination card, search, disclaimer, alarm, toasts and update prompt.**
  - Translate `src/ui/destination.ts`, `search.ts`, `disclaimer.ts`, the alarm in `index.html`, the toasts in `src/app.ts` and `src/update.ts`, and `dom.ts` helpers.
  - Add the stories `Destination card / German opening bridge` and `Disclaimer / German`.
  - Verify: `tests/stories.test.ts` passes.
- [ ] 5.4 **Voice wiring.** In `src/app.ts`, pass the i18n phrase function and `language()` to the announcer and `speak`. Verify: extend `tests/course.test.ts` or an app-level unit test to assert the German prompt is passed with `de-DE`.
- [ ] 5.5 **Guard against missed strings.** Add a test that scans `src/ui/*.ts` for `h(...)` calls with an English letter in a string-literal child or in a `title`/`aria-label` attribute, with an allowlist for symbols. Verify: the test passes after 5.1–5.3 and fails when an English literal is added.

## 6. Storybook language global

- [ ] 6.1 **Global and dual-language render.** Add the `language` global (English / Deutsch) and the decorator that calls `setLanguage` and `applyStaticLabels` in `.storybook/preview.ts`. Extend `tests/stories.test.ts` to render every story in both languages. Verify: `npm test` and `npm run build-storybook` pass.

## 7. Integration and device verification

- [ ] 7.1 **Full checks.** Run `npm run typecheck`, `npm test` and `npm run build`. Verify: all pass.
- [ ] 7.2 **iPhone checks, Safari tab and home-screen app.**
  - German device with Auto → the app opens in German.
  - Switching to English and back while a route is active and the Settings sheet is open → everything relabels, guidance continues, and taps keep working.
  - A German voice prompt plays.
  - No overflow in day and night themes.
  - Record which checks ran.
- [ ] 7.3 **iPad checks, Safari tab and home-screen app.** Portrait, landscape and a narrow split-view width in German: toolbar, strip, destination card and sheets are unclipped. Record the results, or defer them explicitly.
