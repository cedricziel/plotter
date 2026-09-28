import type { App } from '../app';
import { formatBearing, formatCoord, formatDistance, formatDuration, formatSpeed, formatTime, speedLabel } from '../core/units';
import { $, h } from './dom';

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
      nav.hidden = false;
      const parts = [
        h('span', { class: 'nav-to' }, p.finished ? '⚑ Arrived' : `➤ ${pts[p.nextIndex].name}`),
        h('span', null, h('small', null, 'DTW '), formatDistance(p.dtw, du)),
        h('span', null, h('small', null, 'BTW '), formatBearing(p.btw)),
        h('span', null, h('small', null, 'ETA '), p.ttgNext != null ? formatTime(new Date(now + p.ttgNext * 1000)) : '--:--'),
        pts.length - p.nextIndex > 1
          ? h(
              'span',
              { class: 'nav-total' },
              h('small', null, 'END '),
              `${formatDistance(p.remaining, du)} · ${p.ttg != null ? formatTime(new Date(now + p.ttg * 1000)) : '--:--'}`,
              h('small', null, p.ttg != null ? ` (${formatDuration(p.ttg)})` : ''),
            )
          : null,
      ];
      nav.replaceChildren(...parts.filter((x): x is HTMLSpanElement => !!x));
    } else {
      nav.hidden = true;
    }
  };
}
