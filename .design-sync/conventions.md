## Plotter conventions (read first)

Plotter is a mobile-first chartplotter for Dutch inland waterways: large touch targets for use on a moving boat, a day theme and a red-on-black night theme. It is a navigation aid, not certified for navigation.

### Setup

- There is no React provider. Components are styled by `styles.css` alone, which carries the tokens and every class below.
- The theme is an attribute on `<html>`: `document.documentElement.dataset.theme = 'day' | 'night'`. Night mode is only red on black, to keep the skipper's night vision. Never introduce other hues in night designs; use the tokens and night follows automatically.
- Safe-area insets come from `--safe-t` / `--safe-b`, which default to `env(safe-area-inset-*)`. Keep bottom-pinned UI above `calc(var(--tap) + var(--safe-b))`.
- Several parts are pinned to the viewport with `position: fixed`, exactly as in the app: `SheetFrame` (`#sheet`, the bottom sheet), `#dest-bar` (wrap a `DestinationCard` or `SeamarkCard` in it), `Toast`, and `Disclaimer`. Render at most one of each per screen. For a design of a whole screen, lay out the full viewport and let them sit at its bottom edge.
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
