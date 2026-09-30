## Why

The screen stacks four opaque bands: the instrument bar, the guidance strip, the chart, and a five-button toolbar. The chart gets what is left, and on a phone in landscape that is a thin strip. The redesign in the claude.ai/design project "Plotter redesign" compares three directions. This change implements direction B, "Cockpit": the chart fills the screen, the readings sit in one dashboard at the bottom, and one menu button there replaces the toolbar.

## What Changes

- The chart fills the whole screen. Everything else floats over it on translucent "glass" panels (solid black at night).
- **Dashboard** at the bottom: the menu button and the instrument cells. Not navigating: SOG, COG and GPS. Navigating: SOG, DTW and ETA on a phone; SOG, COG, DTW, XTE (or VMG), ETA and END from 720 px wide. Units are set small after each value. SOG still switches km/h and knots when tapped.
- **Menu**: the menu button opens a list above the dashboard (beside it on short screens): Search destination, Set destination on map, Route & waypoints, Track recording, Anchor alarm, Night/Day palette, Settings. It closes on a pick, a tap outside, or Escape. This replaces the toolbar and the "set destination" map button.
- **Guidance card** at the top while navigating: maneuver icon, distance, maneuver text, stop button, steer cue and the next waypoint. The leg's numbers move into the dashboard.
- **Status pill** at the top left when not navigating: GPS state and accuracy, and "REC m:ss" while a track records.
- **Map buttons**: one glass column on the right with zoom in, zoom out, orientation, follow and seamarks. Centred on a phone in portrait, at the top on wide or short screens. Below 480 px high the zoom buttons are hidden; pinch zooms.
- **Sheets**: glass, rounded. On a phone above the dashboard, so the readings stay visible; from 720 px wide a 440 px full-height side panel on the right (as wide as before, so route legs fit), and the dashboard ends before it.
- **Destination card and placement bar**: glass, above the dashboard; from 720 px wide 520 px wide on the left, so the German button labels fit.
- The instrument bar no longer shows the position or the time. The device status bar shows the time. The position is no longer on the main screen; see the open question in the pull request.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `plotter-screen`: Screen layout, Instrument bar, Turn-by-turn guidance and Night mode are rewritten for the dashboard, menu, guidance card and status pill.

## Impact

- iPhone (Safari and home-screen app): all floating parts respect the safe-area insets (top, bottom, left and right). The dashboard sits 12 px into the home-indicator inset, as in the design. In landscape the menu opens beside the menu button so it fits the 390 px height.
- iPad: from 720 px wide (portrait, landscape and wide split views) the dashboard shows the whole leg, the guidance card is 400 px wide on the left, and sheets are a full-height side panel.
- Tests written first:
  - `tests/instruments.test.tsx`: the dashboard cells off and on a route, which cells are wide-only, ETA and END values, the guidance card's distance and text, German labels.
  - `tests/screen.test.tsx`: the menu opens and closes, lists its items, offers the day palette at night, runs `beforeTool` before a tool, and closes on Escape; `navigating` on the root; the REC timer in the status pill.
  - `tests/language-switch.test.tsx`: the menu and status pill relabel on a language switch.
  - `tests/layout/overflow.spec.ts`: all stories at 360, 390, 820 and 1180 px, day and night, English and German.
- Stories: `Chrome/Menu` replaces `Chrome/Toolbar`. `Navigation/Instruments` shows the dashboard and gains Navigating stories. `Navigation/Guidance strip` becomes `Navigation/Guidance card`. `Pages/Plotter screen` is the review surface for the whole layout.
