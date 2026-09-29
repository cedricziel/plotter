# app-language Specification

## Purpose
Lets boaters use Plotter in English or German. It covers how the language is chosen, what gets translated, and how maneuvers, voice prompts and numbers read in each language.

## Requirements

### Requirement: Choosing the language

The app SHALL offer the languages English and German with the choices Auto, English and Deutsch, and Auto SHALL be the default.

- With Auto, the app SHALL use German when German comes before English in the device's preferred languages. It SHALL use English otherwise, including when neither is listed.
- The choice SHALL be saved on the device with the other settings.
- iOS keeps separate storage for the Safari tab and the installed home-screen app, so each SHALL remember its own explicit choice. With Auto, both SHALL follow the device language.

#### Scenario: German device

- **WHEN** the app is opened for the first time on an iPhone or iPad whose preferred languages are German, then English
- **THEN** the app is shown in German

#### Scenario: Device in another language

- **WHEN** the app is opened for the first time and the preferred languages are Dutch, then English
- **THEN** the app is shown in English

#### Scenario: Neither language preferred

- **WHEN** the app is opened for the first time and the preferred languages are French only
- **THEN** the app is shown in English

#### Scenario: Explicit choice survives a reload

- **WHEN** the user picks Deutsch in the home-screen app on an English device, then closes and reopens it from the home screen
- **THEN** the home-screen app is still shown in German

#### Scenario: Safari and home-screen app choose separately

- **WHEN** the user picks Deutsch in the home-screen app on an English device, then opens the app in a Safari tab where Auto is still set
- **THEN** the Safari tab is shown in English and the home-screen app stays German

### Requirement: Switching without reload

Changing the language SHALL relabel everything on screen at once, without a reload and without losing state:

- the instrument bar, the toolbar, the floating-button labels, the chart notice and the guidance strip
- any open sheet
- the page language exposed to assistive technology

An active route, a recording track and an armed anchor watch SHALL keep running.

#### Scenario: Switching while navigating

- **WHEN** a route is active, the Settings sheet is open, and the user picks Deutsch
- **THEN** the toolbar reads Route, Track, Anker, Nacht and Menü, the chart notice and the guidance strip are in German, the Settings sheet stays open in German, and guidance continues

#### Scenario: Screen reader language

- **WHEN** the language is German
- **THEN** the page declares German as its language, so VoiceOver on iPhone and iPad reads the labels with a German voice

### Requirement: Translated texts

In the chosen language, the app SHALL show every text that it writes itself, including:

- the labels of the toolbar, instruments, sheets, destination card and search
- toasts, the anchor alarm, the update prompt and the disclaimer
- accessible labels and tooltips

The following SHALL stay as they are:

- names from map and waterway data (places, waterways, bridges, locks)
- names the user gave waypoints, routes and tracks
- the SOG and COG abbreviations
- error messages returned by the server

#### Scenario: Disclaimer in German

- **WHEN** the language is German and the disclaimer is shown
- **THEN** it states in German that the app is a navigation aid only and not for navigation, and the permanent chart notice reads "Nur Navigationshilfe – nicht zur Navigation"

#### Scenario: Names are not translated

- **WHEN** the language is German and the destination is the marina "Jachthaven De Pikmar"
- **THEN** the destination card shows German labels and the name "Jachthaven De Pikmar" unchanged

### Requirement: Maneuver texts and voice prompts

Maneuver texts in the guidance strip and the route sheet SHALL be written in the chosen language, with the waterway or object name inserted unchanged.

- When voice prompts are enabled, they SHALL be spoken in the chosen language, with a voice for that language when the device has one.
- A maneuver without a separate name, for example from a route saved before this change, SHALL show its original text.

#### Scenario: Turn in German

- **WHEN** the language is German and the next maneuver is a left turn into the IJ 253 m ahead
- **THEN** the strip shows "In 253 m — Links abbiegen in IJ"

#### Scenario: Lock and bridges in German

- **WHEN** the language is German and the route passes the lock Oranjesluizen, an opening bridge Schellingwoude and a fixed bridge with 5.4 m clearance
- **THEN** the maneuvers read "Schleuse Oranjesluizen passieren", "Klappbrücke: Schellingwoude" and "Feste Brücke, 5,4 m Durchfahrtshöhe"

#### Scenario: Spoken prompt in German

- **WHEN** voice prompts are on, the language is German, and the boat comes within 500 m of a right turn into the Pikmar
- **THEN** the device says "In 500 Metern, rechts abbiegen in Pikmar"

#### Scenario: Route saved before the change

- **WHEN** the language is German and a route saved by an older version has a maneuver with only the English text "Continue on Pikmar"
- **THEN** the strip shows "Continue on Pikmar" instead of an empty or broken text

### Requirement: Numbers and times per language

Speeds, distances, coordinates and other decimal numbers SHALL use a decimal comma in German and a decimal point in English. Clock times SHALL use the 24-hour format in both languages, and the chosen units SHALL not change with the language.

#### Scenario: German instrument bar

- **WHEN** the language is German, the speed is 9.7 km/h and the position is 53°05.288′N 005°50.524′E
- **THEN** the instrument bar shows "9,7", "53°05,288′N" and "005°50,524′E"

#### Scenario: Units unchanged

- **WHEN** the user switches from English to German with knots and nautical miles selected
- **THEN** speed stays in knots and distances in nautical miles

### Requirement: Layout in German

German labels SHALL fit the same layout as English, with nothing clipped or wider than the screen, in these places:

- the toolbar, the guidance strip, the destination card and the sheets
- widths from 360 px up and on iPad split-view widths
- the day and night themes, in the Safari tab and in the home-screen app

#### Scenario: Narrow iPhone in German

- **WHEN** the language is German on a 360 px wide screen, in day or night theme, with a long maneuver such as "Scharf rechts abbiegen in Amsterdam-Rijnkanaal"
- **THEN** the toolbar labels, the strip and its stop button are fully visible and nothing overflows horizontally

#### Scenario: iPad split view in German

- **WHEN** the language is German and the app runs in a narrow iPad split-view width
- **THEN** the toolbar and the open sheet show their German labels without clipping
