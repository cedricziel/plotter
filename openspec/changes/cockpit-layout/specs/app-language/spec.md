## MODIFIED Requirements

### Requirement: Switching without reload

Changing the language SHALL relabel everything on screen at once, without a reload and without losing state:

- the dashboard, the menu, the status card, the map-button labels, the chart notice and the guidance card
- any open sheet
- the page language exposed to assistive technology

An active route, a recording track and an armed anchor watch SHALL keep running.

#### Scenario: Switching while navigating

- **WHEN** a route is active, the Settings sheet is open, and the user picks Deutsch
- **THEN** the menu reads Ziel suchen, Ziel auf der Karte setzen, Route & Wegpunkte, Trackaufzeichnung, Ankeralarm, Nachtpalette and Einstellungen, the chart notice and the guidance card are in German, the Settings sheet stays open in German, and guidance continues

#### Scenario: Screen reader language

- **WHEN** the language is German
- **THEN** the page declares German as its language, so VoiceOver on iPhone and iPad reads the labels with a German voice

### Requirement: Layout in German

German labels SHALL fit the same layout as English, with nothing clipped or wider than the screen, in these places:

- the dashboard, the menu, the guidance card, the destination card and the sheets
- widths from 360 px up and on iPad split-view widths
- the day and night themes, in the Safari tab and in the home-screen app

#### Scenario: Narrow iPhone in German

- **WHEN** the language is German on a 360 px wide screen, in day or night theme, with a long maneuver such as "Scharf rechts abbiegen in Amsterdam-Rijnkanaal"
- **THEN** the menu items, the guidance card and its stop button are fully visible and nothing overflows horizontally

#### Scenario: iPad split view in German

- **WHEN** the language is German and the app runs in a narrow iPad split-view width
- **THEN** the menu and the open sheet show their German labels without clipping
