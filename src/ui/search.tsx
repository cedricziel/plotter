import type { App } from '../app';
import type { ApiSearchResult } from '../core/api';
import { distance } from '../core/geo';
import { PlaceIndex } from '../core/search';
import { searchTrips } from '../core/trips';
import { formatDistance } from '../core/units';
import { language, t } from '../i18n';
import type { Place } from '../core/waterway-data';
import { ApiError, api } from '../services/api';
import { KindIcon } from './icons';
import { createStore, useLanguage, useStore, type Store } from './store';

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

export type ScopeName = 'sheet' | 'bar';

/** A function when the text is worded per language, so a shown note relabels with it. */
type Text = string | (() => string);
const word = (text: Text) => (typeof text === 'function' ? text() : text);

interface State {
  query: string;
  rows: ApiSearchResult[];
  heading: Text;
  note: Text;
}

interface Scope {
  state: Store<State>;
  timer: number | undefined;
  abort: AbortController | null;
}

const EMPTY: State = { query: '', rows: [], heading: '', note: '' };

const scopes: Record<ScopeName, Scope> = {
  sheet: { state: createStore(EMPTY), timer: undefined, abort: null },
  bar: { state: createStore(EMPTY), timer: undefined, abort: null },
};

const patch = (s: Scope, p: Partial<State>) => s.state.set({ ...s.state.get(), ...p });

/** Saved waypoints, recent destinations and places of saved corridors, for when the service is out of reach. */
function localMatches(app: App, q: string): ApiSearchResult[] {
  const near = app.fix ?? undefined;
  const waypoints: Place[] = [...app.waypoints.values()]
    .filter((w) => !w.hidden)
    .map((w) => ({ name: w.name, kind: 'waypoint', lat: w.lat, lon: w.lon }));
  const own = new PlaceIndex([...app.recents, ...waypoints]).search(q, {
    near,
    limit: 12,
  });
  const saved = searchTrips(app.trips, q, near, 12).map((p) => (near ? { ...p, distance: distance(near, p) } : p));
  const seen = new Set<string>();
  return [...own, ...saved].filter((p) => {
    const k = `${p.name}|${p.lat.toFixed(4)}|${p.lon.toFixed(4)}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

function recentRows(app: App): ApiSearchResult[] {
  const f = app.fix;
  return app.recents.map((p) => (f ? { ...p, distance: distance(f, p) } : p));
}

async function lookup(app: App, s: Scope, q: string): Promise<void> {
  s.abort?.abort();
  const ac = (s.abort = new AbortController());
  patch(s, { note: () => t('search.searching') });
  const near = app.fix
    ? { lat: app.fix.lat, lon: app.fix.lon }
    : app.map
      ? { lat: app.map.getCenter().lat, lon: app.map.getCenter().lng }
      : null;
  try {
    const rows = await api.search(q, near, ac.signal);
    if (ac.signal.aborted) return;
    patch(s, {
      rows,
      heading: '',
      note: rows.length ? '' : () => t('search.none'),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError' || ac.signal.aborted) return;
    const rows = localMatches(app, q);
    patch(s, {
      rows,
      heading: '',
      note:
        e instanceof ApiError && e.kind === 'rejected'
          ? e.message
          : () => t(rows.length ? 'search.offlineSaved' : 'search.offlineNone'),
    });
  }
}

/**
 * Destination search field with result rows. State lives in the module so the field
 * survives the Route sheet being re-rendered every second; `onPick` receives the chosen place.
 */
export function SearchBox({ app, scope, onPick }: { app: App; scope: ScopeName; onPick: (p: Place) => void }) {
  useLanguage();
  const s = scopes[scope];
  const { query, rows, ...texts } = useStore(s.state);
  const [heading, note] = [word(texts.heading), word(texts.note)];
  const du = app.settings.distanceUnit;

  return (
    <div className="search" data-scope={scope}>
      <input
        type="search"
        className="search-input"
        placeholder={t('search.placeholder')}
        aria-label={t('search.label')}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="search"
        value={query}
        onChange={(e) => {
          const value = e.target.value;
          clearTimeout(s.timer);
          const q = value.trim();
          if (q.length < MIN_CHARS) {
            s.abort?.abort();
            patch(s, {
              query: value,
              rows: q ? [] : recentRows(app),
              heading: q ? '' : () => t('search.recent'),
              note: q ? () => t('search.minChars', { count: MIN_CHARS }) : '',
            });
            return;
          }
          patch(s, { query: value });
          s.timer = window.setTimeout(() => void lookup(app, s, q), DEBOUNCE_MS);
        }}
        onFocus={() => {
          if (!query.trim() && !rows.length) patch(s, { rows: recentRows(app), heading: () => t('search.recent') });
        }}
      />
      <div className="search-note" aria-live="polite">
        {note}
      </div>
      <ul className="search-results list">
        {heading && rows.length > 0 && <li className="result-heading">{heading}</li>}
        {rows.map((r, i) => (
          <li key={`${r.name}|${r.lat}|${r.lon}|${i}`}>
            <button className="result" type="button" onClick={() => onPick(r)}>
              <KindIcon kind={r.kind} className="result-ico" />
              <span className="result-text">
                <b>{r.name}</b>
                <small>
                  {[t(`kind.${r.kind}`), r.distance != null ? formatDistance(r.distance, du, language()) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function resetSearch(name: ScopeName): void {
  const s = scopes[name];
  s.abort?.abort();
  clearTimeout(s.timer);
  s.abort = null;
  s.state.set(EMPTY);
}

/** Puts a scope into a given state without typing, for stories. */
export function seedSearch(name: ScopeName, state: Partial<State>): void {
  scopes[name].state.set({ ...EMPTY, ...state });
}
