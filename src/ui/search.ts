import type { App } from '../app';
import type { ApiSearchResult } from '../core/api';
import { distance } from '../core/geo';
import { PlaceIndex } from '../core/search';
import { searchTrips } from '../core/trips';
import { formatDistance } from '../core/units';
import type { Place } from '../core/waterway-data';
import { ApiError, api } from '../services/api';
import { h } from './dom';
import { KIND_LABEL, kindIcon } from './icons';

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

type ScopeName = 'sheet' | 'bar';

interface Scope {
  root: string;
  query: string;
  rows: ApiSearchResult[];
  heading: string;
  note: string;
  timer: number | undefined;
  abort: AbortController | null;
}

const scopes: Record<ScopeName, Scope> = {
  sheet: { root: '#sheet .search', query: '', rows: [], heading: '', note: '', timer: undefined, abort: null },
  bar: { root: '#dest-bar .search', query: '', rows: [], heading: '', note: '', timer: undefined, abort: null },
};

/** Saved waypoints, recent destinations and places of saved corridors, for when the service is out of reach. */
function localMatches(app: App, q: string): ApiSearchResult[] {
  const near = app.fix ?? undefined;
  const waypoints: Place[] = [...app.waypoints.values()]
    .filter((w) => !w.hidden)
    .map((w) => ({ name: w.name, kind: 'waypoint', lat: w.lat, lon: w.lon }));
  const own = new PlaceIndex([...app.recents, ...waypoints]).search(q, { near, limit: 12 });
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

function renderRows(app: App, s: Scope, onPick: (p: Place) => void, root = document.querySelector(s.root)): void {
  if (!root) return;
  const du = app.settings.distanceUnit;
  root.querySelector('.search-note')!.textContent = s.note;
  const list = root.querySelector('.search-results')!;
  const rows = s.rows.map((r) =>
    h(
      'li',
      null,
      h(
        'button',
        { class: 'result', type: 'button', onclick: () => onPick(r) },
        h('span', { class: 'result-ico', innerHTML: kindIcon(r.kind) }),
        h(
          'span',
          { class: 'result-text' },
          h('b', null, r.name),
          h(
            'small',
            null,
            [KIND_LABEL[r.kind], r.distance != null ? formatDistance(r.distance, du) : null]
              .filter(Boolean)
              .join(' · '),
          ),
        ),
      ),
    ),
  );
  list.replaceChildren(...(s.heading && rows.length ? [h('li', { class: 'result-heading' }, s.heading)] : []), ...rows);
}

async function lookup(app: App, s: Scope, q: string, onPick: (p: Place) => void): Promise<void> {
  s.abort?.abort();
  const ac = (s.abort = new AbortController());
  s.note = 'Searching…';
  renderRows(app, s, onPick);
  const near = app.fix
    ? { lat: app.fix.lat, lon: app.fix.lon }
    : app.map
      ? { lat: app.map.getCenter().lat, lon: app.map.getCenter().lng }
      : null;
  try {
    s.rows = await api.search(q, near, ac.signal);
    s.heading = '';
    s.note = s.rows.length ? '' : 'No harbour, lock, town or waterway found';
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    s.rows = localMatches(app, q);
    s.heading = '';
    s.note =
      e instanceof ApiError && e.kind === 'rejected'
        ? e.message
        : `Search service not reachable – ${s.rows.length ? 'showing saved places' : 'no saved places match'}`;
  }
  if (ac.signal.aborted) return;
  renderRows(app, s, onPick);
}

/**
 * Destination search field with result rows. State lives in the module so the field
 * survives the Route sheet being re-rendered every second; `onPick` receives the chosen place.
 */
export function searchBox(app: App, name: ScopeName, onPick: (p: Place) => void): HTMLElement {
  const s = scopes[name];
  const input = h('input', {
    type: 'search',
    class: 'search-input',
    placeholder: 'Search harbour, lock, town, waterway…',
    'aria-label': 'Search destination',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: false,
    enterkeyhint: 'search',
    oninput: () => {
      s.query = input.value;
      clearTimeout(s.timer);
      const q = input.value.trim();
      if (q.length < MIN_CHARS) {
        s.abort?.abort();
        s.rows = q ? [] : recentRows(app);
        s.heading = q ? '' : 'Recent destinations';
        s.note = q ? `Type at least ${MIN_CHARS} letters` : '';
        renderRows(app, s, onPick);
        return;
      }
      s.timer = window.setTimeout(() => void lookup(app, s, q, onPick), DEBOUNCE_MS);
    },
    onfocus: () => {
      if (!input.value.trim() && !s.rows.length) {
        s.rows = recentRows(app);
        s.heading = 'Recent destinations';
        renderRows(app, s, onPick);
      }
    },
  });
  input.value = s.query;
  const results = h('ul', { class: 'search-results list' });
  const box = h(
    'div',
    { class: 'search', 'data-scope': name },
    input,
    h('div', { class: 'search-note', 'aria-live': 'polite' }),
    results,
  );
  renderRows(app, s, onPick, box);
  return box;
}

export function resetSearch(name: ScopeName): void {
  const s = scopes[name];
  s.abort?.abort();
  clearTimeout(s.timer);
  Object.assign(s, { query: '', rows: [], heading: '', note: '', abort: null });
}
