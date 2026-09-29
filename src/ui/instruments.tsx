import type { HTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import type { App } from '../app';
import { formatBearing, formatCoord, formatDistance, formatSpeed, formatTime, speedLabel } from '../core/units';
import { ManeuverIcon } from './icons';

export type InstrumentsApp = Pick<
  App,
  | 'fix'
  | 'gpsStatus'
  | 'settings'
  | 'progress'
  | 'activeRoute'
  | 'offCourse'
  | 'recalculating'
  | 'routePoints'
  | 'nextManeuver'
  | 'updateSettings'
  | 'stopNavigation'
  | 'recalculate'
>;

const Cell = ({ label, value, cls = '' }: { label: string; value: string; cls?: string }) => (
  <div className={`nav-cell ${cls}`}>
    <small>{label}</small>
    <b>{value}</b>
  </div>
);

/** Turn needed to reach the waypoint; hidden while COG is unknown or the boat is (nearly) stationary. */
function SteerCue({ steer, sog }: { steer: number | null; sog: number | null | undefined }) {
  if (steer == null || sog == null || sog < 0.5) return null;
  const deg = Math.round(Math.abs(steer));
  if (deg <= 5) return <span className="nav-steer on">▲ on course</span>;
  return <span className={`nav-steer${deg > 20 ? ' far' : ''}`}>{steer < 0 ? `◀ ${deg}°` : `${deg}° ▶`}</span>;
}

const StopButton = ({ app }: { app: InstrumentsApp }) => (
  <button
    className="nav-stop"
    aria-label="Stop navigation"
    title="Stop navigation"
    onClick={() => void app.stopNavigation()}
  >
    ✕
  </button>
);

interface TileProps extends HTMLAttributes<HTMLDivElement> {
  id: string;
  label: string;
  unit?: string;
  value: string;
}

const Tile = ({ id, label, unit, value, className, ...rest }: TileProps) => (
  <div className={`inst inst-${id}${className ? ` ${className}` : ''}`} {...rest}>
    <div className="inst-label">
      {label}
      <span className="inst-unit" data-unit={id}>
        {unit ? ` ${unit}` : ''}
      </span>
    </div>
    <div className="inst-value" data-value={id}>
      {value}
    </div>
  </div>
);

/** Top instrument bar. */
export function Instruments({ app }: { app: InstrumentsApp }) {
  const f = app.fix;
  const stale = !f || Date.now() - f.time > 15_000;
  const st = app.gpsStatus;
  const unit = app.settings.speedUnit;
  const toggleSpeedUnit = () => void app.updateSettings({ speedUnit: unit === 'kmh' ? 'kn' : 'kmh' });
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.key === ' ') e.preventDefault();
    toggleSpeedUnit();
  };
  const acc = f?.accuracy ?? 999;
  const accClass = st !== 'ok' || acc > 30 ? 'bad' : st === 'ok' && acc <= 10 ? 'good' : '';

  return (
    <header id="instruments" aria-live="off" className={stale ? 'stale' : undefined}>
      <Tile
        id="sog"
        label="SOG"
        unit={speedLabel(unit)}
        value={formatSpeed(f?.sog, unit)}
        role="button"
        tabIndex={0}
        title="Tap to switch km/h / knots"
        onClick={toggleSpeedUnit}
        onKeyDown={onKeyDown}
      />
      <Tile id="cog" label="COG" value={formatBearing(f?.cog)} />
      <Tile
        id="pos"
        label="POSITION"
        value={f ? `${formatCoord(f.lat, 'lat')}\n${formatCoord(f.lon, 'lon')}` : '--°--.---′\n---°--.---′'}
      />
      <Tile id="time" label="TIME" value={formatTime(new Date())} />
      <Tile
        id="acc"
        label="GPS"
        className={accClass}
        value={st === 'ok' && f ? `±${Math.round(f.accuracy)} m` : st === 'searching' ? 'search…' : st.toUpperCase()}
      />
    </header>
  );
}

/** Navigation strip below the instruments. Keeps its elements across renders so a tap in progress still lands. */
export function NavStrip({ app }: { app: InstrumentsApp }) {
  const p = app.progress;
  const pts = app.routePoints(app.activeRoute);
  let content: ReactNode = null;

  if (p && pts[p.nextIndex]) {
    const du = app.settings.distanceUnit;
    const now = Date.now();
    const m = app.nextManeuver();
    content = (
      <>
        <div className="nav-top">
          {m && !p.finished ? (
            <span className="nav-to nav-maneuver">
              <ManeuverIcon type={m.type} className="nav-ico" />
              <span className="nav-text">{p.dtw > 40 ? `In ${formatDistance(p.dtw, du)} — ${m.text}` : m.text}</span>
            </span>
          ) : (
            <span className="nav-to">{p.finished ? '⚑ Arrived' : `➤ ${pts[p.nextIndex].name}`}</span>
          )}
          <SteerCue steer={p.steer} sog={app.fix?.sog} />
          <StopButton app={app} />
        </div>
        {(app.offCourse || app.recalculating) && (
          <button className="nav-off" disabled={app.recalculating} onClick={() => void app.recalculate()}>
            {app.recalculating ? 'Recalculating…' : 'Off course — Recalculate'}
          </button>
        )}
        <div className="nav-cells">
          <Cell label="DTW" value={formatDistance(p.dtw, du)} />
          <Cell label="BTW" value={formatBearing(p.btw)} />
          {p.xte != null ? (
            <Cell
              label={`XTE ${p.xte > 0 ? '◀' : '▶'}`}
              value={formatDistance(Math.abs(p.xte), du)}
              cls={Math.abs(p.xte) > 50 ? 'warn' : ''}
            />
          ) : (
            <Cell label="VMG" value={formatSpeed(p.vmg != null ? Math.max(0, p.vmg) : null, app.settings.speedUnit)} />
          )}
          <Cell label="ETA" value={p.ttgNext != null ? formatTime(new Date(now + p.ttgNext * 1000)) : '--:--'} />
          {pts.length - p.nextIndex > 1 && (
            <Cell
              label={`END ${p.ttg != null ? formatTime(new Date(now + p.ttg * 1000)) : '--:--'}`}
              value={formatDistance(p.remaining, du)}
            />
          )}
        </div>
      </>
    );
  } else if (app.activeRoute && pts.length) {
    const st = app.gpsStatus;
    const why =
      st === 'denied'
        ? 'Location is blocked. Allow it for this site to start guidance.'
        : st === 'unavailable' || st === 'lost'
          ? 'No GPS signal yet. Guidance starts with the first fix.'
          : 'Waiting for a GPS fix. Guidance starts with the first fix.';
    content = (
      <>
        <div className="nav-top">
          <span className="nav-to">{`➤ ${pts[pts.length - 1].name}`}</span>
          <StopButton app={app} />
        </div>
        <div className="nav-wait">{why}</div>
      </>
    );
  }

  return (
    <div id="navstrip" hidden={content === null}>
      {content}
    </div>
  );
}
