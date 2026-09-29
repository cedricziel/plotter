## MODIFIED Requirements

### Requirement: Screen layout

The screen SHALL show, from top to bottom, the instrument bar, the guidance strip (only while a destination or route is active), the chart, and the toolbar with Route, Track, Anchor, Night and Menu. The chart SHALL have floating buttons for zoom in, zoom out, seamarks, set destination, map orientation and follow. The floating buttons SHALL stay inside the chart area and SHALL NOT be covered by the destination card or the placement bar. The layout SHALL fill the whole screen without page scrolling and without horizontal overflow at widths from 360 px up.

#### Scenario: Phone portrait

- **WHEN** the app is opened on an iPhone in portrait
- **THEN** the instrument bar, chart and toolbar are all visible, nothing overflows horizontally, and the toolbar reaches the bottom edge above the home indicator

#### Scenario: Home-screen app on iPhone

- **WHEN** the app runs as an installed home-screen web app on an iPhone with a notch or Dynamic Island
- **THEN** no instrument label or value is covered or faded by the status bar, and there is no empty band below the toolbar

#### Scenario: iPad

- **WHEN** the app is used on an iPad in portrait, landscape or a split-view width
- **THEN** the same elements are shown, touch targets keep their size, and the chart uses the remaining space

#### Scenario: Map buttons on a short screen

- **WHEN** the app is used on an iPhone in landscape (844×390) while navigating, with the guidance strip open
- **THEN** all six map buttons are inside the chart area at full touch-target size, and none covers the instrument bar or the guidance strip

#### Scenario: Map buttons with a destination card on iPhone

- **WHEN** a destination card or the placement bar is open on an iPhone in portrait
- **THEN** the zoom buttons sit above the card or bar, whatever its height

#### Scenario: Map buttons with a destination card on iPad and in landscape

- **WHEN** a destination card or the placement bar is open on an iPad in portrait or landscape, or on an iPhone in landscape
- **THEN** the card or bar leaves the button column free, and the zoom buttons are inside the chart area and not behind it
