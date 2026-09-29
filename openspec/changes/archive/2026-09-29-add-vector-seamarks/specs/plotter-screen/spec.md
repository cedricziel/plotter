## MODIFIED Requirements

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

## ADDED Requirements

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
