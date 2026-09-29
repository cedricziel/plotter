import './telemetry';
import 'maplibre-gl/dist/maplibre-gl.css';
import './ui/styles.css';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { resolveLanguage, setLanguage } from './i18n';
import { mountPlaces } from './map/places';
import { mountSeamarks } from './map/seamarks';
import { closeDestination, isPlacing, showCard, showDestinationCard, showTipOnce } from './ui/destination';
import { showDisclaimerOnce } from './ui/disclaimer';
import { $ } from './ui/dom';
import { openWaypoint } from './ui/panels';
import { SeamarkCard } from './ui/seamark-card';
import { Shell } from './ui/shell';
import { mountTapLog } from './ui/taplog';
import { loadSettings } from './settings';
import { initUpdates } from './update';

async function main() {
  if (new URLSearchParams(location.search).has('taplog')) mountTapLog();
  // The disclaimer comes up before the App has loaded, so settle the language first.
  setLanguage(resolveLanguage((await loadSettings()).language, navigator.languages ?? []));
  showDisclaimerOnce();

  const app = new App();
  app.onWaypointTap = (id) => openWaypoint(app, id);
  // The chart's element has to exist before the App can start the map.
  flushSync(() => createRoot($('#root')).render(<Shell app={app} />));
  await app.init($('#map'));

  mountPlaces(app.map, {
    trips: () => app.trips,
    blocked: isPlacing,
    onPick: (place) => showDestinationCard(app, place),
  });

  const seamarks = mountSeamarks(app.map, {
    trips: () => app.trips,
    enabled: () => app.settings.seamarks,
    theme: () => app.settings.theme,
    blocked: isPlacing,
    onPick: (seamark) =>
      showCard(app, <SeamarkCard seamark={seamark} theme={app.settings.theme} onClose={closeDestination} />),
  });
  let seamarksOn = app.settings.seamarks;
  app.subscribe(() => {
    if (app.settings.seamarks === seamarksOn) return;
    seamarksOn = app.settings.seamarks;
    if (seamarksOn) void seamarks.refresh();
  });

  app.emit();

  initUpdates(app);
  if (new URLSearchParams(location.search).has('sim')) (window as unknown as { __plotter: App }).__plotter = app;
  showTipOnce();
}

void main();
