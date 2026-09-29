import { Marker } from 'maplibre-gl';
import type { App } from '../app';
import { shapeInfo } from '../core/course';
import { bearing, distance } from '../core/geo';
import { formatBearing, formatDistance } from '../core/units';
import type { Place } from '../core/waterway-data';
import { $, h, toast } from './dom';
import { KIND_LABEL, kindIcon, iconEl } from './icons';
import { resetSearch, searchBox } from './search';
import { closeSheet } from './sheet';

const TIP_KEY = 'plotter.tip.destination';

let wired = false;
let placing = false;
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

export const isPlacing = () => placing;

function wire(app: App): void {
  if (wired) return;
  wired = true;
  app.map.on('move', () => update(app));
  app.subscribe(() => update(app));
  // Any toolbar tool (sheet) replaces the placement bar and the destination card.
  $('#toolbar').addEventListener('click', closeDestination, true);
}

/** Crosshair mode: search or pan the map under a fixed crosshair, then chart a course, go there or add a stop. */
export function startPlacement(app: App): void {
  closeSheet();
  closeDestination();
  app.setFollow(false);
  placing = true;
  document.body.classList.add('placing');
  const bar = $('#dest-bar');
  const map = $('#map');
  if (!map.querySelector('#crosshair')) map.append(h('div', { id: 'crosshair', 'aria-hidden': 'true' }));

  const readout = h('div', { class: 'dest-read' });
  const at = () => {
    const c = app.map.getCenter();
    return { lat: c.lat, lon: c.lng };
  };
  const place = async (then: (id: string) => Promise<void>) => {
    const w = await app.addWaypoint(at(), false);
    closeDestination();
    await then(w.id);
  };
  const chart = async (btn: HTMLButtonElement) => {
    btn.disabled = true;
    btn.textContent = 'Charting…';
    const to = { ...at(), name: 'Map point' };
    closeDestination();
    await chartAndShow(app, to);
  };
  const chartBtn = h('button', { class: 'btn primary grow big', onclick: () => void chart(chartBtn) }, 'Chart course');
  bar.replaceChildren(
    searchBox(app, 'bar', (p) => showDestinationCard(app, p)),
    readout,
    h('div', { class: 'row' }, chartBtn),
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'btn grow big',
          onclick: () => void place((id) => app.goTo(id)),
        },
        'Go here',
      ),
      h(
        'button',
        {
          class: 'btn grow big',
          onclick: () => void place(async (id) => toast(`Added to ${(await app.addStop(id)).name}`)),
        },
        'Add as stop',
      ),
      h('button', { class: 'btn big', onclick: closeDestination }, 'Cancel'),
    ),
  );
  bar.hidden = false;
  update(app);
  wire(app);
}

/** Leaves crosshair mode and closes the destination card. */
export function closeDestination(): void {
  if (placing) {
    placing = false;
    document.body.classList.remove('placing');
    document.querySelector('#crosshair')?.remove();
  }
  document.body.classList.remove('destcard');
  pin?.remove();
  pin = null;
  resetSearch('bar');
  $('#dest-bar').hidden = true;
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

  const f = app.fix;
  const du = app.settings.distanceUnit;
  const sub = [
    KIND_LABEL[place.kind],
    f ? `${formatDistance(distance(f, place), du)} · ${formatBearing(bearing(f, place))}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const chartBtn = h(
    'button',
    {
      class: 'btn primary block big',
      onclick: async () => {
        chartBtn.disabled = true;
        chartBtn.textContent = 'Charting…';
        closeDestination();
        await chartAndShow(app, place);
      },
    },
    'Chart course',
  );
  const bar = $('#dest-bar');
  bar.replaceChildren(
    h(
      'div',
      { class: 'dest-card' },
      h(
        'div',
        { class: 'dest-title' },
        iconEl(kindIcon(place.kind), 'result-ico'),
        h('span', { class: 'result-text' }, h('b', null, place.name), h('small', null, sub)),
      ),
      chartBtn,
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            class: 'btn grow big',
            onclick: async () => {
              closeDestination();
              await app.goStraight({ ...place });
            },
          },
          'Go straight here',
        ),
        h(
          'button',
          {
            class: 'btn grow big',
            onclick: async () => {
              closeDestination();
              const w = await app.addWaypoint(place, false, place.name);
              toast(`Added to ${(await app.addStop(w.id)).name}`);
            },
          },
          'Add as stop',
        ),
        h(
          'button',
          {
            class: 'btn big',
            'aria-label': 'Close',
            onclick: closeDestination,
          },
          '✕',
        ),
      ),
    ),
  );
  bar.hidden = false;
  wire(app);
}

function update(app: App): void {
  if (!placing) return;
  const c = app.map.getCenter();
  const f = app.fix;
  $('#dest-bar .dest-read').textContent = f
    ? `${formatDistance(distance(f, { lat: c.lat, lon: c.lng }), app.settings.distanceUnit)} · ${formatBearing(bearing(f, { lat: c.lat, lon: c.lng }))}`
    : 'Pan the map to place the crosshair';
}
