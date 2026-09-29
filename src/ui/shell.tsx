import { useEffect, useRef, type Ref } from 'react';
import type { App } from '../app';
import { t } from '../i18n';
import { closeDestination, startPlacement, useDestBar } from './destination';
import { openAnchor, openMenu, openRoute, openTrack } from './panels';
import { PlotterScreen, type ScreenSheet, type Tool } from './screen';
import { closeSheet, sheetOpen, sheetStore } from './sheet';
import { useLanguage, useStore, useVersion } from './store';
import { toast } from './toast';

const OPEN: Record<Tool, (app: App) => void> = {
  route: openRoute,
  track: openTrack,
  anchor: openAnchor,
  menu: openMenu,
};

/** The app's screen: `PlotterScreen` wired to the App, the map and the sheet, bar and toast stores. */
export function Shell({ app, mapRef }: { app: App; mapRef?: Ref<HTMLElement> }) {
  useVersion(app);
  useLanguage();
  const needle = useRef<HTMLSpanElement>(null);
  const open = useStore(sheetStore);
  // Keep the last sheet's content while it slides out.
  const last = useRef<ScreenSheet | null>(null);
  const bottom = useDestBar(app);
  // The map exists once `app.init()` has run, which needs the chart's element first.
  const ready = !!app.map;

  useEffect(() => {
    if (!ready) return;
    // Every frame of a rotation: set the needle directly rather than re-rendering the screen.
    const rotate = () => needle.current && (needle.current.style.transform = `rotate(${-app.map.getBearing()}deg)`);
    app.map.on('rotate', rotate);
    return () => void app.map.off('rotate', rotate);
  }, [app, ready]);

  if (open)
    last.current = {
      key: open.key,
      title: typeof open.title === 'function' ? open.title() : open.title,
      content: open.render(),
    };
  else if (last.current) last.current = { ...last.current, closing: true };

  return (
    <PlotterScreen
      app={app}
      mapRef={mapRef}
      needleRef={needle}
      sheet={last.current}
      bottom={bottom}
      controls={{
        zoomIn: () => {
          app.autoZoom = false;
          app.map.zoomIn();
        },
        zoomOut: () => {
          app.autoZoom = false;
          app.map.zoomOut();
        },
        toggleSeamarks: () => void app.updateSettings({ seamarks: !app.settings.seamarks }),
        setDestination: () => startPlacement(app),
        toggleOrientation: () => {
          const orientation = app.settings.orientation === 'course' ? 'north' : 'course';
          void app.updateSettings({ orientation }).then(() => {
            toast(orientation === 'course' ? t('fab.courseUp') : t('fab.northUp'));
            if (app.follow) app.setFollow(true);
            else if (orientation === 'north') app.map.easeTo({ bearing: 0, duration: 400 });
          });
        },
        follow: () => (app.fix ? app.setFollow(true) : toast(t('toast.waitingForGps'))),
        tool: (t) => (sheetOpen(t) ? closeSheet() : OPEN[t](app)),
        toggleNight: () =>
          void app.updateSettings({
            theme: app.settings.theme === 'night' ? 'day' : 'night',
          }),
        closeSheet,
        beforeTool: closeDestination,
      }}
    />
  );
}
