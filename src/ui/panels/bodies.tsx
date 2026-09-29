import { type InputHTMLAttributes, type ReactNode, useReducer, useRef } from 'react';
import type { App } from '../../app';
import { bearing, distance, routeLegs, timeToGo } from '../../core/geo';
import { parseGpx, toGpx } from '../../core/gpx';
import type { Route } from '../../core/model';
import { convertSpeed, formatBearing, formatCoord, formatDistance, formatDuration, formatTime, speedLabel } from '../../core/units';
import { type CogMinutes, DEFAULT_SETTINGS } from '../../settings';
import { chartAndShow, showDestinationCard, startPlacement } from '../destination';
import { DISCLAIMER, showDisclaimerOnce } from '../disclaimer';
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
      { value: true, label: 'On' },
      { value: false, label: 'Off' },
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
        ⌖ Set destination
      </button>
      {route && (
        <button className="btn danger block" onClick={() => void app.stopNavigation()}>
          ■ Stop navigation
        </button>
      )}
      <div className="row">
        <select
          className="grow"
          aria-label="Active route"
          value={route?.id ?? ''}
          onChange={(e) => void app.updateSettings({ activeRouteId: e.target.value || null })}
        >
          <option value="">— no active route —</option>
          {routes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => void app.createRoute()}>
          + New
        </button>
      </div>

      {route?.maneuvers ? <CourseBlock app={app} route={route} /> : route ? <LegsBlock app={app} route={route} /> : null}

      <h3>{`Waypoints (${wps.length})`}</h3>
      {wps.length ? (
        <ul className="list">
          {wps.map(({ w, d }) => (
            <li key={w.id}>
              <button className="list-item" onClick={() => openWaypoint(app as App, w.id)}>
                <span>{w.name}</span>
                <small>{d != null ? `${formatDistance(d, du)} · ${formatBearing(bearing(fix!, w))}` : ''}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Long-press the map (right-click on desktop) to drop a waypoint.</p>
      )}
      <TripsBlock app={app} />
    </div>
  );
}

function LegsBlock({ app, route }: { app: RouteApp; route: Route }) {
  const du = app.settings.distanceUnit;
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
    return (
      <li key={i} className={`leg ${done ? 'done' : ''} ${prog?.nextIndex === i ? 'next' : ''}`}>
        <span className="leg-no">{i + 1}</span>
        <button className="leg-name link" onClick={() => openWaypoint(app as App, w.id)}>
          {w.name}
          <small>{leg ? `${formatDistance(leg.distance, du)} · ${formatBearing(leg.bearing)}` : 'start'}</small>
        </button>
        <span className="leg-eta">{etaCell}</span>
        <span className="leg-actions">
          <button className="icon-btn sm" title="Steer to this waypoint" onClick={() => app.setNextIndex(i)}>
            ➤
          </button>
          <button className="icon-btn sm" title="Move up" disabled={i === 0} onClick={() => moveInRoute(app, route, i, -1)}>
            ↑
          </button>
          <button
            className="icon-btn sm"
            title="Remove from route"
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
        <Stat label="Total" value={formatDistance(total, du)} />
        <Stat label="To go" value={prog ? formatDistance(prog.remaining, du) : '--'} />
        <Stat label="ETA" value={prog?.ttg != null ? formatTime(new Date(now + prog.ttg * 1000)) : '--:--'} />
        <Stat label="TTG" value={formatDuration(prog?.ttg ?? null)} />
      </div>
      {pts.length ? <ol className="legs">{rows}</ol> : <p className="hint">This route has no waypoints yet.</p>}
      <div className="row">
        <select
          className="grow"
          aria-label="Add waypoint to route"
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            route.waypointIds.push(id);
            void app.saveRoute(route);
          }}
        >
          <option value="">{candidates.length ? '+ add waypoint…' : 'long-press the map to add waypoints'}</option>
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
            const n = prompt('Route name', route.name);
            if (n) void app.saveRoute({ ...route, name: n.trim() || route.name });
          }}
        >
          Rename
        </button>
        <button
          className="btn"
          onClick={() => {
            route.waypointIds.reverse();
            app.setNextIndex(0);
            void app.saveRoute(route);
          }}
        >
          Reverse
        </button>
        <button className="btn" onClick={() => exportRoute(app, route)}>
          Export GPX
        </button>
        <button
          className="btn danger"
          onClick={() => {
            if (confirm(`Delete route “${route.name}”? Waypoints are kept.`)) void app.deleteRoute(route.id);
          }}
        >
          Delete
        </button>
      </div>
    </>
  );
}

const megabytes = (b: number) => `${(b / 1e6).toFixed(b < 1e7 ? 1 : 0)} MB`;

/** Summary, warnings, actions and the maneuver list of a charted course. */
function CourseBlock({ app, route }: { app: RouteApp; route: Route }) {
  const du = app.settings.distanceUnit;
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
        <Stat label="Total" value={formatDistance(total, du)} />
        <Stat label="To go" value={formatDistance(toGo, du)} />
        <Stat label="ETA" value={prog?.ttg != null ? formatTime(new Date(now + prog.ttg * 1000)) : '--:--'} />
        <Stat label="TTG" value={formatDuration(prog?.ttg ?? null)} />
      </div>
      {route.source === 'offline' && <p className="hint">Charted offline from a saved corridor.</p>}
      {!!route.warnings?.length && (
        <ul className="warnings">
          {route.warnings.map((w, i) => (
            <li key={i}>{`⚠ ${w}`}</li>
          ))}
        </ul>
      )}
      <div className="row wrap">
        <button className="btn grow" disabled={app.recalculating} onClick={() => void app.recalculate()}>
          {app.recalculating ? 'Recalculating…' : '↻ Recalculate'}
        </button>
        {route.tripId ? (
          <button className="btn grow" disabled>
            ✓ Saved offline
          </button>
        ) : (
          <button className="btn grow" disabled={!!app.offline} onClick={() => void app.saveForOffline(route)}>
            {job ? 'Saving…' : '⇩ Save for offline'}
          </button>
        )}
      </div>
      {job && (
        <div className="row">
          <progress className="grow" max={Math.max(1, job.total)} value={job.done} />
          <small>{job.phase === 'estimating' ? 'Estimating…' : `${job.done}/${job.total}`}</small>
          <button className="btn" onClick={() => job.cancel()}>
            Cancel
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
                  {m.text}
                  <small>
                    {ahead != null && i > 0 && !passed ? `in ${formatDistance(ahead, du)}` : i === 0 ? 'start' : formatDistance(m.dist, du)}
                  </small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="row wrap">
        <button className="btn" onClick={() => exportRoute(app, route)}>
          Export GPX
        </button>
        <button
          className="btn danger"
          onClick={() => {
            if (confirm(`Delete course “${route.name}”?`)) void app.deleteRoute(route.id);
          }}
        >
          Delete
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
      <h3>{`Saved offline (${trips.length})`}</h3>
      <ul className="list">
        {trips.map((t) => (
          <li key={t.id} className="track-item">
            <div className="list-item grow">
              <span>{t.name}</span>
              <small>{`${megabytes(t.bytes)} · ${t.tileCount} tiles · ${new Date(t.savedAt).toLocaleDateString()}`}</small>
            </div>
            <button
              className="icon-btn sm"
              aria-label={`Delete saved trip ${t.name}`}
              onClick={() => {
                if (confirm(`Delete the saved corridor “${t.name}”? Cached map tiles expire on their own or via Settings.`)) {
                  void app.deleteTrip(t.id);
                }
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
}: { value: string; onCommit: (raw: string, reset: () => void) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
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
        placeholder="unknown"
        aria-label={label}
        onCommit={(raw, reset) => {
          const n = raw === '' ? null : Number(raw.replace(',', '.'));
          if (n != null && (!Number.isFinite(n) || n < 0 || n > 100)) {
            toast('Enter a size in metres between 0 and 100, or leave it empty');
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
  const label = `Cruise speed (${speedLabel(unit)})`;
  return (
    <>
      <DimensionField app={app} label="Air draft (m)" k="airDraft" value={s.airDraft} />
      <DimensionField app={app} label="Draft (m)" k="draft" value={s.draft} />
      <DimensionField app={app} label="Beam (m)" k="beam" value={s.beam} />
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
            if (!Number.isFinite(n) || n < 1 || n > 60) return toast('Enter a cruise speed between 1 and 60');
            void app.updateSettings({ cruiseSpeed: n / convertSpeed(1, unit) });
          }}
        />
      </div>
      <p className="hint">
        {'Charted courses avoid bridges, depths and widths that do not fit and warn about fixed bridges with unknown clearance. ' +
          'The cruise speed gives the ETA while the boat is not moving. Leave a size empty if unknown.'}
      </p>
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
  openSheet('route', 'Route & waypoints', () => (
    <RoutePanel app={app} search={<SearchBox app={app} scope="sheet" onPick={(p) => showDestinationCard(app, p)} />} />
  ));
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
  if (!w) return <p>Waypoint deleted.</p>;
  const du = app.settings.distanceUnit;
  const fix = app.fix;
  const route = app.activeRoute;
  const inRoute = route?.waypointIds.includes(id);

  return (
    <div>
      <div className="field">
        <label className="field-label">Name</label>
        <CommitInput
          type="text"
          value={w.name}
          aria-label="Waypoint name"
          maxLength={40}
          onCommit={(raw) => void app.updateWaypoint(id, { name: raw || w.name })}
        />
      </div>
      <div className="stats">
        <Stat label="Position" value={`${formatCoord(w.lat, 'lat')}\n${formatCoord(w.lon, 'lon')}`} cls="wide mono" />
        <Stat label="Distance" value={fix ? formatDistance(distance(fix, w), du) : '--'} />
        <Stat label="Bearing" value={fix ? formatBearing(bearing(fix, w)) : '---°'} />
        <Stat label="TTG" value={formatDuration(fix ? timeToGo(distance(fix, w), fix.sog) : null)} />
      </div>
      <p className="hint">Drag the marker on the map to move it.</p>
      <div className="row wrap">
        <button
          className="btn primary"
          onClick={() => {
            closeSheet();
            void chartAndShow(app as App, { name: w.name, lat: w.lat, lon: w.lon });
          }}
        >
          Chart course
        </button>
        <button
          className="btn"
          onClick={async () => {
            await app.goTo(id);
            closeSheet();
          }}
        >
          Go to
        </button>
        <button
          className="btn"
          disabled={!!inRoute}
          onClick={async () => {
            const r = route ?? (await app.createRoute());
            r.waypointIds.push(id);
            await app.saveRoute(r);
            toast(`Added to ${r.name}`);
          }}
        >
          {inRoute ? 'In route' : route ? `Add to “${route.name}”` : 'Start new route'}
        </button>
        <button
          className="btn"
          onClick={() => {
            app.setFollow(false);
            app.map.easeTo({ center: [w.lon, w.lat], zoom: Math.max(app.map.getZoom(), 14) });
          }}
        >
          Show
        </button>
        <button
          className="btn danger"
          onClick={() => {
            if (confirm(`Delete waypoint “${w.name}”?`)) {
              void app.deleteWaypoint(id);
              closeSheet();
            }
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function openWaypoint(app: App, id: string): void {
  openSheet('wp', app.waypoints.get(id)?.name ?? 'Waypoint', () => <WaypointPanel app={app} id={id} />);
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
  const rec = app.recording;
  const tracks = [...app.tracks.values()].sort((a, b) => b.started - a.started);

  return (
    <div>
      {rec ? (
        <div>
          <div className="stats">
            <Stat label="Recording" value="● REC" cls="rec" />
            <Stat label="Distance" value={formatDistance(routeLegs(rec.points).total, du)} />
            <Stat label="Time" value={formatDuration((Date.now() - rec.started) / 1000)} />
            <Stat label="Points" value={String(rec.points.length)} />
          </div>
          <button className="btn danger block big" onClick={() => void app.stopRecording()}>
            ■ Stop recording
          </button>
        </div>
      ) : (
        <button className="btn primary block big" onClick={() => void app.startRecording()}>
          ● Start recording
        </button>
      )}
      <OnOff label="Show saved tracks on map" value={app.settings.showTracks} onPick={(v) => void app.updateSettings({ showTracks: v })} />
      <h3>{`Tracks (${tracks.length})`}</h3>
      {tracks.length ? (
        <ul className="list">
          {tracks.map((t) => (
            <li key={t.id} className="track-item">
              <button
                className="list-item grow"
                onClick={() => {
                  const n = prompt('Track name', t.name);
                  if (n?.trim()) void app.renameTrack(t.id, n.trim());
                }}
              >
                <span>
                  {t.name}
                  {t === rec ? ' ●' : ''}
                </span>
                <small>{`${formatDistance(routeLegs(t.points).total, du)} · ${formatDuration(((t.ended ?? Date.now()) - t.started) / 1000)} · ${t.points.length} pts`}</small>
              </button>
              <button
                className="btn sm"
                disabled={t.points.length === 0}
                onClick={() => download(`${slug(t.name)}.gpx`, toGpx({ tracks: [t] }))}
              >
                GPX
              </button>
              <button
                className="icon-btn sm"
                aria-label="Delete track"
                onClick={() => {
                  if (confirm(`Delete “${t.name}”?`)) void app.deleteTrack(t.id);
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">No tracks yet.</p>
      )}
    </div>
  );
}

export function openTrack(app: App): void {
  openSheet('track', 'Track recording', () => <TrackPanel app={app} />);
}

// ---------------------------------------------------------------------------
// Anchor
// ---------------------------------------------------------------------------

let pendingRadius = 40;

export type AnchorApp = Pick<
  App,
  | 'anchor'
  | 'anchorCheck'
  | 'fix'
  | 'wakeLock'
  | 'map'
  | 'setAnchor'
  | 'setAnchorRadius'
  | 'armAnchor'
  | 'clearAnchor'
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
  const stateText = !a ? 'Not set' : !a.armed ? 'Set – alarm off' : check?.state === 'alarm' ? 'OUTSIDE' : check?.state === 'warning' ? 'Near limit' : 'Holding';

  return (
    <div>
      <div className="stats">
        <Stat label="Status" value={stateText} cls={a?.armed ? `anchor-${check?.state ?? 'ok'}` : ''} />
        <Stat label="Distance" value={check ? `${Math.round(check.distance)} m` : '--'} />
        <Stat label="GPS acc." value={app.fix ? `±${Math.round(app.fix.accuracy)} m` : '--'} />
        <Stat label="Wake lock" value={app.wakeLock.active ? 'On' : app.wakeLock.supported ? 'Off' : 'n/a'} />
      </div>
      <div className="field">
        <div className="field-label">Swing radius</div>
        <div className="stepper">
          <button className="btn big" aria-label="Decrease radius" onClick={() => setR(radius - (radius > 100 ? 25 : 5))}>
            −
          </button>
          <div className="stepper-value">{`${radius} m`}</div>
          <button className="btn big" aria-label="Increase radius" onClick={() => setR(radius + (radius >= 100 ? 25 : 5))}>
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
          ⚓ Drop at my position
        </button>
        <button
          className="btn grow"
          onClick={() => {
            const c = app.map.getCenter();
            void app.setAnchor({ lat: c.lat, lon: c.lng }, radius);
          }}
        >
          ⌖ Drop at map centre
        </button>
      </div>
      {a && (
        <div className="row wrap">
          {a.armed ? (
            <button className="btn block big" onClick={() => void app.armAnchor(false)}>
              Disarm alarm
            </button>
          ) : (
            <button className="btn primary block big" onClick={() => void app.armAnchor(true)}>
              Arm anchor alarm
            </button>
          )}
          <button className="btn danger" onClick={() => void app.clearAnchor()}>
            Remove anchor
          </button>
        </div>
      )}
      <p className="hint">
        {'Keep this app open and in the foreground with the charger connected: browsers pause GPS when the screen turns off. ' +
          'The alarm also sounds if the GPS signal is lost for 30 s.'}
      </p>
    </div>
  );
}

export function openAnchor(app: App): void {
  openSheet('anchor', 'Anchor alarm', () => <AnchorPanel app={app} />);
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

export function SettingsPanel({ app, telemetry, version }: { app: SettingsApp; telemetry: Telemetry; version: string }) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const s = app.settings;
  const urlRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<typeof s>) => void app.updateSettings(patch);

  return (
    <div>
      <h3>Display</h3>
      <Segmented
        label="Speed"
        current={s.speedUnit}
        options={[
          { value: 'kmh', label: 'km/h' },
          { value: 'kn', label: 'knots' },
        ]}
        onPick={(v) => set({ speedUnit: v })}
      />
      <Segmented
        label="Distance"
        current={s.distanceUnit}
        options={[
          { value: 'metric', label: 'm / km' },
          { value: 'nautical', label: 'NM' },
        ]}
        onPick={(v) => set({ distanceUnit: v })}
      />
      <Segmented<CogMinutes>
        label="Course line (COG vector)"
        current={s.cogMinutes}
        options={[
          { value: 0, label: 'Off' },
          { value: 5, label: '5 min' },
          { value: 10, label: '10 min' },
          { value: 30, label: '30 min' },
        ]}
        onPick={(v) => set({ cogMinutes: v })}
      />
      <Segmented
        label="Palette"
        current={s.theme}
        options={[
          { value: 'day', label: '☀ Day' },
          { value: 'night', label: '☾ Night' },
        ]}
        onPick={(v) => set({ theme: v })}
      />
      <OnOff label="Seamarks" value={s.seamarks} onPick={(v) => set({ seamarks: v })} />
      <OnOff label="OpenSeaMap overlay (online)" value={s.openseamap} onPick={(v) => set({ openseamap: v })} />
      <OnOff label="Aerial photo (online)" value={s.aerial} onPick={(v) => set({ aerial: v })} />
      <p className="hint">The aerial photo (PDOK Luchtfoto) is not saved for offline use and is hidden at night.</p>
      <OnOff label="Keep screen awake" value={s.keepAwake} onPick={(v) => set({ keepAwake: v })} />
      <OnOff
        label="Ship heading from compass"
        value={s.compass}
        onPick={(v) => void (v ? app.enableCompass() : app.updateSettings({ compass: false }))}
      />
      <p className="hint">
        Points the ship symbol where the top of the screen faces: mount the device with its top towards the bow. The course line still shows the course over ground.
      </p>

      <h3>Vessel &amp; routing</h3>
      <VesselFields app={app} />
      <OnOff label="Voice prompts" value={s.voicePrompts} onPick={(v) => set({ voicePrompts: v })} />

      <h3>Data (GPX)</h3>
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
          Export waypoints &amp; routes
        </button>
        <button className="btn grow" onClick={() => void importGpx(app)}>
          Import GPX
        </button>
      </div>

      <h3>Chart</h3>
      <p className="hint">{`Basemap: ${app.basemap === 'pmtiles' ? 'offline vector chart (PMTiles)' : 'online OpenStreetMap fallback'}`}</p>
      <div className="row">
        <input key={s.pmtilesUrl} ref={urlRef} type="url" defaultValue={s.pmtilesUrl} aria-label="PMTiles URL" className="grow" />
        <button
          className="btn"
          onClick={() => void app.updateSettings({ pmtilesUrl: urlRef.current!.value.trim() || DEFAULT_SETTINGS.pmtilesUrl })}
        >
          Apply
        </button>
      </div>
      <button className="btn block" onClick={() => void clearTileCaches()}>
        Clear cached map tiles
      </button>

      <h3>About</h3>
      <OnOff
        label="Send diagnostics"
        value={telemetry.enabled()}
        onPick={(v) => {
          telemetry.set(v);
          rerender();
        }}
      />
      <p className="hint">Errors, load timing and request durations, never your position or searches. Off stops sending now; On applies after a reload.</p>
      <p className="hint">{DISCLAIMER}</p>
      <button className="btn block" onClick={() => showDisclaimerOnce(true)}>
        Show disclaimer
      </button>
      <p className="hint">{`GPS: ${app.gpsStatus}${app.gpsMessage ? ` – ${app.gpsMessage}` : ''} · v${version}`}</p>
    </div>
  );
}

async function importGpx(app: Pick<App, 'importData'>): Promise<void> {
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
