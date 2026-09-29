## ADDED Requirements

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
