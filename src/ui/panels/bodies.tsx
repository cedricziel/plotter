import { type InputHTMLAttributes, type ReactNode, useReducer, useRef } from 'react';
import type { App } from '../../app';
import { bearing, distance, routeLegs, timeToGo } from '../../core/geo';
import { parseGpx, toGpx } from '../../core/gpx';
import type { Route } from '../../core/model';
import {
  convertSpeed,
  formatBearing,
  formatCoord,
  formatDistance,
  formatDuration,
  formatTime,
  speedLabel,
} from '../../core/units';
import { language, num, plural, t, type LanguageChoice } from '../../i18n';
import { maneuverText } from '../../i18n/maneuvers';
import { warningText } from '../../i18n/texts';
import { type CogMinutes, DEFAULT_SETTINGS } from '../../settings';
import { chartAndShow, showDestinationCard, startPlacement } from '../destination';
import { disclaimerText, showDisclaimerOnce } from '../disclaimer';
import { download, fileStamp, pickFile, toast } from '../dom';
import { ManeuverIcon } from '../icons';
import { SearchBox } from '../search';
import { closeSheet, openSheet } from '../sheet';

type Opt<T> = { value: T; label: string };

function Segmented<T extends string | number | boolean>({
  label,
  current,
  options,
  onPick,
}: {
  label: string;
  current: T;
  options: Opt<T>[];
  onPick: (v: T) => void;
}) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            className={o.value === current ? 'seg active' : 'seg'}
            role="radio"
            aria-checked={o.value === current}
            onClick={() => onPick(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const OnOff = ({ label, value, onPick }: { label: string; value: boolean; onPick: (v: boolean) => void }) => (
  <Segmented
    label={label}
    current={value}
    options={[
      { value: true, label: t('common.on') },
      { value: false, label: t('common.off') },
    ]}
    onPick={onPick}
  />
);

const Stat = ({ label, value, cls = '' }: { label: string; value: string; cls?: string }) => (
  <div className={`stat ${cls}`}>
    <div className="stat-label">{label}</div>
    <div className="stat-value">{value}</div>
  </div>
);

// ---------------------------------------------------------------------------
// Route & waypoints
// ---------------------------------------------------------------------------

export type RouteApp = Pick<
  App,
  | 'settings'
  | 'activeRoute'
  | 'routes'
  | 'waypoints'
  | 'trips'
  | 'fix'
  | 'progress'
  | 'offline'
  | 'recalculating'
  | 'map'
  | 'updateSettings'
  | 'createRoute'
  | 'stopNavigation'
  | 'routePoints'
  | 'setNextIndex'
  | 'saveRoute'
  | 'deleteRoute'
  | 'deleteTrip'
  | 'recalculate'
  | 'saveForOffline'
  | 'setFollow'
>;

/** `search` is the place-search box, injected so the panel renders without the network. */
export function RoutePanel({ app, search }: { app: RouteApp; search?: ReactNode }) {
  const du = app.settings.distanceUnit;
  const lang = language();
  const route = app.activeRoute;
  const routes = [...app.routes.values()].sort((a, b) => a.created - b.created);

  const fix = app.fix;
  const wps = [...app.waypoints.values()]
    .filter((w) => !w.hidden)
    .map((w) => ({ w, d: fix ? distance(fix, w) : null }))
    .sort((a, b) => (a.d ?? 0) - (b.d ?? 0) || a.w.name.localeCompare(b.w.name));

  return (
    <div>
      {search}
      <button className="btn primary block" onClick={() => startPlacement(app as App)}>
        {`⌖ ${t('fab.destination')}`}
      </button>
      {route && (
        <button className="btn danger block" onClick={() => void app.stopNavigation()}>
          {`■ ${t('nav.stop')}`}
        </button>
      )}
      <div className="row">
        <select
          className="grow"
          aria-label={t('route.active')}
          value={route?.id ?? ''}
          onChange={(e) => void app.updateSettings({ activeRouteId: e.target.value || null })}
        >
          <option value="">{t('route.none')}</option>
          {routes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => void app.createRoute()}>
          {t('route.new')}
        </button>
      </div>

      {route?.maneuvers ? (
        <CourseBlock app={app} route={route} />
      ) : route ? (
        <LegsBlock app={app} route={route} />
      ) : null}

      <h3>{t('route.waypoints', { count: wps.length })}</h3>
      {wps.length ? (
        <ul className="list">
          {wps.map(({ w, d }) => (
            <li key={w.id}>
              <button className="list-item" onClick={() => openWaypoint(app as App, w.id)}>
                <span>{w.name}</span>
                <small>{d != null ? `${formatDistance(d, du, lang)} · ${formatBearing(bearing(fix!, w))}` : ''}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">{t('route.noWaypoints')}</p>
      )}
      <TripsBlock app={app} />
    </div>
  );
}

function LegsBlock({ app, route }: { app: RouteApp; route: Route }) {
  const du = app.settings.distanceUnit;
  const lang = language();
  const dist = (m: number) => formatDistance(m, du, lang);
  const clock = (at: number) => formatTime(new Date(at), lang);
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
      etaCell = Number.isFinite(cum) ? clock(now + cum * 1000) : '';
    }
    const done = prog ? i < prog.nextIndex : false;
    return (
      <li key={i} className={`leg ${done ? 'done' : ''} ${prog?.nextIndex === i ? 'next' : ''}`}>
        <span className="leg-no">{i + 1}</span>
        <button className="leg-name link" onClick={() => openWaypoint(app as App, w.id)}>
          {w.name}
          <small>{leg ? `${dist(leg.distance)} · ${formatBearing(leg.bearing)}` : t('route.start')}</small>
        </button>
        <span className="leg-eta">{etaCell}</span>
        <span className="leg-actions">
          <button className="icon-btn sm" title={t('route.steerTo')} onClick={() => app.setNextIndex(i)}>
            ➤
          </button>
          <button
            className="icon-btn sm"
            title={t('route.moveUp')}
            disabled={i === 0}
            onClick={() => moveInRoute(app, route, i, -1)}
          >
            ↑
          </button>
          <button
            className="icon-btn sm"
            title={t('route.remove')}
            onClick={() => {
              route.waypointIds.splice(i, 1);
              void app.saveRoute(route);
            }}
          >
            ✕
          </button>
        </span>
      </li>
    );
  });

  const inRoute = new Set(route.waypointIds);
  const candidates = [...app.waypoints.values()].filter((w) => !inRoute.has(w.id));

  return (
    <>
      <div className="stats">
        <Stat label={t('stat.total')} value={dist(total)} />
        <Stat label={t('stat.toGo')} value={prog ? dist(prog.remaining) : '--'} />
        <Stat label={t('stat.eta')} value={prog?.ttg != null ? clock(now + prog.ttg * 1000) : '--:--'} />
        <Stat label={t('stat.ttg')} value={formatDuration(prog?.ttg ?? null, lang)} />
      </div>
      {pts.length ? <ol className="legs">{rows}</ol> : <p className="hint">{t('route.empty')}</p>}
      <div className="row">
        <select
          className="grow"
          aria-label={t('route.addWaypoint')}
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            route.waypointIds.push(id);
            void app.saveRoute(route);
          }}
        >
          <option value="">{candidates.length ? t('route.addWaypointOption') : t('route.addWaypointHint')}</option>
          {candidates.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>
      <div className="row wrap">
        <button
          className="btn"
          onClick={() => {
            const n = prompt(t('route.namePrompt'), route.name);
            if (n) void app.saveRoute({ ...route, name: n.trim() || route.name });
          }}
        >
          {t('route.rename')}
        </button>
        <button
          className="btn"
          onClick={() => {
            route.waypointIds.reverse();
            app.setNextIndex(0);
            void app.saveRoute(route);
          }}
        >
          {t('route.reverse')}
        </button>
        <button className="btn" onClick={() => exportRoute(app, route)}>
          {t('common.exportGpx')}
        </button>
        <button
          className="btn danger"
          onClick={() => {
            if (confirm(t('route.confirmDelete', { name: route.name }))) void app.deleteRoute(route.id);
          }}
        >
          {t('common.delete')}
        </button>
      </div>
    </>
  );
}

const megabytes = (b: number) => `${num(b / 1e6, b < 1e7 ? 1 : 0)} MB`;

/** Summary, warnings, actions and the maneuver list of a charted course. */
function CourseBlock({ app, route }: { app: RouteApp; route: Route }) {
  const du = app.settings.distanceUnit;
  const lang = language();
  const dist = (m: number) => formatDistance(m, du, lang);
  const prog = app.progress;
  const maneuvers = route.maneuvers ?? [];
  const total = maneuvers[maneuvers.length - 1]?.dist ?? 0;
  const now = Date.now();
  const nextWp = route.waypointIds[prog?.nextIndex ?? 0];
  const toGo = prog ? prog.remaining : total;
  const job = app.offline?.routeId === route.id ? app.offline : null;

  return (
    <div className="course">
      <div className="stats">
        <Stat label={t('stat.total')} value={dist(total)} />
        <Stat label={t('stat.toGo')} value={dist(toGo)} />
        <Stat
          label={t('stat.eta')}
          value={prog?.ttg != null ? formatTime(new Date(now + prog.ttg * 1000), lang) : '--:--'}
        />
        <Stat label={t('stat.ttg')} value={formatDuration(prog?.ttg ?? null, lang)} />
      </div>
      {route.source === 'offline' && <p className="hint">{t('course.offline')}</p>}
      {!!route.warnings?.length && (
        <ul className="warnings">
          {route.warnings.map((w, i) => (
            <li key={i}>{`⚠ ${warningText(w)}`}</li>
          ))}
        </ul>
      )}
      <div className="row wrap">
        <button className="btn grow" disabled={app.recalculating} onClick={() => void app.recalculate()}>
          {app.recalculating ? t('nav.recalculating') : `↻ ${t('course.recalculate')}`}
        </button>
        {route.tripId ? (
          <button className="btn grow" disabled>
            {`✓ ${t('course.savedOffline')}`}
          </button>
        ) : (
          <button className="btn grow" disabled={!!app.offline} onClick={() => void app.saveForOffline(route)}>
            {job ? t('course.saving') : `⇩ ${t('course.saveOffline')}`}
          </button>
        )}
      </div>
      {job && (
        <div className="row">
          <progress className="grow" max={Math.max(1, job.total)} value={job.done} />
          <small>{job.phase === 'estimating' ? t('course.estimating') : `${job.done}/${job.total}`}</small>
          <button className="btn" onClick={() => job.cancel()}>
            {t('common.cancel')}
          </button>
        </div>
      )}
      <ol className="maneuvers">
        {maneuvers.map((m, i) => {
          const passed = !!prog && i > 0 && route.waypointIds.indexOf(m.wp ?? '') < prog.nextIndex;
          const isNext = !!nextWp && m.wp === nextWp;
          const ahead = prog ? Math.max(0, m.dist - (total - prog.remaining)) : null;
          return (
            <li key={i} className={`maneuver${passed ? ' done' : ''}${isNext ? ' next' : ''}`}>
              <button
                className="maneuver-row link"
                onClick={() => {
                  app.setFollow(false);
                  app.map.easeTo({ center: [m.lon, m.lat], zoom: Math.max(app.map.getZoom(), 15) });
                }}
              >
                <ManeuverIcon type={m.type} className="maneuver-ico" />
                <span className="maneuver-text">
                  {maneuverText(m)}
                  <small>
                    {ahead != null && i > 0 && !passed
                      ? t('route.inDistance', { distance: dist(ahead) })
                      : i === 0
                        ? t('route.start')
                        : dist(m.dist)}
                  </small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="row wrap">
        <button className="btn" onClick={() => exportRoute(app, route)}>
          {t('common.exportGpx')}
        </button>
        <button
          className="btn danger"
          onClick={() => {
            if (confirm(t('course.confirmDelete', { name: route.name }))) void app.deleteRoute(route.id);
          }}
        >
          {t('common.delete')}
        </button>
      </div>
    </div>
  );
}

/** Corridors saved for offline use, with their size and a delete action. */
function TripsBlock({ app }: { app: Pick<RouteApp, 'trips' | 'deleteTrip'> }) {
  if (!app.trips.length) return null;
  const trips = [...app.trips].sort((a, b) => b.savedAt - a.savedAt);
  return (
    <div className="trips">
      <h3>{t('trips.title', { count: trips.length })}</h3>
      <ul className="list">
        {trips.map((trip) => (
          <li key={trip.id} className="track-item">
            <div className="list-item grow">
              <span>{trip.name}</span>
              <small>
                {[
                  megabytes(trip.bytes),
                  plural('trips.tiles', trip.tileCount),
                  new Date(trip.savedAt).toLocaleDateString(language()),
                ].join(' · ')}
              </small>
            </div>
            <button
              className="icon-btn sm"
              aria-label={t('trips.delete', { name: trip.name })}
              onClick={() => {
                if (confirm(t('trips.confirmDelete', { name: trip.name }))) void app.deleteTrip(trip.id);
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Uncontrolled and keyed by the stored value: a refresh never resets a half-typed entry. Commits on blur or Enter
 * (like the native `change` event), and only when the text differs from what is stored.
 */
function CommitInput({
  value,
  onCommit,
  ...attrs
}: { value: string; onCommit: (raw: string, reset: () => void) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
>) {
  const commit = (el: HTMLInputElement) => {
    if (el.value === value) return;
    onCommit(el.value.trim(), () => (el.value = value));
  };
  return (
    <input
      key={value}
      defaultValue={value}
      onBlur={(e) => commit(e.currentTarget)}
      onKeyDown={(e) => e.key === 'Enter' && commit(e.currentTarget)}
      {...attrs}
    />
  );
}

function DimensionField({
  app,
  label,
  k,
  value,
}: {
  app: Pick<App, 'updateSettings'>;
  label: string;
  k: 'airDraft' | 'draft' | 'beam';
  value: number | null;
}) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <CommitInput
        type="number"
        inputMode="decimal"
        min={0}
        max={100}
        step={0.1}
        value={value == null ? '' : String(value)}
        placeholder={t('vessel.unknown')}
        aria-label={label}
        onCommit={(raw, reset) => {
          const n = raw === '' ? null : Number(raw.replace(',', '.'));
          if (n != null && (!Number.isFinite(n) || n < 0 || n > 100)) {
            toast(t('vessel.sizeInvalid'));
            reset();
            return;
          }
          void app.updateSettings({ [k]: n });
        }}
      />
    </div>
  );
}

function VesselFields({ app }: { app: Pick<App, 'settings' | 'updateSettings'> }) {
  const s = app.settings;
  const unit = s.speedUnit;
  const label = t('vessel.cruiseSpeed', { unit: speedLabel(unit) });
  return (
    <>
      <DimensionField app={app} label={t('vessel.airDraft')} k="airDraft" value={s.airDraft} />
      <DimensionField app={app} label={t('vessel.draft')} k="draft" value={s.draft} />
      <DimensionField app={app} label={t('vessel.beam')} k="beam" value={s.beam} />
      <div className="field">
        <label className="field-label">{label}</label>
        <CommitInput
          type="number"
          inputMode="decimal"
          min={1}
          max={60}
          step={0.5}
          value={String(Number(convertSpeed(s.cruiseSpeed, unit).toFixed(1)))}
          aria-label={label}
          onCommit={(raw) => {
            const n = Number(raw.replace(',', '.'));
            if (!Number.isFinite(n) || n < 1 || n > 60) return toast(t('vessel.speedInvalid'));
            void app.updateSettings({ cruiseSpeed: n / convertSpeed(1, unit) });
          }}
        />
      </div>
      <p className="hint">{t('vessel.hint')}</p>
    </>
  );
}

function moveInRoute(app: Pick<App, 'saveRoute'>, route: Route, i: number, dir: -1 | 1): void {
  const j = i + dir;
  if (j < 0 || j >= route.waypointIds.length) return;
  [route.waypointIds[i], route.waypointIds[j]] = [route.waypointIds[j], route.waypointIds[i]];
  void app.saveRoute(route);
}

function exportRoute(app: Pick<App, 'routePoints'>, route: Route): void {
  const wps = app.routePoints(route);
  download(`${slug(route.name)}.gpx`, toGpx({ waypoints: wps, routes: [route] }));
}

export function openRoute(app: App): void {
  openSheet(
    'route',
    () => t('sheet.route'),
    () => (
      <RoutePanel
        app={app}
        search={<SearchBox app={app} scope="sheet" onPick={(p) => showDestinationCard(app, p)} />}
      />
    ),
  );
}

// ---------------------------------------------------------------------------
// Single waypoint
// ---------------------------------------------------------------------------

export type WaypointApp = Pick<
  App,
  | 'settings'
  | 'fix'
  | 'waypoints'
  | 'activeRoute'
  | 'map'
  | 'updateWaypoint'
  | 'goTo'
  | 'createRoute'
  | 'saveRoute'
  | 'setFollow'
  | 'deleteWaypoint'
>;

export function WaypointPanel({ app, id }: { app: WaypointApp; id: string }) {
  const w = app.waypoints.get(id);
  if (!w) return <p>{t('wp.deleted')}</p>;
  const du = app.settings.distanceUnit;
  const lang = language();
  const fix = app.fix;
  const route = app.activeRoute;
  const inRoute = route?.waypointIds.includes(id);

  return (
    <div>
      <div className="field">
        <label className="field-label">{t('wp.name')}</label>
        <CommitInput
          type="text"
          value={w.name}
          aria-label={t('wp.nameLabel')}
          maxLength={40}
          onCommit={(raw) => void app.updateWaypoint(id, { name: raw || w.name })}
        />
      </div>
      <div className="stats">
        <Stat
          label={t('stat.position')}
          value={`${formatCoord(w.lat, 'lat', lang)}\n${formatCoord(w.lon, 'lon', lang)}`}
          cls="wide mono"
        />
        <Stat label={t('stat.distance')} value={fix ? formatDistance(distance(fix, w), du, lang) : '--'} />
        <Stat label={t('stat.bearing')} value={fix ? formatBearing(bearing(fix, w)) : '---°'} />
        <Stat label={t('stat.ttg')} value={formatDuration(fix ? timeToGo(distance(fix, w), fix.sog) : null, lang)} />
      </div>
      <p className="hint">{t('wp.dragHint')}</p>
      <div className="row wrap">
        <button
          className="btn primary"
          onClick={() => {
            closeSheet();
            void chartAndShow(app as App, { name: w.name, lat: w.lat, lon: w.lon });
          }}
        >
          {t('wp.chartCourse')}
        </button>
        <button
          className="btn"
          onClick={async () => {
            await app.goTo(id);
            closeSheet();
          }}
        >
          {t('wp.goTo')}
        </button>
        <button
          className="btn"
          disabled={!!inRoute}
          onClick={async () => {
            const r = route ?? (await app.createRoute());
            r.waypointIds.push(id);
            await app.saveRoute(r);
            toast(t('wp.addedTo', { name: r.name }));
          }}
        >
          {inRoute ? t('wp.inRoute') : route ? t('wp.addTo', { name: route.name }) : t('wp.newRoute')}
        </button>
        <button
          className="btn"
          onClick={() => {
            app.setFollow(false);
            app.map.easeTo({ center: [w.lon, w.lat], zoom: Math.max(app.map.getZoom(), 14) });
          }}
        >
          {t('wp.show')}
        </button>
        <button
          className="btn danger"
          onClick={() => {
            if (confirm(t('wp.confirmDelete', { name: w.name }))) {
              void app.deleteWaypoint(id);
              closeSheet();
            }
          }}
        >
          {t('common.delete')}
        </button>
      </div>
    </div>
  );
}

export function openWaypoint(app: App, id: string): void {
  openSheet(
    'wp',
    () => app.waypoints.get(id)?.name ?? t('sheet.waypoint'),
    () => <WaypointPanel app={app} id={id} />,
  );
}

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

export type TrackApp = Pick<
  App,
  | 'settings'
  | 'recording'
  | 'tracks'
  | 'startRecording'
  | 'stopRecording'
  | 'updateSettings'
  | 'renameTrack'
  | 'deleteTrack'
>;

export function TrackPanel({ app }: { app: TrackApp }) {
  const du = app.settings.distanceUnit;
  const lang = language();
  const rec = app.recording;
  const tracks = [...app.tracks.values()].sort((a, b) => b.started - a.started);

  return (
    <div>
      {rec ? (
        <div>
          <div className="stats">
            <Stat label={t('track.recording')} value={`● ${t('track.rec')}`} cls="rec" />
            <Stat label={t('stat.distance')} value={formatDistance(routeLegs(rec.points).total, du, lang)} />
            <Stat label={t('stat.time')} value={formatDuration((Date.now() - rec.started) / 1000, lang)} />
            <Stat label={t('stat.points')} value={String(rec.points.length)} />
          </div>
          <button className="btn danger block big" onClick={() => void app.stopRecording()}>
            {`■ ${t('track.stop')}`}
          </button>
        </div>
      ) : (
        <button className="btn primary block big" onClick={() => void app.startRecording()}>
          {`● ${t('track.start')}`}
        </button>
      )}
      <OnOff
        label={t('track.showSaved')}
        value={app.settings.showTracks}
        onPick={(v) => void app.updateSettings({ showTracks: v })}
      />
      <h3>{t('track.title', { count: tracks.length })}</h3>
      {tracks.length ? (
        <ul className="list">
          {tracks.map((track) => (
            <li key={track.id} className="track-item">
              <button
                className="list-item grow"
                onClick={() => {
                  const n = prompt(t('track.namePrompt'), track.name);
                  if (n?.trim()) void app.renameTrack(track.id, n.trim());
                }}
              >
                <span>
                  {track.name}
                  {track === rec ? ' ●' : ''}
                </span>
                <small>
                  {[
                    formatDistance(routeLegs(track.points).total, du, lang),
                    formatDuration(((track.ended ?? Date.now()) - track.started) / 1000, lang),
                    plural('track.points', track.points.length),
                  ].join(' · ')}
                </small>
              </button>
              <button
                className="btn sm"
                disabled={track.points.length === 0}
                onClick={() => download(`${slug(track.name)}.gpx`, toGpx({ tracks: [track] }))}
              >
                {t('track.gpx')}
              </button>
              <button
                className="icon-btn sm"
                aria-label={t('track.delete')}
                onClick={() => {
                  if (confirm(t('track.confirmDelete', { name: track.name }))) void app.deleteTrack(track.id);
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">{t('track.none')}</p>
      )}
    </div>
  );
}

export function openTrack(app: App): void {
  openSheet(
    'track',
    () => t('sheet.track'),
    () => <TrackPanel app={app} />,
  );
}

// ---------------------------------------------------------------------------
// Anchor
// ---------------------------------------------------------------------------

let pendingRadius = 40;

export type AnchorApp = Pick<
  App,
  'anchor' | 'anchorCheck' | 'fix' | 'wakeLock' | 'map' | 'setAnchor' | 'setAnchorRadius' | 'armAnchor' | 'clearAnchor'
>;

export function AnchorPanel({ app }: { app: AnchorApp }) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const a = app.anchor;
  const radius = a?.radius ?? pendingRadius;
  const setR = (r: number) => {
    pendingRadius = Math.max(5, Math.min(1000, r));
    if (a) void app.setAnchorRadius(pendingRadius);
    else rerender();
  };
  const check = app.anchorCheck;
  const stateText = !a
    ? t('anchor.notSet')
    : !a.armed
      ? t('anchor.setOff')
      : check?.state === 'alarm'
        ? t('anchor.outside')
        : check?.state === 'warning'
          ? t('anchor.near')
          : t('anchor.holding');

  return (
    <div>
      <div className="stats">
        <Stat label={t('stat.status')} value={stateText} cls={a?.armed ? `anchor-${check?.state ?? 'ok'}` : ''} />
        <Stat label={t('stat.distance')} value={check ? `${Math.round(check.distance)} m` : '--'} />
        <Stat label={t('anchor.gpsAccuracy')} value={app.fix ? `±${Math.round(app.fix.accuracy)} m` : '--'} />
        <Stat
          label={t('anchor.wakeLock')}
          value={app.wakeLock.active ? t('common.on') : app.wakeLock.supported ? t('common.off') : t('common.na')}
        />
      </div>
      <div className="field">
        <div className="field-label">{t('anchor.radius')}</div>
        <div className="stepper">
          <button
            className="btn big"
            aria-label={t('anchor.decrease')}
            onClick={() => setR(radius - (radius > 100 ? 25 : 5))}
          >
            −
          </button>
          <div className="stepper-value">{`${radius} m`}</div>
          <button
            className="btn big"
            aria-label={t('anchor.increase')}
            onClick={() => setR(radius + (radius >= 100 ? 25 : 5))}
          >
            +
          </button>
        </div>
      </div>
      <div className="row wrap">
        <button
          className="btn grow"
          disabled={!app.fix}
          onClick={() => app.fix && void app.setAnchor({ lat: app.fix.lat, lon: app.fix.lon }, radius)}
        >
          {`⚓ ${t('anchor.dropHere')}`}
        </button>
        <button
          className="btn grow"
          onClick={() => {
            const c = app.map.getCenter();
            void app.setAnchor({ lat: c.lat, lon: c.lng }, radius);
          }}
        >
          {`⌖ ${t('anchor.dropCentre')}`}
        </button>
      </div>
      {a && (
        <div className="row wrap">
          {a.armed ? (
            <button className="btn block big" onClick={() => void app.armAnchor(false)}>
              {t('anchor.disarm')}
            </button>
          ) : (
            <button className="btn primary block big" onClick={() => void app.armAnchor(true)}>
              {t('anchor.arm')}
            </button>
          )}
          <button className="btn danger" onClick={() => void app.clearAnchor()}>
            {t('anchor.remove')}
          </button>
        </div>
      )}
      <p className="hint">{t('anchor.hint')}</p>
    </div>
  );
}

export function openAnchor(app: App): void {
  openSheet(
    'anchor',
    () => t('sheet.anchor'),
    () => <AnchorPanel app={app} />,
  );
}

// ---------------------------------------------------------------------------
// Menu / settings
// ---------------------------------------------------------------------------

export type SettingsApp = Pick<
  App,
  | 'settings'
  | 'basemap'
  | 'gpsStatus'
  | 'gpsMessage'
  | 'waypoints'
  | 'routes'
  | 'updateSettings'
  | 'enableCompass'
  | 'importData'
>;

/** Diagnostics opt-in and the build version are passed in so the bodies stay free of telemetry side effects and build-time globals. */
export interface Telemetry {
  enabled(): boolean;
  set(v: boolean): void;
}

export function SettingsPanel({
  app,
  telemetry,
  version,
}: {
  app: SettingsApp;
  telemetry: Telemetry;
  version: string;
}) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const s = app.settings;
  const urlRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<typeof s>) => void app.updateSettings(patch);

  const minutes = (count: number) => t('menu.minutes', { count });

  return (
    <div>
      <h3>{t('menu.display')}</h3>
      <Segmented<LanguageChoice>
        label={t('menu.language')}
        current={s.language}
        options={[
          { value: 'auto', label: t('menu.languageAuto') },
          // Each language in its own name, so it can be found whatever is set.
          { value: 'en', label: 'English' },
          { value: 'de', label: 'Deutsch' },
        ]}
        onPick={(v) => set({ language: v })}
      />
      <p className="hint">{t('menu.languageHint')}</p>
      <Segmented
        label={t('menu.speed')}
        current={s.speedUnit}
        options={[
          { value: 'kmh', label: 'km/h' },
          { value: 'kn', label: t('menu.knots') },
        ]}
        onPick={(v) => set({ speedUnit: v })}
      />
      <Segmented
        label={t('menu.distance')}
        current={s.distanceUnit}
        options={[
          { value: 'metric', label: 'm / km' },
          { value: 'nautical', label: 'NM' },
        ]}
        onPick={(v) => set({ distanceUnit: v })}
      />
      <Segmented<CogMinutes>
        label={t('menu.courseLine')}
        current={s.cogMinutes}
        options={[
          { value: 0, label: t('common.off') },
          { value: 5, label: minutes(5) },
          { value: 10, label: minutes(10) },
          { value: 30, label: minutes(30) },
        ]}
        onPick={(v) => set({ cogMinutes: v })}
      />
      <Segmented
        label={t('menu.palette')}
        current={s.theme}
        options={[
          { value: 'day', label: `☀ ${t('menu.day')}` },
          { value: 'night', label: `☾ ${t('menu.night')}` },
        ]}
        onPick={(v) => set({ theme: v })}
      />
      <OnOff label={t('menu.seamarks')} value={s.seamarks} onPick={(v) => set({ seamarks: v })} />
      <OnOff label={t('menu.openseamap')} value={s.openseamap} onPick={(v) => set({ openseamap: v })} />
      <OnOff label={t('menu.aerial')} value={s.aerial} onPick={(v) => set({ aerial: v })} />
      <p className="hint">{t('menu.aerialHint')}</p>
      <OnOff label={t('menu.keepAwake')} value={s.keepAwake} onPick={(v) => set({ keepAwake: v })} />
      <OnOff
        label={t('menu.compass')}
        value={s.compass}
        onPick={(v) => void (v ? app.enableCompass() : app.updateSettings({ compass: false }))}
      />
      <p className="hint">{t('menu.compassHint')}</p>

      <h3>{t('menu.vessel')}</h3>
      <VesselFields app={app} />
      <OnOff label={t('menu.voice')} value={s.voicePrompts} onPick={(v) => set({ voicePrompts: v })} />

      <h3>{t('menu.data')}</h3>
      <div className="row wrap">
        <button
          className="btn grow"
          onClick={() =>
            download(
              `plotter-waypoints-routes-${fileStamp()}.gpx`,
              toGpx({ waypoints: [...app.waypoints.values()], routes: [...app.routes.values()] }),
            )
          }
        >
          {t('menu.export')}
        </button>
        <button className="btn grow" onClick={() => void importGpx(app)}>
          {t('menu.import')}
        </button>
      </div>

      <h3>{t('menu.chart')}</h3>
      <p className="hint">
        {t('menu.basemap', { source: app.basemap === 'pmtiles' ? t('menu.basemapPmtiles') : t('menu.basemapOsm') })}
      </p>
      <div className="row">
        <input
          key={s.pmtilesUrl}
          ref={urlRef}
          type="url"
          defaultValue={s.pmtilesUrl}
          aria-label={t('menu.pmtilesUrl')}
          className="grow"
        />
        <button
          className="btn"
          onClick={() =>
            void app.updateSettings({ pmtilesUrl: urlRef.current!.value.trim() || DEFAULT_SETTINGS.pmtilesUrl })
          }
        >
          {t('menu.apply')}
        </button>
      </div>
      <button className="btn block" onClick={() => void clearTileCaches()}>
        {t('menu.clearTiles')}
      </button>

      <h3>{t('menu.about')}</h3>
      <OnOff
        label={t('menu.diagnostics')}
        value={telemetry.enabled()}
        onPick={(v) => {
          telemetry.set(v);
          rerender();
        }}
      />
      <p className="hint">{t('menu.diagnosticsHint')}</p>
      <p className="hint">{disclaimerText()}</p>
      <button className="btn block" onClick={() => showDisclaimerOnce(true)}>
        {t('menu.showDisclaimer')}
      </button>
      <p className="hint">
        {t('menu.gps', { status: t(`gps.${app.gpsStatus}`) })}
        {app.gpsMessage ? ` – ${app.gpsMessage}` : ''}
        {` · v${version}`}
      </p>
    </div>
  );
}

async function importGpx(app: Pick<App, 'importData'>): Promise<void> {
  const f = await pickFile('.gpx,application/gpx+xml,application/xml,text/xml');
  if (!f) return;
  try {
    const data = parseGpx(await f.text());
    await app.importData(data);
    const { waypoints, routes, tracks } = data;
    toast(t('menu.imported', { waypoints: waypoints.length, routes: routes.length, tracks: tracks.length }));
  } catch (e) {
    toast(t('menu.importFailed', { message: (e as Error).message }));
  }
}

async function clearTileCaches(): Promise<void> {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => /tiles|pmtiles|seamark|glyph/i.test(k)).map((k) => caches.delete(k)));
  toast(t('menu.tilesCleared'));
}

function slug(s: string): string {
  return (
    s
      .replace(/[^\w\- ]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'export'
  );
}
