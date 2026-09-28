import type { App } from '../app';
import { bearing, distance } from '../core/geo';
import { formatBearing, formatDistance } from '../core/units';
import { $, h, toast } from './dom';
import { closeSheet } from './sheet';

const TIP_KEY = 'plotter.tip.destination';

let wired = false;
let placing = false;

/** One-time hint (per browser) that explains how to set a destination. */
export function showTipOnce(): void {
  try {
    if (localStorage.getItem(TIP_KEY)) return;
    localStorage.setItem(TIP_KEY, '1');
  } catch {
    /* storage unavailable: skip the hint rather than repeat it */
    return;
  }
  setTimeout(() => toast('Tip: hold on the map or use ⚑+ to set a destination', 7000), 4000);
}

export const isPlacing = () => placing;

/** Crosshair mode: pan the map under a fixed crosshair, then "Go here" or "Add as stop". */
export function startPlacement(app: App): void {
  closeSheet();
  app.setFollow(false);
  placing = true;
  document.body.classList.add('placing');
  const bar = $('#dest-bar');
  const map = $('#map');
  if (!map.querySelector('#crosshair')) map.append(h('div', { id: 'crosshair', 'aria-hidden': 'true' }));

  const readout = h('div', { class: 'dest-read' });
  const place = async (then: (id: string) => Promise<void>) => {
    const c = app.map.getCenter();
    const w = await app.addWaypoint({ lat: c.lat, lon: c.lng }, false);
    endPlacement();
    await then(w.id);
  };
  bar.replaceChildren(
    readout,
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn primary grow big', onclick: () => void place((id) => app.goTo(id)) }, 'Go here'),
      h(
        'button',
        {
          class: 'btn grow big',
          onclick: () => void place(async (id) => toast(`Added to ${(await app.addStop(id)).name}`)),
        },
        'Add as stop',
      ),
      h('button', { class: 'btn big', onclick: endPlacement }, 'Cancel'),
    ),
  );
  bar.hidden = false;
  update(app);

  if (!wired) {
    wired = true;
    app.map.on('move', () => update(app));
    app.subscribe(() => update(app));
    // Any toolbar tool (sheet) replaces the placement bar.
    $('#toolbar').addEventListener('click', endPlacement, true);
  }
}

export function endPlacement(): void {
  if (!placing) return;
  placing = false;
  document.body.classList.remove('placing');
  $('#dest-bar').hidden = true;
  document.querySelector('#crosshair')?.remove();
}

function update(app: App): void {
  if (!placing) return;
  const c = app.map.getCenter();
  const f = app.fix;
  $('#dest-bar .dest-read').textContent = f
    ? `${formatDistance(distance(f, { lat: c.lat, lon: c.lng }), app.settings.distanceUnit)} · ${formatBearing(bearing(f, { lat: c.lat, lon: c.lng }))}`
    : 'Pan the map to place the crosshair';
}
