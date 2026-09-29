## Plotter conventions (read first)

Plotter is a mobile-first chartplotter for Dutch inland waterways: large touch targets for use on a moving boat, a day theme and a red-on-black night theme. It is a navigation aid, not certified for navigation.

### Setup

- There is no React provider. Components are styled by `styles.css` alone, which carries the tokens and every class below.
- The theme is a `data-theme='day' | 'night'` attribute on any ancestor. `PlotterScreen` sets it from `app.settings.theme`. Night mode is only red on black, to keep the skipper's night vision. Never introduce other hues in night designs; use the tokens and night follows automatically.
- Safe-area insets come from `--safe-t` / `--safe-b`, which default to `env(safe-area-inset-*)`. Keep bottom-pinned UI above `calc(var(--tap) + var(--safe-b))`.
- **Design whole screens with `PlotterScreen`.** It draws the entire app screen from props: instrument bar, guidance strip (when `app.progress` is set), chart area (`chart` prop; any backdrop), map buttons, toolbar, and whichever of `sheet={{ key, title, content }}`, `bottom={{ kind: 'card' | 'placing', content }}`, `toast`, `disclaimer` is up. Put a panel (`RoutePanel`, `SettingsPanel`, …) in `sheet.content` and a `DestinationCard` or `PlacementBar` in `bottom.content`.
- The layout adapts to its container, not the browser: the element named `plotter` (`container: plotter / size`). `PlotterScreen` is one and fills the viewport. Below 720 px wide you get the phone layout; at 720 px and wider, the tablet layout (one-row instrument bar, sheet as a 440 px panel on the right). To show a specific device, put the screen in a box of that size, e.g. `<div style={{ position: 'relative', width: 820, height: 1180, transform: 'translateZ(0)', container: 'plotter / size' }}>`. Sizes: phone 390×844 / 844×390, tablet 820×1180 / 1180×820. The transform keeps the screen's fixed-position parts inside the box.
- Outside `PlotterScreen`, the sheet (`SheetFrame`), `#dest-bar`, `Toast`, `Disclaimer`, `AnchorAlarm` and `MapControls` are `position: fixed`. Give them such a box, and render at most one of each per screen.
- Data-driven components take an `app` object (`Pick<App, …>` in each `.d.ts`: `settings`, `fix`, `progress`, the maps `waypoints`/`routes`/`tracks`, and async actions such as `updateSettings`). Pass a plain object with realistic values and `async () => {}` for the actions. `settings` needs `speedUnit: 'kmh' | 'kn'`, `distanceUnit: 'metric' | 'nautical'` and `theme`.

### Styling idiom: global classes + CSS custom properties

Use the app's own classes; don't invent new ones for things these already cover. For layout glue, use inline styles with the tokens.

| Family    | Classes                                                                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buttons   | `btn` + `primary` / `danger` + size `big` (60 px) / `sm`, `block` (full width), `grow` (flex fill); `icon-btn` (square ✕-style); `fab` (round map button); `tool` + `tool-ico` (bottom toolbar) |
| Layout    | `row` (flex, 8 px gap), `row wrap`, `field` + `field-label`, `hint` (dim help text)                                                                                                             |
| Choices   | `segmented` > `seg` (`seg active` = selected; add `role="radio"` and `aria-checked`)                                                                                                            |
| Read-outs | `stats` > `stat` (`wide`, `mono`, `rec`) > `stat-label` + `stat-value`                                                                                                                          |
| Lists     | `list` > `li` > `list-item` (a `small` inside is the sub-line); `result`, `result-ico`, `result-text`                                                                                           |
| Sheet     | `SheetFrame` renders `sheet-head` + `sheet-body`                                                                                                                                                |
| Cards     | `dest-card`, `dest-title`, `dest-info` (a `dl` of `dt`/`dd`)                                                                                                                                    |

Tokens (`var(--…)`): surfaces `--bg`, `--panel`, `--panel-2`; text `--fg`, `--fg-dim`; brand `--accent`, `--accent-fg`; status `--ok`, `--warn`, `--danger`; `--border`, `--shadow`, `--radius` (12 px), `--tap` (56 px minimum touch target); instrument bar `--inst-bg`, `--inst-fg`. The font is the system UI stack, and numbers use `font-variant-numeric: tabular-nums`.

### Where the truth lives

- `styles.css` → `_ds_bundle.css`: every class and token above, including the `[data-theme='night']` overrides.
- `components/<group>/<Name>/<Name>.prompt.md` and `.d.ts`: props and examples for each component.

### Example

```jsx
const { SheetFrame, Toast } = window.Plotter;

<>
  <SheetFrame title="Lock ahead">
    <div className="stats">
      <div className="stat">
        <div className="stat-label">Distance</div>
        <div className="stat-value">1.2 km</div>
      </div>
      <div className="stat">
        <div className="stat-label">ETA</div>
        <div className="stat-value">14:05</div>
      </div>
    </div>
    <p className="hint">Oranjesluizen: call on VHF 18 before arrival.</p>
    <div className="row">
      <button className="btn primary grow big">Call lock</button>
      <button className="btn big">Later</button>
    </div>
  </SheetFrame>
  <Toast message="Waypoint reached – next: Oranjesluizen" />
</>;
```
