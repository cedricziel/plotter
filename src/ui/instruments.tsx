import type { HTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import type { App } from '../app';
import { formatBearing, formatCoord, formatDistance, formatSpeed, formatTime, speedLabel } from '../core/units';
import { language, t } from '../i18n';
import { maneuverText } from '../i18n/maneuvers';
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
  | 'followingManeuver'
  | 'updateSettings'
  | 'stopNavigation'
  | 'recalculate'
>;

const steering = (steer: number | null, sog: number | null | undefined): steer is number =>
  steer != null && sog != null && sog >= 0.5;

/** Turn needed to reach the waypoint; hidden while COG is unknown or the boat is (nearly) stationary. */
function SteerCue({ steer, sog }: { steer: number | null; sog: number | null | undefined }) {
  if (!steering(steer, sog)) return null;
  const deg = Math.round(Math.abs(steer));
  if (deg <= 5) return <span className="nav-steer on">{`▲ ${t('nav.onCourse')}`}</span>;
  return <span className={`nav-steer${deg > 20 ? ' far' : ''}`}>{steer < 0 ? `◀ ${deg}°` : `${deg}° ▶`}</span>;
}

const StopButton = ({ app }: { app: InstrumentsApp }) => (
  <button
    className="nav-stop"
    aria-label={t('nav.stop')}
    title={t('nav.stop')}
    onClick={() => void app.stopNavigation()}
  >
    ✕
  </button>
);

/** A reading with its unit set small after it, as in "1.3 km". */
function Reading({ value }: { value: string }) {
  const m = /^(.*\d) ([^\d\s]+)$/.exec(value);
  if (!m) return value;
  return (
    <>
      {m[1]}
      <em>{` ${m[2]}`}</em>
    </>
  );
}

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
      <Reading value={value} />
    </div>
  </div>
);

/** The dashboard's readings: speed, course and GPS; while navigating, speed and the leg. */
export function Instruments({ app }: { app: InstrumentsApp }) {
  const f = app.fix;
  const lang = language();
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
  const reading = st === 'ok' && !!f;
  const accClass = [st !== 'ok' || acc > 30 ? 'bad' : st === 'ok' && acc <= 10 ? 'good' : '', !reading && 'status']
    .filter(Boolean)
    .join(' ');
  const p = app.progress;
  const pts = app.routePoints(app.activeRoute);
  const navigating = !!p && !!pts[p.nextIndex];

  let leg: ReactNode = null;
  if (navigating) {
    const du = app.settings.distanceUnit;
    const now = Date.now();
    const dist = (m: number) => formatDistance(m, du, lang);
    const time = (secs: number | null) => (secs != null ? formatTime(new Date(now + secs * 1000), lang) : '--:--');
    const toEnd = pts.length - p.nextIndex > 1;
    leg = (
      <>
        {/* On a phone the arrival at the end takes the place of DTW, which the guidance card already shows. */}
        <Tile id="dtw" label="DTW" value={dist(p.dtw)} className={toEnd ? 'wide' : undefined} />
        {p.xte != null ? (
          <Tile
            id="xte"
            label={`XTE ${p.xte > 0 ? '◀' : '▶'}`}
            value={dist(Math.abs(p.xte))}
            className={Math.abs(p.xte) > 50 ? 'wide warn' : 'wide'}
          />
        ) : (
          <Tile
            id="vmg"
            label="VMG"
            value={formatSpeed(p.vmg != null ? Math.max(0, p.vmg) : null, unit, lang)}
            className="wide"
          />
        )}
        <Tile id="eta" label="ETA" value={time(p.ttgNext)} />
        {toEnd && <Tile id="end" label={t('nav.end')} unit={dist(p.remaining)} value={time(p.ttg)} />}
      </>
    );
  }

  return (
    <div id="instruments" aria-live="off" className={stale ? 'stale' : undefined}>
      <Tile
        id="sog"
        label="SOG"
        unit={speedLabel(unit)}
        value={formatSpeed(f?.sog, unit, lang)}
        role="button"
        tabIndex={0}
        title={t('inst.sogTitle')}
        onClick={toggleSpeedUnit}
        onKeyDown={onKeyDown}
      />
      <Tile id="cog" label="COG" value={formatBearing(f?.cog)} className={navigating ? 'wide' : undefined} />
      {(!leg || !reading) && (
        <Tile
          id="acc"
          label="GPS"
          className={accClass}
          value={reading ? `±${Math.round(f.accuracy)} m` : t(`inst.gps.${st}`)}
        />
      )}
      {leg}
    </div>
  );
}

const elapsed = (secs: number) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor(secs / 60) % 60;
  const s = String(secs % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

/**
 * The status card over the chart's top-left corner (bottom-left while navigating): the clock, the GPS state, how long a
 * track has recorded, and the position.
 */
export function StatusPill({ app }: { app: Pick<App, 'fix' | 'gpsStatus' | 'recording'> }) {
  const f = app.fix;
  const lang = language();
  const st = app.gpsStatus;
  const reading = st === 'ok' && !!f;
  const good = reading && f.accuracy <= 30;
  const stale = !f || Date.now() - f.time > 15_000;
  const rec = app.recording;
  return (
    <div id="status-pill" className="glass">
      <div className="pill-row">
        <b className="pill-time" data-value="time">
          {formatTime(new Date(), lang)}
        </b>
        <span className="pill-sep" aria-hidden="true" />
        <span className="pill-gps">
          <i className={`dot${good ? '' : ' bad'}`} />
          {`GPS ${reading ? `±${Math.round(f.accuracy)} m` : t(`inst.gps.${st}`)}`}
        </span>
        {rec && (
          <>
            <span className="pill-sep" aria-hidden="true" />
            <span className="pill-rec">
              <i className="dot rec" />
              {`${t('status.rec')} ${elapsed(Math.max(0, Math.floor((Date.now() - rec.started) / 1000)))}`}
            </span>
          </>
        )}
      </div>
      <div className={`pill-pos${stale ? ' stale' : ''}`} data-value="pos" role="group" aria-label={t('inst.position')}>
        {f ? `${formatCoord(f.lat, 'lat', lang)} ${formatCoord(f.lon, 'lon', lang)}` : '--°--.---′ ---°--.---′'}
      </div>
    </div>
  );
}

/** The guidance card over the chart: the next maneuver, how far it is and which way to steer. Keeps its elements across renders so a tap in progress still lands. */
export function NavStrip({ app }: { app: InstrumentsApp }) {
  const p = app.progress;
  const pts = app.routePoints(app.activeRoute);
  let content: ReactNode = null;

  if (p && pts[p.nextIndex]) {
    const lang = language();
    const dist = (m: number) => formatDistance(m, app.settings.distanceUnit, lang);
    const m = p.finished ? null : app.nextManeuver();
    const then = m && app.followingManeuver();
    content = (
      <>
        <div className="nav-top">
          {m && <ManeuverIcon type={m.type} className="nav-ico" />}
          <div className="nav-main">
            {!p.finished && <div className="nav-dist">{dist(p.dtw)}</div>}
            {m ? (
              <div className="nav-text">{maneuverText(m)}</div>
            ) : (
              <div className="nav-to">{p.finished ? `⚑ ${t('nav.arrived')}` : `➤ ${pts[p.nextIndex].name}`}</div>
            )}
          </div>
          <StopButton app={app} />
        </div>
        {(app.offCourse || app.recalculating) && (
          <button className="nav-off" disabled={app.recalculating} onClick={() => void app.recalculate()}>
            {app.recalculating ? t('nav.recalculating') : t('nav.offCourse')}
          </button>
        )}
        <div className="nav-sub">
          {steering(p.steer, app.fix?.sog) ? (
            <SteerCue steer={p.steer} sog={app.fix?.sog} />
          ) : (
            <span className="nav-btw">{`BTW ${formatBearing(p.btw)}`}</span>
          )}
          {then && <span className="nav-next">{`➤ ${maneuverText(then)}`}</span>}
        </div>
      </>
    );
  } else if (app.activeRoute && pts.length) {
    const st = app.gpsStatus;
    const why =
      st === 'denied'
        ? t('nav.wait.denied')
        : st === 'unavailable' || st === 'lost'
          ? t('nav.wait.noSignal')
          : t('nav.wait.searching');
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
