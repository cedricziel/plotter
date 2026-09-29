# plotter-screen Specification

## Purpose

The plotter screen is the app's single main view: a chart centred on the boat with live instruments, destination and course handling, turn-by-turn guidance, and quick access to routes, tracks, the anchor alarm, night mode and settings, usable one-handed on a phone on a moving boat.

## Requirements

### Requirement: Screen layout

The screen SHALL show, from top to bottom, the instrument bar, the guidance strip (only while a destination or route is active), the chart, and the toolbar with Route, Track, Anchor, Night and Menu. The chart SHALL have floating buttons for zoom in, zoom out, seamarks, set destination, map orientation and follow. The layout SHALL fill the whole screen without page scrolling and without horizontal overflow at widths from 360 px up.

#### Scenario: Phone portrait

- **WHEN** the app is opened on an iPhone in portrait
- **THEN** the instrument bar, chart and toolbar are all visible, nothing overflows horizontally, and the toolbar reaches the bottom edge above the home indicator

#### Scenario: Home-screen app on iPhone

- **WHEN** the app runs as an installed home-screen web app on an iPhone with a notch or Dynamic Island
- **THEN** no instrument label or value is covered or faded by the status bar, and there is no empty band below the toolbar

#### Scenario: iPad

- **WHEN** the app is used on an iPad in portrait, landscape or a split-view width
- **THEN** the same elements are shown, touch targets keep their size, and the chart uses the remaining space

### Requirement: Safety notice

The app SHALL show a disclaimer that it is a navigation aid only and not for navigation, which the user must acknowledge at most once every 12 hours on a device, and SHALL keep a permanent short notice on the chart. A tap or click anywhere on the disclaimer SHALL acknowledge it, including on iPhone and iPad while the chart is busy.

#### Scenario: First open

- **WHEN** the app is opened and the disclaimer has not been acknowledged in the last 12 hours
- **THEN** the disclaimer is shown and the chart is usable only after it is acknowledged

#### Scenario: Reload or crashed tab

- **WHEN** the app is reloaded, or Safari reloads a crashed tab, within 12 hours of acknowledging
- **THEN** the disclaimer is not shown again and the chart notice "Navigation aid only – not for navigation" stays visible

#### Scenario: Tap on iPhone while navigating

- **WHEN** the disclaimer is shown on an iPhone while a course is being followed
- **THEN** a single tap on "I understand" dismisses it, and a long press does not select its text

### Requirement: Instrument bar

The instrument bar SHALL show speed over ground (SOG) in the chosen unit, course over ground (COG) in degrees, the position in degrees and decimal minutes, the local time, and the GPS state with accuracy. Values SHALL be marked stale when the last fix is older than 15 seconds.

#### Scenario: Good fix

- **WHEN** a fix with 6 m accuracy arrives while moving at 9 km/h on 084°
- **THEN** the bar shows SOG 9.0, COG 084°, the position, and GPS "±6 m"

#### Scenario: Stationary boat

- **WHEN** the boat is (nearly) stationary
- **THEN** COG shows "---°" instead of a noisy value

#### Scenario: Location unavailable

- **WHEN** location permission is denied, or no fix has arrived yet
- **THEN** the GPS state shows DENIED or "search…", and the position shows placeholders

### Requirement: Chart

The chart SHALL render the offline Netherlands vector chart when it is available and fall back to online OpenStreetMap tiles when it is not, SHALL show waterways, water, bridges, harbours and place names, and SHALL draw seamarks as vector symbols, toggled with the seamarks button. The user SHALL be able to pan and zoom but not rotate the chart by gesture. The chart attribution SHALL name the sources of what is shown.

#### Scenario: Offline chart present

- **WHEN** the offline chart file is reachable
- **THEN** the chart renders from it, including while the device is offline

#### Scenario: Offline chart missing

- **WHEN** the offline chart file cannot be loaded
- **THEN** online OpenStreetMap tiles are used and a notice says so

#### Scenario: Seamarks toggle

- **WHEN** the seamarks button is tapped
- **THEN** the vector seamark symbols are shown or hidden and the choice is remembered

#### Scenario: Attribution

- **WHEN** the OpenSeaMap overlay is off
- **THEN** the chart attribution does not mention OpenSeaMap, and it mentions OpenSeaMap once the overlay is turned on

### Requirement: Own boat and course line

The chart SHALL show the boat at its GPS position, pointing along COG, with a course line projecting the COG for the configured number of minutes ahead.

#### Scenario: Moving boat

- **WHEN** the boat moves at 9 km/h on 084° with a 10-minute course line
- **THEN** the boat symbol points to 084° and the course line extends about 1.5 km ahead

### Requirement: Follow mode and map orientation

In follow mode the chart SHALL keep the boat in view as fixes arrive. Panning SHALL leave follow mode; the follow button SHALL return to it. While following an active route, the chart SHALL rotate so the course points up (course-up, the default) or stay north-up when the orientation button selects north-up; the choice SHALL persist. Without an active route the chart SHALL be north-up. The orientation button SHALL always show where north is.

#### Scenario: Course-up while navigating

- **WHEN** a route is active, follow mode is on, and the boat moves on COG 084°
- **THEN** the chart bearing follows COG (ignoring changes below 5°), and the boat sits in the lower part of the screen to show more water ahead

#### Scenario: North-up toggle

- **WHEN** the orientation button is tapped while course-up
- **THEN** the chart turns north-up with the boat centred, and stays north-up after a reload

#### Scenario: Navigation ends

- **WHEN** navigation is stopped
- **THEN** the chart returns to north-up

### Requirement: Adaptive zoom while navigating

While following an active route, the chart SHALL zoom to show about two minutes of travel ahead (at least 300 m, at most 3 km), zooming in as the next maneuver approaches, within zoom levels 12 to 17 and without reacting to small changes. A manual zoom SHALL pause adaptive zoom until the follow button is tapped.

#### Scenario: Approaching a turn

- **WHEN** the next maneuver is 150 m ahead
- **THEN** the chart zooms in further than when the next maneuver is 2 km ahead at the same speed

#### Scenario: Manual zoom

- **WHEN** the user zooms with the buttons or a pinch while following
- **THEN** the zoom stays where the user left it until the follow button is tapped

### Requirement: Choosing a destination

The user SHALL be able to choose a destination by searching (places, harbours, marinas, locks, bridges, towns, waterways; accent-insensitive; results ordered by relevance and distance), by placing a crosshair with the set-destination button, or by tapping a mark or town name on the chart. Each path SHALL offer Chart course, Go straight here and Add as stop.

#### Scenario: Search

- **WHEN** "hoorn" is searched
- **THEN** Hoorn is offered with its kind and distance, and selecting it opens its destination card

#### Scenario: Crosshair

- **WHEN** the set-destination button is tapped
- **THEN** a crosshair appears with a live distance and bearing readout, and Chart course, Go here, Add as stop and Cancel

#### Scenario: Tap a mark

- **WHEN** a marina mark is tapped at zoom 11 or more
- **THEN** its card opens with its name, kind, distance and bearing and, where known, VHF channel, phone link, website link, opening hours, berths, operator and clearance

### Requirement: Charted course

Chart course SHALL plan a route along the waterways from the boat's position, respecting the vessel's air draft, draft and beam; a town destination SHALL end at a harbour or marina near it. The course SHALL be drawn on the chart with the part behind the boat dimmed, and the whole course SHALL be shown briefly before follow mode resumes. Problems SHALL be stated plainly, falling back to a straight line only when no course can be charted.

#### Scenario: Course to a harbour

- **WHEN** Chart course is tapped for Hoorn from the IJ in Amsterdam
- **THEN** a course of about 49 km via the Oranjesluizen and the Markermeer is drawn, the whole course is shown, and following resumes after about 5 seconds

#### Scenario: Bridge too low

- **WHEN** the air draft is higher than a fixed bridge's known clearance
- **THEN** the course avoids that bridge, or warns that no course avoids it

#### Scenario: No GPS fix

- **WHEN** Chart course is tapped without a fix
- **THEN** the user is told a fix is needed, or that location is blocked for this site

### Requirement: Turn-by-turn guidance

While a course or route is active, the guidance strip SHALL show the next maneuver with its distance and icon, a steer cue, distance and bearing to the next point, cross-track error or VMG, and ETA to the next point and to the end, with a stop button. Voice prompts SHALL announce upcoming maneuvers when enabled. Leaving the course SHALL be flagged and offer a recalculation, which happens automatically after a while off course.

#### Scenario: Next maneuver

- **WHEN** the next maneuver is a turn into the IJ 253 m ahead
- **THEN** the strip shows "In 253 m — Turn left into IJ" with a turn icon

#### Scenario: Off course

- **WHEN** the boat stays well off the course for about 20 seconds
- **THEN** the strip shows "Off course — Recalculate", and a new course is charted automatically after about 60 seconds off course

#### Scenario: Waiting for GPS

- **WHEN** a route is active but there is no fix
- **THEN** the strip shows the destination and why guidance has not started (location blocked, no signal, or waiting for a fix)

#### Scenario: Narrow screen

- **WHEN** the strip shows a long maneuver name on a 360 px wide screen, in day or night theme
- **THEN** nothing is clipped or wider than the screen

### Requirement: Offline trips

The user SHALL be able to save a charted course for offline use, which stores the chart tiles, routing data and places along it after confirming the download size. Saved trips SHALL allow searching those places and recharting within the corridor while offline.

#### Scenario: Save and use offline

- **WHEN** a course to Zaandam is saved (about 5 MB) and the device then goes offline
- **THEN** the trip is still listed after a reload, searching offers its places, and a course inside the corridor can be charted

#### Scenario: Outside the corridor

- **WHEN** a destination outside every saved corridor is charted while offline
- **THEN** no offline course is offered, and the user is told why

### Requirement: Waypoints and routes

The user SHALL be able to add a waypoint by long-pressing the chart, rename and move it, build routes from waypoints, navigate a route leg by leg, and import and export routes and waypoints as GPX. Waypoints and routes SHALL persist on the device.

#### Scenario: Long-press

- **WHEN** the chart is long-pressed
- **THEN** a waypoint is created there and its sheet opens, without also opening a place card

#### Scenario: Persistence

- **WHEN** the app is reloaded
- **THEN** waypoints and routes are still there

### Requirement: Track recording

The user SHALL be able to record a track while underway, keep it on the device, and export it as GPX.

#### Scenario: Record and export

- **WHEN** a track is started, the boat moves, and the track is stopped
- **THEN** one saved track exists and can be exported as GPX

### Requirement: Anchor alarm

The user SHALL be able to arm an anchor watch with a radius. The alarm SHALL sound and show when the boat drifts outside the radius or the GPS signal is lost while armed, and the screen SHALL be kept awake while armed where the device allows it.

#### Scenario: Drift

- **WHEN** the anchor watch is armed with 30 m and the boat drifts 40 m
- **THEN** the alarm sounds and shows, and it clears when disarmed

#### Scenario: iPhone screen lock

- **WHEN** the anchor watch is armed on an iPhone
- **THEN** the app keeps the screen awake where Wake Lock is supported, and says so when it is not

### Requirement: Night mode

The Night button SHALL switch the whole screen, chart included, to a dark red palette that keeps night vision, and back. The choice SHALL persist.

#### Scenario: Night on

- **WHEN** Night is tapped
- **THEN** the instruments, chart, strip, buttons and sheets use the red-on-black palette, with no bright white areas

### Requirement: Units and settings

The Menu SHALL let the user choose:

- the language (Auto, English or Deutsch)
- speed and distance units (metric by default)
- course-line length
- vessel dimensions and cruise speed
- voice prompts, keep-awake and track display
- sending diagnostics

The Menu SHALL also show the running build.

#### Scenario: Metric default

- **WHEN** the app is opened for the first time
- **THEN** speed is shown in km/h and distances in metres and kilometres

#### Scenario: Language choice in the Menu

- **WHEN** the user opens the Menu
- **THEN** it offers Auto, English and Deutsch as the language, with the current choice marked

### Requirement: Updates

The app SHALL update itself in the background and reload to the new version only when that does not interrupt the user: not while the anchor watch is armed or alarming, a route is active, a track is recording, or text is being typed.

#### Scenario: Busy

- **WHEN** a new version is ready while a route is active
- **THEN** the reload waits until navigation ends

### Requirement: Vector seamarks

From zoom level 12 the chart SHALL draw the seamarks in the visible area as symbols following IALA region A: lateral buoys and beacons (port red, starboard green, preferred channel variants), cardinal marks with their black and yellow bands and topmarks, isolated danger, safe water and special purpose marks, beacons as stakes, lights as a magenta flare, and notices. A seamark that has a light SHALL show the flare next to its symbol. Symbols SHALL grow with the zoom level, SHALL NOT be drawn below zoom 12, and in the night palette SHALL be drawn in red and black shades that keep the marks distinguishable by shape and brightness. The chart SHALL load the seamarks of the visible area from the server, with a margin around it, and SHALL NOT load them again for a small pan inside the loaded area.

#### Scenario: Day palette at the IJ

- **WHEN** the chart shows Amsterdam IJ at zoom 15 in the day palette and the server has seamark data
- **THEN** red can and green cone symbols, cardinal marks and lights are drawn at their positions

#### Scenario: Night palette

- **WHEN** the night palette is selected while seamarks are visible
- **THEN** every seamark symbol is drawn in red or black shades, and red and green lateral marks still differ by shape and fill

#### Scenario: Zoomed out

- **WHEN** the zoom level is below 12
- **THEN** no seamark symbols are drawn and no seamark request is made

#### Scenario: Small pan

- **WHEN** the user pans the chart by less than the margin after the seamarks were loaded
- **THEN** no new seamark request is made

#### Scenario: Seamarks button off

- **WHEN** the seamarks button has turned the layer off
- **THEN** no symbols are drawn and no seamark request is made

### Requirement: Seamark card

Tapping a seamark symbol SHALL open a compact card with the kind of mark (for example "Lateral buoy, port"), its name when known, its colours, and its light character when it has one (for example "Fl(2) G 5s"). The card SHALL close with its close button or when a toolbar tool is used, SHALL keep clear of the toolbar and the home indicator on iPhone and iPad, and SHALL be readable in the night palette.

#### Scenario: Tap a buoy

- **WHEN** a red port-hand buoy named "IJ 12" with the light Fl R 4s is tapped
- **THEN** the card shows "Lateral buoy, port", "IJ 12", the colour "red" and "Fl R 4s"

#### Scenario: Unnamed mark without light

- **WHEN** a mark without a name or light is tapped
- **THEN** the card shows the kind and colours only, without empty rows

#### Scenario: Phone widths

- **WHEN** the card is shown on a 360 px and on a 390 px wide iPhone, or in the home-screen app
- **THEN** it fits the width without horizontal overflow and stays above the home indicator

### Requirement: Seamarks offline

Saved offline trips SHALL include the seamarks within the saved corridor, and while the seamark service cannot be reached the chart SHALL draw the seamarks of the saved trips in the visible area.

#### Scenario: Trip saved

- **WHEN** a course is saved for offline use
- **THEN** the seamarks near the course are stored with the trip

#### Scenario: Service unreachable

- **WHEN** the device is offline and a trip covering the visible area was saved with seamarks
- **THEN** the seamark symbols of that trip are drawn

#### Scenario: Older trip

- **WHEN** a trip saved before seamarks existed covers the visible area while offline
- **THEN** the chart shows no seamarks for it and nothing fails

### Requirement: OpenSeaMap overlay

The Menu SHALL have a setting "OpenSeaMap overlay (online)", off by default and remembered, that shows the OpenSeaMap raster seamark tiles above the chart. It SHALL be independent of the seamarks button.

#### Scenario: Default

- **WHEN** the app is opened for the first time
- **THEN** the OpenSeaMap raster overlay is not requested

#### Scenario: Turned on

- **WHEN** the setting is switched on
- **THEN** OpenSeaMap tiles are shown and stay on after a reload

### Requirement: Aerial photo layer

The Menu SHALL have a setting "Aerial photo (online)", off by default and remembered across reloads, that shows the PDOK aerial photo (Luchtfoto) above the water and land fills and below the labels, seamarks, routes, tracks and boat. While it is shown the chart attribution SHALL include "Luchtfoto © PDOK". The photo SHALL be requested only while it is shown, SHALL NOT be cached by the app for offline use, and SHALL NOT be part of an offline corridor, and the setting SHALL say so in a hint. The photo SHALL be hidden in the night palette to keep the screen red on black, and the hint SHALL say so.

#### Scenario: Default

- **WHEN** the app is opened for the first time
- **THEN** the setting is off and no aerial photo tile is requested

#### Scenario: Turned on by day

- **WHEN** the setting is switched on in the day palette at Sixhaven, Amsterdam
- **THEN** the aerial photo is shown under the place names, bridges and seamarks, the attribution includes "Luchtfoto © PDOK", and the choice survives a reload

#### Scenario: Night palette

- **WHEN** the setting is on and the night palette is selected
- **THEN** no aerial photo is drawn and no aerial photo tile is requested, and switching back to the day palette shows it again

#### Scenario: Offline

- **WHEN** the device is offline with the setting on
- **THEN** the chart still renders from the offline vector chart, the photo is missing without an error message, and saving a trip for offline use downloads no photo tiles

#### Scenario: Setting hint

- **WHEN** the Menu is open on an iPhone or iPad
- **THEN** the setting reads "Aerial photo (online)" and its hint says the photo is not saved for offline use and is hidden at night
