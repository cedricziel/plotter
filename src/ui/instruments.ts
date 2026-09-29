import type { App } from '../app';
import { formatBearing, formatCoord, formatDistance, formatSpeed, formatTime, speedLabel } from '../core/units';
import { $, h } from './dom';
import { maneuverIcon, iconEl } from './icons';

const cell = (label: string, value: string, cls = '') =>
  h('div', { class: `nav-cell ${cls}` }, h('small', null, label), h('b', null, value));

/** Turn needed to reach the waypoint; hidden while COG is unknown or the boat is (nearly) stationary. */
function steerCue(steer: number | null, sog: number | null | undefined): HTMLElement | null {
  if (steer == null || sog == null || sog < 0.5) return null;
  const deg = Math.round(Math.abs(steer));
  if (deg <= 5) return h('span', { class: 'nav-steer on' }, '▲ on course');
  return h('span', { class: `nav-steer${deg > 20 ? ' far' : ''}` }, steer < 0 ? `◀ ${deg}°` : `${deg}° ▶`);
}

/** Top instrument bar + navigation strip. Built once, updated in place. */
export function mountInstruments(app: App): () => void {
  const bar = $('#instruments');
  const tile = (key: string, label: string, extra: Record<string, unknown> = {}) =>
    h(
      'div',
      { class: `inst inst-${key}`, ...extra },
      h('div', { class: 'inst-label' }, label, h('span', { class: 'inst-unit', 'data-unit': key })),
      h('div', { class: 'inst-value', 'data-value': key }),
    );

  const toggleSpeedUnit = () => void app.updateSettings({ speedUnit: app.settings.speedUnit === 'kmh' ? 'kn' : 'kmh' });

  bar.replaceChildren(
    tile('sog', 'SOG', {
      role: 'button',
      tabindex: 0,
      title: 'Tap to switch km/h / knots',
      onclick: toggleSpeedUnit,
      onkeydown: (e: KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.key === ' ') e.preventDefault();
        toggleSpeedUnit();
      },
    }),
    tile('cog', 'COG'),
    tile('pos', 'POSITION'),
    tile('time', 'TIME'),
    tile('acc', 'GPS'),
  );

  const set = (key: string, v: string) => {
    const el = bar.querySelector(`[data-value="${key}"]`)!;
    if (el.textContent !== v) el.textContent = v;
  };
  const unit = (key: string, v: string) => {
    bar.querySelector(`[data-unit="${key}"]`)!.textContent = v ? ` ${v}` : '';
  };

  const nav = $('#navstrip');

  return () => {
    const f = app.fix;
    const stale = !f || Date.now() - f.time > 15_000;
    bar.classList.toggle('stale', stale);
    set('sog', formatSpeed(f?.sog, app.settings.speedUnit));
    unit('sog', speedLabel(app.settings.speedUnit));
    set('cog', formatBearing(f?.cog));
    set('pos', f ? `${formatCoord(f.lat, 'lat')}\n${formatCoord(f.lon, 'lon')}` : '--°--.---′\n---°--.---′');
    set('time', formatTime(new Date()));
    const st = app.gpsStatus;
    set('acc', st === 'ok' && f ? `±${Math.round(f.accuracy)} m` : st === 'searching' ? 'search…' : st.toUpperCase());
    const accEl = bar.querySelector('.inst-acc')!;
    accEl.classList.toggle('bad', st !== 'ok' || (f?.accuracy ?? 999) > 30);
    accEl.classList.toggle('good', st === 'ok' && (f?.accuracy ?? 999) <= 10);

    const p = app.progress;
    const pts = app.routePoints(app.activeRoute);
    if (p && pts[p.nextIndex]) {
      const du = app.settings.distanceUnit;
      const now = Date.now();
      const m = app.nextManeuver();
      nav.hidden = false;
      nav.replaceChildren(
        h(
          'div',
          { class: 'nav-top' },
          m && !p.finished
            ? h(
                'span',
                { class: 'nav-to nav-maneuver' },
                iconEl(maneuverIcon(m.type), 'nav-ico'),
                h('span', { class: 'nav-text' }, p.dtw > 40 ? `In ${formatDistance(p.dtw, du)} — ${m.text}` : m.text),
              )
            : h('span', { class: 'nav-to' }, p.finished ? '⚑ Arrived' : `➤ ${pts[p.nextIndex].name}`),
          steerCue(p.steer, f?.sog),
          h('button', { class: 'nav-stop', 'aria-label': 'Stop navigation', title: 'Stop navigation', onclick: () => void app.stopNavigation() }, '✕'),
        ),
        ...(app.offCourse || app.recalculating
          ? [
              h(
                'button',
                { class: 'nav-off', disabled: app.recalculating, onclick: () => void app.recalculate() },
                app.recalculating ? 'Recalculating…' : 'Off course — Recalculate',
              ),
            ]
          : []),
        h(
          'div',
          { class: 'nav-cells' },
          cell('DTW', formatDistance(p.dtw, du)),
          cell('BTW', formatBearing(p.btw)),
          p.xte != null
            ? cell(`XTE ${p.xte > 0 ? '◀' : '▶'}`, formatDistance(Math.abs(p.xte), du), Math.abs(p.xte) > 50 ? 'warn' : '')
            : cell('VMG', formatSpeed(p.vmg != null ? Math.max(0, p.vmg) : null, app.settings.speedUnit)),
          cell('ETA', p.ttgNext != null ? formatTime(new Date(now + p.ttgNext * 1000)) : '--:--'),
          pts.length - p.nextIndex > 1
            ? cell(`END ${p.ttg != null ? formatTime(new Date(now + p.ttg * 1000)) : '--:--'}`, formatDistance(p.remaining, du))
            : null,
        ),
      );
    } else if (app.activeRoute && pts.length) {
      const why =
        st === 'denied'
          ? 'Location is blocked. Allow it for this site to start guidance.'
          : st === 'unavailable' || st === 'lost'
            ? 'No GPS signal yet. Guidance starts with the first fix.'
            : 'Waiting for a GPS fix. Guidance starts with the first fix.';
      nav.hidden = false;
      nav.replaceChildren(
        h(
          'div',
          { class: 'nav-top' },
          h('span', { class: 'nav-to' }, `➤ ${pts[pts.length - 1].name}`),
          h('button', { class: 'nav-stop', 'aria-label': 'Stop navigation', title: 'Stop navigation', onclick: () => void app.stopNavigation() }, '✕'),
        ),
        h('div', { class: 'nav-wait' }, why),
      );
    } else {
      nav.hidden = true;
    }
  };
}
