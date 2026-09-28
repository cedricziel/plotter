import 'maplibre-gl/dist/maplibre-gl.css';
import './ui/styles.css';
import { App } from './app';
import { startPlacement, showTipOnce } from './ui/destination';
import { showDisclaimerOnce } from './ui/disclaimer';
import { $, toast } from './ui/dom';
import { mountInstruments } from './ui/instruments';
import { openAnchor, openMenu, openRoute, openTrack, openWaypoint, refresh } from './ui/panels';
import { closeSheet, sheetOpen } from './ui/sheet';
import { initUpdates } from './update';

async function main() {
  showDisclaimerOnce();

  const app = new App();
  app.onWaypointTap = (id) => openWaypoint(app, id);
  await app.init($('#map'));

  const renderInstruments = mountInstruments(app);

  const toggle = (key: string, open: () => void) => () => (sheetOpen(key) ? closeSheet() : open());
  $('#btn-route').onclick = toggle('route', () => openRoute(app));
  $('#btn-track').onclick = toggle('track', () => openTrack(app));
  $('#btn-anchor').onclick = toggle('anchor', () => openAnchor(app));
  $('#btn-menu').onclick = toggle('menu', () => openMenu(app));
  $('#btn-night').onclick = () => void app.updateSettings({ theme: app.settings.theme === 'night' ? 'day' : 'night' });
  $('#btn-dest').onclick = () => startPlacement(app);
  $('#btn-follow').onclick = () => {
    if (!app.fix) return toast('Waiting for GPS fix…');
    app.setFollow(true);
  };
  $('#btn-zoom-in').onclick = () => app.map.zoomIn();
  $('#btn-zoom-out').onclick = () => app.map.zoomOut();
  $('#btn-seamarks').onclick = () => void app.updateSettings({ seamarks: !app.settings.seamarks });
  $('#alarm-silence').onclick = () => app.silenceAlarm();
  $('#alarm-disarm').onclick = () => void app.armAnchor(false);

  const renderChrome = () => {
    const b = document.body;
    b.classList.toggle('following', app.follow);
    b.classList.toggle('recording', !!app.recording);
    b.classList.toggle('anchor-armed', !!app.anchor?.armed);
    b.classList.toggle('seamarks-on', app.settings.seamarks);
    const alarm = $('#alarm');
    alarm.hidden = !app.alarmReason;
    $('#alarm-reason').textContent = app.alarmReason ?? '';
  };

  app.subscribe(() => {
    renderInstruments();
    renderChrome();
    refresh(app);
  });
  app.emit();

  initUpdates(app);
  if (new URLSearchParams(location.search).has('sim')) (window as unknown as { __plotter: App }).__plotter = app;
  showTipOnce();
}

void main();
