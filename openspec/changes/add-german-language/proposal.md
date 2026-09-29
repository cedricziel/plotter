## Why

Plotter is built for Dutch inland waterways, and many of the recreational boaters there come from Germany. Today every label, prompt and spoken instruction is English. On a moving boat, a skipper should not have to translate "Off course — Recalculate" or "Opening bridge" in their head.

## What Changes

- Add a language setting: **Auto** (default), **English** or **Deutsch**.
  - Auto picks German when the browser's preferred languages put German before English, and English otherwise.
  - The choice is saved with the other settings.
  - Switching takes effect at once, without a reload.
- Translate every user-visible string into German, including:
  - the toolbar, floating-button labels, the chart notice and the instrument bar
  - the guidance strip, and every sheet (route, track, anchor, waypoint, settings)
  - the destination card and search
  - toasts, the anchor alarm, the update prompt and the disclaimer
  - accessible labels and tooltips
- Build maneuver texts on the device from structured data, so they appear in the chosen language, e.g. "Links abbiegen in IJ" or "Schleuse Oranjesluizen passieren". The routing API adds each maneuver's waterway or object name next to the existing English `text`.
  - This change is additive: older clients keep using `text`.
  - Routes cached before the update fall back to `text`.
- Speak voice prompts in the chosen language, e.g. "In 500 Metern, rechts abbiegen in Pikmar", using a German voice when German is chosen.
- Format numbers and times for the chosen language: a decimal comma in German (e.g. 9,7 km/h, 1,25 km, 53°05,288′N). Times stay 24-hour. Units stay metric by default, and SOG and COG keep their abbreviations.
- Set `<html lang>` to the active language, so VoiceOver and hyphenation use it.
- Out of scope, and unchanged:
  - Place and waterway names from OpenStreetMap and Vaarweginformatie.
  - Names of waypoints the user already saved. A waypoint named after a maneuver keeps the language it was created in.
  - Error messages sent by the API server.

## Capabilities

### New Capabilities

- `app-language`:
  - choosing the UI language: automatic detection, the explicit choice, saving it and switching live
  - what is translated and what is not
  - German texts for maneuvers and voice prompts
  - number formatting per language

### Modified Capabilities

- `plotter-screen`: the "Units and settings" requirement adds the language choice to the Menu.

## Impact

- **iPhone and iPad (Safari and home-screen app)**:
  - Auto follows the device language (Settings → General → Language & Region), because Safari exposes it through `navigator.languages`. The home-screen app reads the same value.
  - German labels are longer. Toolbar labels, the guidance strip and the destination card must still fit at 360 px and on iPad split-view widths, in day and night themes, with no horizontal overflow.
  - Spoken prompts use a German voice from `speechSynthesis`. If the device has none, Safari falls back to its default voice. The app does not install voices.
  - There is no change to safe-area or standalone handling.
- **Code**:
  - New `src/i18n/`: the English source dictionary, the German dictionary, `t()`, language resolution and formatters.
  - Hard-coded strings in `src/ui/*.ts`, `src/app.ts` and `src/update.ts` are replaced.
  - `index.html` static labels get `data-i18n`.
  - `src/core/units.ts` formatters take a locale.
  - `src/core/course.ts` (`Announcer`) takes a phrase builder.
  - `src/services/voice.ts` takes a language.
- **Server**: `src/core/routing.ts` adds an optional `name` to each maneuver. The `text` field is kept, so the API change is additive.
- **Dependencies**: none. The i18n layer is a small in-house module, and number and time formatting use `Intl`.
- **Tests, written first**:
  - `tests/i18n.test.ts`:
    - language resolution from settings and `navigator.languages`
    - the German dictionary covers every English key, with no empty values and the same `{placeholders}`
    - `t()` interpolation
  - `tests/units.test.ts`: decimal comma and time format for German.
  - `tests/maneuver-text.test.ts`:
    - German and English texts for every maneuver type
    - the fallback to `text` when `name` is missing
  - `tests/course.test.ts`: German `Announcer` prompts.
  - `tests/routing.test.ts`: every maneuver carries a `name` field (`null` when unnamed).
  - `tests/language-switch.test.ts` (happy-dom): changing the setting relabels the toolbar, notice and an open sheet without a reload, and sets `<html lang>`.
  - `tests/stories.test.ts`: renders every story in both languages.
- **Storybook**:
  - A new **Language** toolbar global (English / Deutsch) in `.storybook/preview.ts`.
  - New German stories:
    - `Guidance strip`: long German maneuver, off course, waiting for GPS
    - `Destination card`: opening bridge
    - `Instrument bar`: good fix, with decimal commas
    - `Disclaimer` in German
  - The existing stories keep their English states.
