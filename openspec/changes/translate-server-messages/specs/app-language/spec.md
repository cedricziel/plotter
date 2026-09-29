# Spec Delta

## MODIFIED Requirements

### Requirement: Translated texts

In the chosen language, the app SHALL show every text that it writes itself, including:

- the labels of the toolbar, instruments, sheets, destination card and search
- toasts, the anchor alarm, the update prompt and the disclaimer
- accessible labels and tooltips
- route warnings and error messages from the server, for every code the app knows

The server SHALL send a code, and parameters where the text has numbers, with each route warning and error message, next to the English text. The app SHALL show the English text for a code it does not know, or when there is no code.

The following SHALL stay as they are:

- names from map and waterway data (places, waterways, bridges, locks)
- names the user gave waypoints, routes and tracks
- the SOG and COG abbreviations

#### Scenario: Disclaimer in German

- **WHEN** the language is German and the disclaimer is shown
- **THEN** it states in German that the app is a navigation aid only and not for navigation, and the permanent chart notice reads "Nur Navigationshilfe – nicht zur Navigation"

#### Scenario: Names are not translated

- **WHEN** the language is German and the destination is the marina "Jachthaven De Pikmar"
- **THEN** the destination card shows German labels and the name "Jachthaven De Pikmar" unchanged

#### Scenario: Route warning in German

- **WHEN** the language is German and the router warns about 2 fixed bridges with unknown clearance
- **THEN** the route sheet shows "2 feste Brücken mit unbekannter Durchfahrtshöhe"

#### Scenario: No route found in German

- **WHEN** the language is German and the server answers that there is no charted waterway within 5 km of the destination
- **THEN** the toast reads "Kein kartiertes Gewässer im Umkreis von 5 km um das Ziel — gerade Linie wird genutzt"

#### Scenario: Rate limited in German

- **WHEN** the language is German and the server answers that there were too many requests
- **THEN** the message reads "Zu viele Anfragen – bitte kurz warten"

#### Scenario: Bad request in German

- **WHEN** the language is German and the server rejects a request as not valid
- **THEN** the message reads "Ungültige Anfrage"

#### Scenario: Offline in German

- **WHEN** the language is German and the routing service cannot be reached
- **THEN** the message reads "Routendienst nicht erreichbar"

#### Scenario: Unknown code

- **WHEN** the language is German and the server sends a warning or an error with a code the app does not know
- **THEN** the app shows the English text the server sent

#### Scenario: Older server

- **WHEN** the language is German and the server sends a warning as a plain string or an error without a code
- **THEN** the app shows that text, translating the unknown-clearance warning as before
