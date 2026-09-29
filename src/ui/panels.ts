import type { App } from '../app';
import { bearing, distance, routeLegs, timeToGo } from '../core/geo';
import { parseGpx, toGpx } from '../core/gpx';
import type { Route } from '../core/model';
import { convertSpeed, formatBearing, formatCoord, formatDistance, formatDuration, formatTime, speedLabel } from '../core/units';
import { type CogMinutes, DEFAULT_SETTINGS } from '../settings';
import { chartAndShow, showDestinationCard, startPlacement } from './destination';
import { DISCLAIMER, showDisclaimerOnce } from './disclaimer';
import { download, fileStamp, h, pickFile, toast } from './dom';
import { maneuverIcon, iconEl } from './icons';
import { searchBox } from './search';
import { closeSheet, openSheet, sheetOpen, updateSheet } from './sheet';

type Opt<T> = { value: T; label: string };

function segmented<T extends string | number | boolean>(
  label: string,
  current: T,
  options: Opt<T>[],
  onPick: (v: T) => void,
): HTMLElement {
  return h(
    'div',
    { class: 'field' },
    h('div', { class: 'field-label' }, label),
    h(
      'div',
      { class: 'segmented', role: 'radiogroup', 'aria-label': label },
      options.map((o) =>
        h(
          'button',
          {
            class: o.value === current ? 'seg active' : 'seg',
            role: 'radio',
            'aria-checked': String(o.value === current),
            onclick: () => onPick(o.value),
          },
          o.label,
        ),
      ),
    ),
  );
}

const onOff = (label: string, value: boolean, onPick: (v: boolean) => void) =>
  segmented(label, value, [
    { value: true, label: 'On' },
    { value: false, label: 'Off' },
  ], onPick);

function stat(label: string, value: string, cls = ''): HTMLElement {
  return h('div', { class: `stat ${cls}` }, h('div', { class: 'stat-label' }, label), h('div', { class: 'stat-value' }, value));
}

// ---------------------------------------------------------------------------
// Route & waypoints
// ---------------------------------------------------------------------------

function routeBody(app: App): HTMLElement {
  const du = app.settings.distanceUnit;
  const route = app.activeRoute;
  const routes = [...app.routes.values()].sort((a, b) => a.created - b.created);

  const picker = h(
    'div',
    { class: 'row' },
    h(
      'select',
      {
        class: 'grow',
        'aria-label': 'Active route',
        onchange: (e: Event) => {
          const v = (e.target as HTMLSelectElement).value;
          void app.updateSettings({ activeRouteId: v || null });
        },
      },
      h('option', { value: '', selected: !route }, '— no active route —'),
      routes.map((r) => h('option', { value: r.id, selected: r.id === route?.id }, r.name)),
    ),
    h('button', { class: 'btn', onclick: () => void app.createRoute() }, '+ New'),
  );

  const parts: (HTMLElement | null)[] = [
    searchBox(app, 'sheet', (p) => showDestinationCard(app, p)),
    h('button', { class: 'btn primary block', onclick: () => startPlacement(app) }, '⌖ Set destination'),
    route ? h('button', { class: 'btn danger block', onclick: () => void app.stopNavigation() }, '■ Stop navigation') : null,
    picker,
  ];

  if (route?.maneuvers) {
    parts.push(courseBlock(app, route));
  } else if (route) {
    const pts = app.routePoints(route);
    const { legs, total } = routeLegs(pts);
    const sog = app.fix?.sog ?? null;
    const prog = app.progress;
    const now = Date.now();

    // cumulative time from boat through the route (only for legs not yet done)
    let cum = prog ? (prog.ttgNext ?? NaN) : NaN;
    const rows = pts.map((w, i) => {
      const leg = i > 0 ? legs[i - 1] : null;
      let etaCell = '';
      if (prog && sog && i >= prog.nextIndex) {
        if (i > prog.nextIndex && leg) cum += timeToGo(leg.distance, sog) ?? NaN;
        etaCell = Number.isFinite(cum) ? formatTime(new Date(now + cum * 1000)) : '';
      }
      const done = prog ? i < prog.nextIndex : false;
      return h(
        'li',
        { class: `leg ${done ? 'done' : ''} ${prog?.nextIndex === i ? 'next' : ''}` },
        h('span', { class: 'leg-no' }, String(i + 1)),
        h(
          'button',
          { class: 'leg-name link', onclick: () => openWaypoint(app, w.id) },
          w.name,
          h('small', null, leg ? `${formatDistance(leg.distance, du)} · ${formatBearing(leg.bearing)}` : 'start'),
        ),
        h('span', { class: 'leg-eta' }, etaCell),
        h(
          'span',
          { class: 'leg-actions' },
          h('button', { class: 'icon-btn sm', title: 'Steer to this waypoint', onclick: () => app.setNextIndex(i) }, '➤'),
          h('button', { class: 'icon-btn sm', title: 'Move up', disabled: i === 0, onclick: () => moveInRoute(app, route, i, -1) }, '↑'),
          h(
            'button',
            { class: 'icon-btn sm', title: 'Remove from route', onclick: () => {
              route.waypointIds.splice(i, 1);
              void app.saveRoute(route);
            } },
            '✕',
          ),
        ),
      );
    });

    const inRoute = new Set(route.waypointIds);
    const candidates = [...app.waypoints.values()].filter((w) => !inRoute.has(w.id));
    const add = h(
      'select',
      {
        class: 'grow',
        'aria-label': 'Add waypoint to route',
        onchange: (e: Event) => {
          const id = (e.target as HTMLSelectElement).value;
          if (!id) return;
          route.waypointIds.push(id);
          void app.saveRoute(route);
        },
      },
      h('option', { value: '' }, candidates.length ? '+ add waypoint…' : 'long-press the map to add waypoints'),
      candidates.map((w) => h('option', { value: w.id }, w.name)),
    );

    parts.push(
      h(
        'div',
        { class: 'stats' },
        stat('Total', formatDistance(total, du)),
        stat('To go', prog ? formatDistance(prog.remaining, du) : '--'),
        stat('ETA', prog?.ttg != null ? formatTime(new Date(now + prog.ttg * 1000)) : '--:--'),
        stat('TTG', formatDuration(prog?.ttg ?? null)),
      ),
      pts.length ? h('ol', { class: 'legs' }, rows) : h('p', { class: 'hint' }, 'This route has no waypoints yet.'),
      h('div', { class: 'row' }, add),
      h(
        'div',
        { class: 'row wrap' },
        h('button', { class: 'btn', onclick: () => {
          const n = prompt('Route name', route.name);
          if (n) void app.saveRoute({ ...route, name: n.trim() || route.name });
        } }, 'Rename'),
        h('button', { class: 'btn', onclick: () => {
          route.waypointIds.reverse();
          app.setNextIndex(0);
          void app.saveRoute(route);
        } }, 'Reverse'),
        h('button', { class: 'btn', onclick: () => exportRoute(app, route) }, 'Export GPX'),
        h('button', { class: 'btn danger', onclick: () => {
          if (confirm(`Delete route “${route.name}”? Waypoints are kept.`)) void app.deleteRoute(route.id);
        } }, 'Delete'),
      ),
    );
  }

  // All waypoints
  const fix = app.fix;
  const wps = [...app.waypoints.values()]
    .filter((w) => !w.hidden)
    .map((w) => ({ w, d: fix ? distance(fix, w) : null }))
    .sort((a, b) => (a.d ?? 0) - (b.d ?? 0) || a.w.name.localeCompare(b.w.name));
  parts.push(
    h('h3', null, `Waypoints (${wps.length})`),
    wps.length
      ? h(
          'ul',
          { class: 'list' },
          wps.map(({ w, d }) =>
            h(
              'li',
              null,
              h(
                'button',
                { class: 'list-item', onclick: () => openWaypoint(app, w.id) },
                h('span', null, w.name),
                h('small', null, d != null ? `${formatDistance(d, du)} · ${formatBearing(bearing(fix!, w))}` : ''),
              ),
            ),
          ),
        )
      : h('p', { class: 'hint' }, 'Long-press the map (right-click on desktop) to drop a waypoint.'),
    tripsBlock(app),
  );

  return h('div', null, parts);
}


const megabytes = (b: number) => `${(b / 1e6).toFixed(b < 1e7 ? 1 : 0)} MB`;

/** Summary, warnings, actions and the maneuver list of a charted course. */
function courseBlock(app: App, route: Route): HTMLElement {
  const du = app.settings.distanceUnit;
  const prog = app.progress;
  const maneuvers = route.maneuvers ?? [];
  const total = maneuvers[maneuvers.length - 1]?.dist ?? 0;
  const now = Date.now();
  const nextWp = route.waypointIds[prog?.nextIndex ?? 0];
  const toGo = prog ? prog.remaining : total;
  const job = app.offline?.routeId === route.id ? app.offline : null;

  const rows = maneuvers.map((m, i) => {
    const passed = !!prog && i > 0 && route.waypointIds.indexOf(m.wp ?? '') < prog.nextIndex;
    const isNext = !!nextWp && m.wp === nextWp;
    const ahead = prog ? Math.max(0, m.dist - (total - prog.remaining)) : null;
    return h(
      'li',
      { class: `maneuver${passed ? ' done' : ''}${isNext ? ' next' : ''}` },
      h(
        'button',
        {
          class: 'maneuver-row link',
          onclick: () => {
            app.setFollow(false);
            app.map.easeTo({ center: [m.lon, m.lat], zoom: Math.max(app.map.getZoom(), 15) });
          },
        },
        iconEl(maneuverIcon(m.type), 'maneuver-ico'),
        h(
          'span',
          { class: 'maneuver-text' },
          m.text,
          h('small', null, ahead != null && i > 0 && !passed ? `in ${formatDistance(ahead, du)}` : i === 0 ? 'start' : formatDistance(m.dist, du)),
        ),
      ),
    );
  });

  return h(
    'div',
    { class: 'course' },
    h(
      'div',
      { class: 'stats' },
      stat('Total', formatDistance(total, du)),
      stat('To go', formatDistance(toGo, du)),
      stat('ETA', prog?.ttg != null ? formatTime(new Date(now + prog.ttg * 1000)) : '--:--'),
      stat('TTG', formatDuration(prog?.ttg ?? null)),
    ),
    route.source === 'offline' ? h('p', { class: 'hint' }, 'Charted offline from a saved corridor.') : null,
    route.warnings?.length
      ? h('ul', { class: 'warnings' }, route.warnings.map((w) => h('li', null, `⚠ ${w}`)))
      : null,
    h(
      'div',
      { class: 'row wrap' },
      h(
        'button',
        { class: 'btn grow', disabled: app.recalculating, onclick: () => void app.recalculate() },
        app.recalculating ? 'Recalculating…' : '↻ Recalculate',
      ),
      route.tripId
        ? h('button', { class: 'btn grow', disabled: true }, '✓ Saved offline')
        : h(
            'button',
            { class: 'btn grow', disabled: !!app.offline, onclick: () => void app.saveForOffline(route) },
            job ? 'Saving…' : '⇩ Save for offline',
          ),
    ),
    job
      ? h(
          'div',
          { class: 'row' },
          h('progress', { class: 'grow', max: Math.max(1, job.total), value: job.done }),
          h('small', null, job.phase === 'estimating' ? 'Estimating…' : `${job.done}/${job.total}`),
          h('button', { class: 'btn', onclick: () => job.cancel() }, 'Cancel'),
        )
      : null,
    h('ol', { class: 'maneuvers' }, rows),
    h(
      'div',
      { class: 'row wrap' },
      h('button', { class: 'btn', onclick: () => exportRoute(app, route) }, 'Export GPX'),
      h(
        'button',
        {
          class: 'btn danger',
          onclick: () => {
            if (confirm(`Delete course “${route.name}”?`)) void app.deleteRoute(route.id);
          },
        },
        'Delete',
      ),
    ),
  );
}

/** Corridors saved for offline use, with their size and a delete action. */
function tripsBlock(app: App): HTMLElement | null {
  if (!app.trips.length) return null;
  const trips = [...app.trips].sort((a, b) => b.savedAt - a.savedAt);
  return h(
    'div',
    { class: 'trips' },
    h('h3', null, `Saved offline (${trips.length})`),
    h(
      'ul',
      { class: 'list' },
      trips.map((t) =>
        h(
          'li',
          { class: 'track-item' },
          h(
            'div',
            { class: 'list-item grow' },
            h('span', null, t.name),
            h('small', null, `${megabytes(t.bytes)} · ${t.tileCount} tiles · ${new Date(t.savedAt).toLocaleDateString()}`),
          ),
          h(
            'button',
            {
              class: 'icon-btn sm',
              'aria-label': `Delete saved trip ${t.name}`,
              onclick: () => {
                if (confirm(`Delete the saved corridor “${t.name}”? Cached map tiles expire on their own or via Settings.`)) {
                  void app.deleteTrip(t.id);
                }
              },
            },
            '✕',
          ),
        ),
      ),
    ),
  );
}

function dimensionField(app: App, label: string, key: 'airDraft' | 'draft' | 'beam', value: number | null): HTMLElement {
  const input = h('input', {
    type: 'number',
    inputmode: 'decimal',
    min: 0,
    max: 100,
    step: 0.1,
    value: value ?? '',
    placeholder: 'unknown',
    'aria-label': label,
    onchange: () => {
      const raw = input.value.trim().replace(',', '.');
      const n = raw === '' ? null : Number(raw);
      if (n != null && (!Number.isFinite(n) || n < 0 || n > 100)) {
        toast('Enter a size in metres between 0 and 100, or leave it empty');
        input.value = value == null ? '' : String(value);
        return;
      }
      void app.updateSettings({ [key]: n || null });
    },
  });
  return h('div', { class: 'field' }, h('label', { class: 'field-label' }, label), input);
}

function vesselFields(app: App): HTMLElement[] {
  const s = app.settings;
  const unit = s.speedUnit;
  const speed = h('input', {
    type: 'number',
    inputmode: 'decimal',
    min: 1,
    max: 60,
    step: 0.5,
    value: Number(convertSpeed(s.cruiseSpeed, unit).toFixed(1)),
    'aria-label': `Cruise speed (${speedLabel(unit)})`,
    onchange: () => {
      const n = Number(speed.value.replace(',', '.'));
      if (!Number.isFinite(n) || n < 1 || n > 60) return toast('Enter a cruise speed between 1 and 60');
      void app.updateSettings({ cruiseSpeed: n / convertSpeed(1, unit) });
    },
  });
  return [
    dimensionField(app, 'Air draft (m)', 'airDraft', s.airDraft),
    dimensionField(app, 'Draft (m)', 'draft', s.draft),
    dimensionField(app, 'Beam (m)', 'beam', s.beam),
    h('div', { class: 'field' }, h('label', { class: 'field-label' }, `Cruise speed (${speedLabel(unit)})`), speed),
    h(
      'p',
      { class: 'hint' },
      'Charted courses avoid bridges, depths and widths that do not fit and warn about fixed bridges with unknown clearance. ' +
        'The cruise speed gives the ETA while the boat is not moving. Leave a size empty if unknown.',
    ),
  ];
}

function moveInRoute(app: App, route: Route, i: number, dir: -1 | 1): void {
  const j = i + dir;
  if (j < 0 || j >= route.waypointIds.length) return;
  [route.waypointIds[i], route.waypointIds[j]] = [route.waypointIds[j], route.waypointIds[i]];
  void app.saveRoute(route);
}

function exportRoute(app: App, route: Route): void {
  const wps = app.routePoints(route);
  download(`${slug(route.name)}.gpx`, toGpx({ waypoints: wps, routes: [route] }));
}

export function openRoute(app: App): void {
  openSheet('route', 'Route & waypoints', routeBody(app));
}

// ---------------------------------------------------------------------------
// Single waypoint
// ---------------------------------------------------------------------------

let currentWp: string | null = null;

function waypointBody(app: App, id: string): HTMLElement {
  const w = app.waypoints.get(id);
  if (!w) return h('p', null, 'Waypoint deleted.');
  const du = app.settings.distanceUnit;
  const fix = app.fix;
  const route = app.activeRoute;
  const inRoute = route?.waypointIds.includes(id);

  const name = h('input', {
    type: 'text',
    value: w.name,
    'aria-label': 'Waypoint name',
    maxlength: 40,
    onchange: () => void app.updateWaypoint(id, { name: name.value.trim() || w.name }),
  });

  return h(
    'div',
    null,
    h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Name'), name),
    h(
      'div',
      { class: 'stats' },
      stat('Position', `${formatCoord(w.lat, 'lat')}\n${formatCoord(w.lon, 'lon')}`, 'wide mono'),
      stat('Distance', fix ? formatDistance(distance(fix, w), du) : '--'),
      stat('Bearing', fix ? formatBearing(bearing(fix, w)) : '---°'),
      stat('TTG', formatDuration(fix ? timeToGo(distance(fix, w), fix.sog) : null)),
    ),
    h('p', { class: 'hint' }, 'Drag the marker on the map to move it.'),
    h(
      'div',
      { class: 'row wrap' },
      h(
        'button',
        {
          class: 'btn primary',
          onclick: () => {
            closeSheet();
            void chartAndShow(app, { name: w.name, lat: w.lat, lon: w.lon });
          },
        },
        'Chart course',
      ),
      h(
        'button',
        {
          class: 'btn',
          onclick: async () => {
            await app.goTo(id);
            closeSheet();
          },
        },
        'Go to',
      ),
      h(
        'button',
        {
          class: 'btn',
          disabled: !!inRoute,
          onclick: async () => {
            const r = route ?? (await app.createRoute());
            r.waypointIds.push(id);
            await app.saveRoute(r);
            toast(`Added to ${r.name}`);
          },
        },
        inRoute ? 'In route' : route ? `Add to “${route.name}”` : 'Start new route',
      ),
      h('button', { class: 'btn', onclick: () => {
        app.setFollow(false);
        app.map.easeTo({ center: [w.lon, w.lat], zoom: Math.max(app.map.getZoom(), 14) });
      } }, 'Show'),
      h('button', { class: 'btn danger', onclick: () => {
        if (confirm(`Delete waypoint “${w.name}”?`)) {
          void app.deleteWaypoint(id);
          closeSheet();
        }
      } }, 'Delete'),
    ),
  );
}

export function openWaypoint(app: App, id: string): void {
  currentWp = id;
  const w = app.waypoints.get(id);
  openSheet('wp', w?.name ?? 'Waypoint', waypointBody(app, id), () => (currentWp = null));
}

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

function trackBody(app: App): HTMLElement {
  const du = app.settings.distanceUnit;
  const rec = app.recording;
  const tracks = [...app.tracks.values()].sort((a, b) => b.started - a.started);

  return h(
    'div',
    null,
    rec
      ? h(
          'div',
          null,
          h(
            'div',
            { class: 'stats' },
            stat('Recording', '● REC', 'rec'),
            stat('Distance', formatDistance(routeLegs(rec.points).total, du)),
            stat('Time', formatDuration((Date.now() - rec.started) / 1000)),
            stat('Points', String(rec.points.length)),
          ),
          h('button', { class: 'btn danger block big', onclick: () => void app.stopRecording() }, '■ Stop recording'),
        )
      : h('button', { class: 'btn primary block big', onclick: () => void app.startRecording() }, '● Start recording'),
    onOff('Show saved tracks on map', app.settings.showTracks, (v) => void app.updateSettings({ showTracks: v })),
    h('h3', null, `Tracks (${tracks.length})`),
    tracks.length
      ? h(
          'ul',
          { class: 'list' },
          tracks.map((t) =>
            h(
              'li',
              { class: 'track-item' },
              h(
                'button',
                {
                  class: 'list-item grow',
                  onclick: () => {
                    const n = prompt('Track name', t.name);
                    if (n?.trim()) void app.renameTrack(t.id, n.trim());
                  },
                },
                h('span', null, t.name, t === rec ? ' ●' : ''),
                h(
                  'small',
                  null,
                  `${formatDistance(routeLegs(t.points).total, du)} · ${formatDuration(((t.ended ?? Date.now()) - t.started) / 1000)} · ${t.points.length} pts`,
                ),
              ),
              h('button', { class: 'btn sm', disabled: t.points.length === 0, onclick: () =>
                download(`${slug(t.name)}.gpx`, toGpx({ tracks: [t] })) }, 'GPX'),
              h('button', { class: 'icon-btn sm', 'aria-label': 'Delete track', onclick: () => {
                if (confirm(`Delete “${t.name}”?`)) void app.deleteTrack(t.id);
              } }, '✕'),
            ),
          ),
        )
      : h('p', { class: 'hint' }, 'No tracks yet.'),
  );
}

export function openTrack(app: App): void {
  openSheet('track', 'Track recording', trackBody(app));
}

// ---------------------------------------------------------------------------
// Anchor
// ---------------------------------------------------------------------------

let pendingRadius = 40;

function anchorBody(app: App): HTMLElement {
  const a = app.anchor;
  const radius = a?.radius ?? pendingRadius;
  const setR = (r: number) => {
    pendingRadius = Math.max(5, Math.min(1000, r));
    if (a) void app.setAnchorRadius(pendingRadius);
    else refresh(app);
  };
  const check = app.anchorCheck;
  const stateText = !a ? 'Not set' : !a.armed ? 'Set – alarm off' : check?.state === 'alarm' ? 'OUTSIDE' : check?.state === 'warning' ? 'Near limit' : 'Holding';

  return h(
    'div',
    null,
    h(
      'div',
      { class: 'stats' },
      stat('Status', stateText, a?.armed ? `anchor-${check?.state ?? 'ok'}` : ''),
      stat('Distance', check ? `${Math.round(check.distance)} m` : '--'),
      stat('GPS acc.', app.fix ? `±${Math.round(app.fix.accuracy)} m` : '--'),
      stat('Wake lock', app.wakeLock.active ? 'On' : app.wakeLock.supported ? 'Off' : 'n/a'),
    ),
    h(
      'div',
      { class: 'field' },
      h('div', { class: 'field-label' }, 'Swing radius'),
      h(
        'div',
        { class: 'stepper' },
        h('button', { class: 'btn big', 'aria-label': 'Decrease radius', onclick: () => setR(radius - (radius > 100 ? 25 : 5)) }, '−'),
        h('div', { class: 'stepper-value' }, `${radius} m`),
        h('button', { class: 'btn big', 'aria-label': 'Increase radius', onclick: () => setR(radius + (radius >= 100 ? 25 : 5)) }, '+'),
      ),
    ),
    h(
      'div',
      { class: 'row wrap' },
      h('button', {
        class: 'btn grow',
        disabled: !app.fix,
        onclick: () => app.fix && void app.setAnchor({ lat: app.fix.lat, lon: app.fix.lon }, radius),
      }, '⚓ Drop at my position'),
      h('button', {
        class: 'btn grow',
        onclick: () => {
          const c = app.map.getCenter();
          void app.setAnchor({ lat: c.lat, lon: c.lng }, radius);
        },
      }, '⌖ Drop at map centre'),
    ),
    a
      ? h(
          'div',
          { class: 'row wrap' },
          a.armed
            ? h('button', { class: 'btn block big', onclick: () => void app.armAnchor(false) }, 'Disarm alarm')
            : h('button', { class: 'btn primary block big', onclick: () => void app.armAnchor(true) }, 'Arm anchor alarm'),
          h('button', { class: 'btn danger', onclick: () => void app.clearAnchor() }, 'Remove anchor'),
        )
      : null,
    h(
      'p',
      { class: 'hint' },
      'Keep this app open and in the foreground with the charger connected: browsers pause GPS when the screen turns off. ' +
        'The alarm also sounds if the GPS signal is lost for 30 s.',
    ),
  );
}

export function openAnchor(app: App): void {
  openSheet('anchor', 'Anchor alarm', anchorBody(app));
}

// ---------------------------------------------------------------------------
// Menu / settings
// ---------------------------------------------------------------------------

function menuBody(app: App): HTMLElement {
  const s = app.settings;
  const url = h('input', { type: 'url', value: s.pmtilesUrl, 'aria-label': 'PMTiles URL', class: 'grow' });

  return h(
    'div',
    null,
    h('h3', null, 'Display'),
    segmented('Speed', s.speedUnit, [
      { value: 'kmh', label: 'km/h' },
      { value: 'kn', label: 'knots' },
    ], (v) => void app.updateSettings({ speedUnit: v })),
    segmented('Distance', s.distanceUnit, [
      { value: 'metric', label: 'm / km' },
      { value: 'nautical', label: 'NM' },
    ], (v) => void app.updateSettings({ distanceUnit: v })),
    segmented<CogMinutes>('Course line (COG vector)', s.cogMinutes, [
      { value: 0, label: 'Off' },
      { value: 5, label: '5 min' },
      { value: 10, label: '10 min' },
      { value: 30, label: '30 min' },
    ], (v) => void app.updateSettings({ cogMinutes: v })),
    segmented('Palette', s.theme, [
      { value: 'day', label: '☀ Day' },
      { value: 'night', label: '☾ Night' },
    ], (v) => void app.updateSettings({ theme: v })),
    onOff('OpenSeaMap seamarks (online)', s.seamarks, (v) => void app.updateSettings({ seamarks: v })),
    onOff('Keep screen awake', s.keepAwake, (v) => void app.updateSettings({ keepAwake: v })),

    h('h3', null, 'Vessel & routing'),
    ...vesselFields(app),
    onOff('Voice prompts', s.voicePrompts, (v) => void app.updateSettings({ voicePrompts: v })),

    h('h3', null, 'Data (GPX)'),
    h(
      'div',
      { class: 'row wrap' },
      h('button', { class: 'btn grow', onclick: () => {
        download(`plotter-waypoints-routes-${fileStamp()}.gpx`, toGpx({ waypoints: [...app.waypoints.values()], routes: [...app.routes.values()] }));
      } }, 'Export waypoints & routes'),
      h('button', { class: 'btn grow', onclick: () => void importGpx(app) }, 'Import GPX'),
    ),

    h('h3', null, 'Chart'),
    h('p', { class: 'hint' }, `Basemap: ${app.basemap === 'pmtiles' ? 'offline vector chart (PMTiles)' : 'online OpenStreetMap fallback'}`),
    h(
      'div',
      { class: 'row' },
      url,
      h('button', { class: 'btn', onclick: () => void app.updateSettings({ pmtilesUrl: url.value.trim() || DEFAULT_SETTINGS.pmtilesUrl }) }, 'Apply'),
    ),
    h('button', { class: 'btn block', onclick: () => void clearTileCaches() }, 'Clear cached map tiles'),

    h('h3', null, 'About'),
    h('p', { class: 'hint' }, DISCLAIMER),
    h('button', { class: 'btn block', onclick: () => showDisclaimerOnce(true) }, 'Show disclaimer'),
    h('p', { class: 'hint' }, `GPS: ${app.gpsStatus}${app.gpsMessage ? ` – ${app.gpsMessage}` : ''} · v${__APP_VERSION__} (${__BUILD_ID__})`),
  );
}

export function openMenu(app: App): void {
  openSheet('menu', 'Settings', menuBody(app));
}

async function importGpx(app: App): Promise<void> {
  const f = await pickFile('.gpx,application/gpx+xml,application/xml,text/xml');
  if (!f) return;
  try {
    const data = parseGpx(await f.text());
    await app.importData(data);
    toast(`Imported ${data.waypoints.length} waypoints, ${data.routes.length} routes, ${data.tracks.length} tracks`);
  } catch (e) {
    toast(`Import failed: ${(e as Error).message}`);
  }
}

async function clearTileCaches(): Promise<void> {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => /tiles|pmtiles|seamark|glyph/i.test(k)).map((k) => caches.delete(k)));
  toast('Tile cache cleared');
}

function slug(s: string): string {
  return s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'export';
}

// ---------------------------------------------------------------------------

/** Re-render whichever sheet is open with fresh data. */
export function refresh(app: App): void {
  if (sheetOpen('route')) updateSheet('route', routeBody(app));
  else if (sheetOpen('wp') && currentWp) updateSheet('wp', waypointBody(app, currentWp));
  else if (sheetOpen('track')) updateSheet('track', trackBody(app));
  else if (sheetOpen('anchor')) updateSheet('anchor', anchorBody(app));
  else if (sheetOpen('menu')) updateSheet('menu', menuBody(app));
}
