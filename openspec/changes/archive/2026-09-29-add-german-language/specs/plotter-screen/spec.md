# Spec Delta

## MODIFIED Requirements

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
