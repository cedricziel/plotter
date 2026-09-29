import { Fragment, useEffect, useReducer, useState, type ReactNode } from 'react';
import { Marker } from 'maplibre-gl';
import type { App } from '../app';
import { shapeInfo } from '../core/course';
import { FIS_SOURCE } from '../core/fis';
import { bearing, distance } from '../core/geo';
import { bridgeLabel, noteParts } from '../core/place-info';
import { formatBearing, formatDistance } from '../core/units';
import type { Place, PlaceInfo } from '../core/waterway-data';
import { t } from '../i18n';
import { h } from './dom';
import { KIND_LABEL, KindIcon } from './icons';
import { resetSearch, SearchBox } from './search';
import { closeSheet } from './sheet';
import { createStore, useLanguage, useStore } from './store';
import { toast } from './toast';

const TIP_KEY = 'plotter.tip.destination';
const NOTE_CHARS = 80;

type Bar = { kind: 'none' } | { kind: 'placing' } | { kind: 'card'; card: ReactNode };

const NONE: Bar = { kind: 'none' };
const bar = createStore<Bar>(NONE);
let pin: Marker | null = null;

/** One-time hint (per browser) that explains how to set a destination. */
export function showTipOnce(): void {
  try {
    if (localStorage.getItem(TIP_KEY)) return;
    localStorage.setItem(TIP_KEY, '1');
  } catch {
    /* storage unavailable: skip the hint rather than repeat it */
    return;
  }
  setTimeout(() => toast('Tip: search a destination or use ⚑+ to set one', 7000), 4000);
}

export const isPlacing = () => bar.get().kind === 'placing';

/** The bottom bar: placement controls or a card, hidden when neither is up. */
export function DestBar({ app }: { app: App }) {
  const state = useStore(bar);
  return (
    <div id="dest-bar" hidden={state.kind === 'none'}>
      {state.kind === 'placing' && <Placement app={app} />}
      {state.kind === 'card' && state.card}
    </div>
  );
}

/** Puts a card in the bottom bar in place of any sheet, placement bar or other card; a toolbar tool closes it. */
export function showCard(_app: App, card: ReactNode): void {
  closeSheet();
  closeDestination();
  document.body.classList.add('destcard');
  bar.set({ kind: 'card', card });
}

/** Crosshair mode: search or pan the map under a fixed crosshair, then chart a course, go there or add a stop. */
export function startPlacement(app: App): void {
  closeSheet();
  closeDestination();
  app.setFollow(false);
  document.body.classList.add('placing');
  const map = document.querySelector('#map');
  if (map && !map.querySelector('#crosshair')) map.append(h('div', { id: 'crosshair', 'aria-hidden': 'true' }));
  bar.set({ kind: 'placing' });
}

function Placement({ app }: { app: App }) {
  const [charting, setCharting] = useState(false);
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    app.map.on('move', refresh);
    return () => void app.map.off('move', refresh);
  }, [app]);

  const c = app.map.getCenter();
  const at = () => {
    const c = app.map.getCenter();
    return { lat: c.lat, lon: c.lng };
  };
  const f = app.fix;
  const place = async (then: (id: string) => Promise<void>) => {
    const w = await app.addWaypoint(at(), false);
    closeDestination();
    await then(w.id);
  };
  const chart = async () => {
    setCharting(true);
    const to = { ...at(), name: 'Map point' };
    closeDestination();
    await chartAndShow(app, to);
  };
  const here = { lat: c.lat, lon: c.lng };
  return (
    <>
      <SearchBox app={app} scope="bar" onPick={(p) => showDestinationCard(app, p)} />
      <div className="dest-read">
        {f
          ? `${formatDistance(distance(f, here), app.settings.distanceUnit)} · ${formatBearing(bearing(f, here))}`
          : 'Pan the map to place the crosshair'}
      </div>
      <div className="row">
        <button className="btn primary grow big" disabled={charting} onClick={() => void chart()}>
          {charting ? 'Charting…' : 'Chart course'}
        </button>
      </div>
      <div className="row">
        <button className="btn grow big" onClick={() => void place((id) => app.goTo(id))}>
          Go here
        </button>
        <button
          className="btn grow big"
          onClick={() => void place(async (id) => toast(`Added to ${(await app.addStop(id)).name}`))}
        >
          Add as stop
        </button>
        <button className="btn big" onClick={closeDestination}>
          Cancel
        </button>
      </div>
    </>
  );
}

/** Leaves crosshair mode and closes the destination card. */
export function closeDestination(): void {
  if (isPlacing()) document.querySelector('#crosshair')?.remove();
  document.body.classList.remove('placing', 'destcard');
  pin?.remove();
  pin = null;
  resetSearch('bar');
  bar.set(NONE);
}

/** Charts a course and shows it: the whole route fits the map, warnings go to the toast. */
export async function chartAndShow(app: App, to: Place | { lat: number; lon: number; name: string }): Promise<void> {
  const kind = 'kind' in to ? to.kind : undefined;
  const ok = await app.chartCourse({ ...to, kind });
  const route = app.activeRoute;
  if (!ok || !route?.shape) return;
  const lons = route.shape.map((p) => p[0]);
  const lats = route.shape.map((p) => p[1]);
  app.setFollow(false);
  app.map.fitBounds(
    [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ],
    {
      padding: { top: 40, bottom: 200, left: 40, right: 40 },
      bearing: 0,
      maxZoom: 15,
      duration: 800,
    },
  );
  app.resumeFollowAfter(5000);
  const total = shapeInfo(route.shape).total;
  const note = route.warnings?.length ? ` · ${route.warnings[0]}` : '';
  toast(
    `Course charted: ${formatDistance(total, app.settings.distanceUnit)}, ${(route.maneuvers?.length ?? 2) - 2} maneuvers${note}`,
    6000,
  );
}

export type DestinationCardApp = Pick<App, 'fix' | 'settings' | 'goStraight' | 'addWaypoint' | 'addStop'>;

/** The destination card: place details and the actions for it. `chart` runs after the card has closed. */
export function DestinationCard({
  app,
  place,
  chart,
}: {
  app: DestinationCardApp;
  place: Place;
  chart: () => Promise<void>;
}) {
  // Kept as an element in the bar's store, so it follows the language itself.
  useLanguage();
  const [charting, setCharting] = useState(false);
  const f = app.fix;
  const du = app.settings.distanceUnit;
  const sub = [
    bridgeLabel(place.info) ?? KIND_LABEL[place.kind],
    f ? `${formatDistance(distance(f, place), du)} · ${formatBearing(bearing(f, place))}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="dest-card">
      <div className="dest-title">
        <KindIcon kind={place.kind} className="result-ico" />
        <span className="result-text">
          <b>{place.name}</b>
          <small>{sub}</small>
        </span>
      </div>
      <InfoRows info={place.info} />
      <button
        className="btn primary block big"
        disabled={charting}
        onClick={async () => {
          setCharting(true);
          closeDestination();
          await chart();
        }}
      >
        {charting ? t('dest.charting') : t('wp.chartCourse')}
      </button>
      <div className="row">
        <button
          className="btn grow big"
          onClick={async () => {
            closeDestination();
            await app.goStraight({ ...place });
          }}
        >
          Go straight here
        </button>
        <button
          className="btn grow big"
          onClick={async () => {
            closeDestination();
            const w = await app.addWaypoint(place, false, place.name);
            toast(`Added to ${(await app.addStop(w.id)).name}`);
          }}
        >
          Add as stop
        </button>
        <button className="btn big" aria-label="Close" onClick={closeDestination}>
          ✕
        </button>
      </div>
    </div>
  );
}

/** Fly to a search result and offer to chart a course, go straight there or add it as a stop. */
export function showDestinationCard(app: App, place: Place): void {
  closeSheet();
  closeDestination();
  app.setFollow(false);
  document.body.classList.add('destcard');
  pin = new Marker({
    element: h('div', { class: 'dest-pin', 'aria-hidden': 'true' }),
    anchor: 'center',
  })
    .setLngLat([place.lon, place.lat])
    .addTo(app.map);
  app.map.flyTo({
    center: [place.lon, place.lat],
    zoom: Math.max(app.map.getZoom(), 13.5),
    duration: 900,
  });
  bar.set({
    kind: 'card',
    card: <DestinationCard app={app} place={place} chart={() => chartAndShow(app, place)} />,
  });
}

/** The first line of a note, with the rest (or the untruncated first line) one tap away. */
function NoteRow({ text }: { text: string }) {
  const { first, rest } = noteParts(text);
  const short = first.length > NOTE_CHARS ? `${first.slice(0, NOTE_CHARS).trimEnd()}…` : first;
  if (!rest && short === first) return <>{first}</>;
  return (
    <details className="dest-note">
      <summary>{short}</summary>
      <div>{short === first ? rest : [first, rest].filter(Boolean).join('\n')}</div>
    </details>
  );
}

function InfoRows({ info }: { info: PlaceInfo | undefined }) {
  if (!info) return null;
  const rows: [string, ReactNode][] = [];
  if (info.vhf) rows.push(['VHF', `channel ${info.vhf}`]);
  if (info.berths) rows.push(['Berths', String(info.berths)]);
  if (info.clearance) rows.push(['Clearance', `${info.clearance} m${info.canOpen ? ' (closed)' : ''}`]);
  if (info.width) rows.push(['Width', `${info.width} m`]);
  if (info.openingHours) rows.push([info.source ? 'Operation' : 'Hours', <NoteRow text={info.openingHours} />]);
  if (info.operator) rows.push(['Operator', info.operator]);
  if (info.phone) {
    const digits = info.phone.replace(/[^\d+]/g, '');
    rows.push(['Phone', digits ? <a href={`tel:${digits}`}>{info.phone}</a> : info.phone]);
  }
  if (info.website && /^https?:\/\//i.test(info.website)) {
    const host = new URL(info.website).hostname.replace(/^www\./, '');
    rows.push([
      'Web',
      <a href={info.website} target="_blank" rel="noopener">
        {host}
      </a>,
    ]);
  }
  if (info.source === FIS_SOURCE) rows.push(['Source', 'Vaarweginformatie']);
  if (!rows.length) return null;
  return (
    <dl className="dest-info">
      {rows.map(([k, v]) => (
        <Fragment key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
