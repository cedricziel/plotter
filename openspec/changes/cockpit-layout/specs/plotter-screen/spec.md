## MODIFIED Requirements

### Requirement: Screen layout

The chart SHALL fill the whole screen. Over it the screen SHALL show a dashboard at the bottom with the menu button and the instruments, a status pill at the top left (hidden while navigating), the guidance card at the top (only while a destination or route is active), and a column of map buttons on the right for zoom in, zoom out, map orientation, follow and seamarks. The menu button SHALL open a menu with Search destination, Set destination on map, Route & waypoints, Track recording, Anchor alarm, the night or day palette, and Settings. The map buttons SHALL stay inside the screen and SHALL NOT be covered by the destination card or the placement bar. The layout SHALL fill the whole screen without page scrolling and without horizontal overflow at widths from 360 px up.

#### Scenario: Phone portrait

- **WHEN** the app is opened on an iPhone in portrait
- **THEN** the chart fills the screen, the dashboard sits above the home indicator, the map buttons are centred on the right, and nothing overflows horizontally

#### Scenario: Home-screen app on iPhone

- **WHEN** the app runs as an installed home-screen web app on an iPhone with a notch or Dynamic Island
- **THEN** the status pill and the guidance card sit below the status bar, and no part of the dashboard is covered by the home indicator

#### Scenario: iPad

- **WHEN** the app is used on an iPad in portrait, landscape or a split-view width of 720 px or more
- **THEN** the map buttons sit at the top right, sheets open as a full-height panel on the right, and the dashboard ends before an open sheet

#### Scenario: Menu

- **WHEN** the menu button is tapped and then Route & waypoints is picked
- **THEN** the menu closes, any destination card closes, and the Route sheet opens

#### Scenario: Menu on a short screen

- **WHEN** the menu is opened on an iPhone in landscape (844×390)
- **THEN** it opens beside the menu button and every item is inside the screen

#### Scenario: Map buttons on a short screen

- **WHEN** the app is used on an iPhone in landscape (844×390)
- **THEN** the orientation, follow and seamarks buttons sit at the top right at full touch-target size, and the zoom buttons are hidden

#### Scenario: Map buttons with a destination card on iPhone

- **WHEN** a destination card or the placement bar is open on an iPhone in portrait
- **THEN** the zoom buttons sit above the card or bar, whatever its height

### Requirement: Instrument bar

The dashboard SHALL show speed over ground (SOG) in the chosen unit, course over ground (COG) in degrees, and the GPS state with accuracy. While navigating it SHALL show SOG, distance to the next point (DTW) and ETA at the next point, and from 720 px wide also COG, cross-track error or VMG, and ETA at the end. While navigating without a GPS reading, the dashboard SHALL keep the GPS state in view. Values SHALL be marked stale when the last fix is older than 15 seconds. The status pill SHALL show the GPS state and, while a track records, how long it has recorded. While a track records or the anchor watch is armed, the menu button SHALL carry a badge.

#### Scenario: Good fix

- **WHEN** a fix with 6 m accuracy arrives while moving at 9 km/h on 084°
- **THEN** the dashboard shows SOG 9.0, COG 084° and GPS "±6 m"

#### Scenario: Stationary boat

- **WHEN** the boat is (nearly) stationary
- **THEN** COG shows "---°" instead of a noisy value

#### Scenario: Location unavailable

- **WHEN** location permission is denied, or no fix has arrived yet
- **THEN** the GPS cell and the status pill show DENIED or "search…"

#### Scenario: GPS lost while navigating

- **WHEN** the GPS signal is lost while a route is followed
- **THEN** the dashboard shows GPS "LOST" beside the leg's numbers

#### Scenario: Recording

- **WHEN** a track has recorded for one hour
- **THEN** the status pill shows "REC 1:00:00", and the menu button carries a blinking red badge that stays while navigating

### Requirement: Turn-by-turn guidance

While a course or route is active, the guidance card SHALL show the next maneuver with its icon, its distance and its text, a steer cue (or the bearing to the next point while the boat is too slow for one), the next waypoint, and a stop button; the dashboard SHALL show the leg's numbers. Voice prompts SHALL announce upcoming maneuvers when enabled. Leaving the course SHALL be flagged and offer a recalculation, which happens automatically after a while off course.

#### Scenario: Next maneuver

- **WHEN** the next maneuver is a turn into the IJ 253 m ahead
- **THEN** the card shows "253 m" above "Turn left into IJ", with a turn icon

#### Scenario: Off course

- **WHEN** the boat stays well off the course for about 20 seconds
- **THEN** the card shows "Off course — Recalculate", and a new course is charted automatically after about 60 seconds off course

#### Scenario: Waiting for GPS

- **WHEN** a route is active but there is no fix
- **THEN** the card shows the destination and why guidance has not started (location blocked, no signal, or waiting for a fix)

#### Scenario: Narrow screen

- **WHEN** the card shows a long maneuver name on a 360 px wide screen, in day or night theme
- **THEN** nothing is clipped or wider than the screen

### Requirement: Night mode

The Night palette item in the menu SHALL switch the whole screen, chart included, to a dark red palette that keeps night vision, and the Day palette item back. The choice SHALL persist.

#### Scenario: Night on

- **WHEN** Night palette is picked in the menu
- **THEN** the dashboard, chart, guidance card, buttons, menu and sheets use the red-on-black palette, with no bright white areas
