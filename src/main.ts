import 'maplibre-gl/dist/maplibre-gl.css';
import './ui/styles.css';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import { showDisclaimerOnce } from './ui/disclaimer';
import { $, toast } from './ui/dom';
import { mountInstruments } from './ui/instruments';
import { openAnchor, openMenu, openRoute, openTrack, openWaypoint, refresh } from './ui/panels';
import { closeSheet, sheetOpen } from './ui/sheet';

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

  registerSW({
    immediate: true,
    onNeedRefresh() {
      toast('Update available – reload to apply', 8000);
    },
    onOfflineReady() {
      toast('Ready to work offline');
    },
  });
}

void main();
