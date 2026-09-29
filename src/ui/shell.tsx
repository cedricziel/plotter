import { useEffect, useRef } from 'react';
import type { App } from '../app';
import { DestBar, closeDestination, startPlacement } from './destination';
import { Disclaimer } from './disclaimer';
import { Instruments, NavStrip } from './instruments';
import { openAnchor, openMenu, openRoute, openTrack } from './panels';
import { Sheet, closeSheet, sheetOpen } from './sheet';
import { useVersion } from './store';
import { Toast, toast } from './toast';

const toggle = (key: string, open: () => void) => () => (sheetOpen(key) ? closeSheet() : open());

/** The whole screen: instruments, chart, map buttons, toolbar, sheet, alarm and toast. Re-renders on every App emit. */
export function Shell({ app }: { app: App }) {
  useVersion(app);
  // Everything but the chart waits for `app.init()`, which needs the chart's element first.
  const ready = app.settings !== undefined;
  const needle = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ready) return;
    const b = document.body.classList;
    b.toggle('following', app.follow);
    b.toggle('recording', !!app.recording);
    b.toggle('anchor-armed', !!app.anchor?.armed);
    b.toggle('seamarks-on', app.settings.seamarks);
    b.toggle('north-up', app.settings.orientation === 'north');
  });

  useEffect(() => {
    if (!ready) return;
    // Every frame of a rotation: set the needle directly rather than re-rendering the screen.
    const rotate = () => needle.current && (needle.current.style.transform = `rotate(${-app.map.getBearing()}deg)`);
    app.map.on('rotate', rotate);
    return () => void app.map.off('rotate', rotate);
  }, [app, ready]);

  const courseUp = ready && app.settings.orientation === 'course';
  const orient = () => {
    const orientation = app.settings.orientation === 'course' ? 'north' : 'course';
    void app.updateSettings({ orientation }).then(() => {
      toast(orientation === 'course' ? 'Course up' : 'North up');
      if (app.follow) app.setFollow(true);
      else if (orientation === 'north') app.map.easeTo({ bearing: 0, duration: 400 });
    });
  };

  return (
    <>
      {ready ? <Instruments app={app} /> : <header id="instruments" aria-live="off" />}
      {ready ? <NavStrip app={app} /> : <div id="navstrip" hidden />}
      <main id="map" aria-label="Chart" />
      {ready ? <DestBar app={app} /> : <div id="dest-bar" hidden />}

      <div className="fabs" role="toolbar" aria-label="Map controls">
        <button
          id="btn-zoom-in"
          className="fab"
          aria-label="Zoom in"
          onClick={() => {
            app.autoZoom = false;
            app.map.zoomIn();
          }}
        >
          +
        </button>
        <button
          id="btn-zoom-out"
          className="fab"
          aria-label="Zoom out"
          onClick={() => {
            app.autoZoom = false;
            app.map.zoomOut();
          }}
        >
          −
        </button>
        <button
          id="btn-seamarks"
          className="fab"
          aria-label="Toggle seamarks"
          title="Seamarks"
          onClick={() => void app.updateSettings({ seamarks: !app.settings.seamarks })}
        >
          ⛯
        </button>
        <button id="btn-dest" className="fab" aria-label="Set destination" title="Set destination" onClick={() => startPlacement(app)}>
          ⚑+
        </button>
        <button
          id="btn-orient"
          className="fab"
          aria-label={courseUp ? 'Course up' : 'North up'}
          title={courseUp ? 'Course up (tap for north up)' : 'North up (tap for course up)'}
          onClick={orient}
        >
          <span className="needle" ref={needle}>
            ▲<small>N</small>
          </span>
        </button>
        <button
          id="btn-follow"
          className="fab"
          aria-label="Centre on own position"
          onClick={() => (app.fix ? app.setFollow(true) : toast('Waiting for GPS fix…'))}
        >
          ⌖
        </button>
      </div>

      <div id="notice" aria-hidden="true">
        Navigation aid only – not for navigation
      </div>

      {/* Any tool replaces the placement bar and the destination card. */}
      <nav id="toolbar" aria-label="Tools" onClickCapture={closeDestination}>
        <button id="btn-route" className="tool" onClick={toggle('route', () => openRoute(app))}>
          <span className="tool-ico">⚑</span>
          <span>Route</span>
        </button>
        <button id="btn-track" className="tool" onClick={toggle('track', () => openTrack(app))}>
          <span className="tool-ico rec-dot">●</span>
          <span>Track</span>
        </button>
        <button id="btn-anchor" className="tool" onClick={toggle('anchor', () => openAnchor(app))}>
          <span className="tool-ico">⚓</span>
          <span>Anchor</span>
        </button>
        <button
          id="btn-night"
          className="tool"
          onClick={() => void app.updateSettings({ theme: app.settings.theme === 'night' ? 'day' : 'night' })}
        >
          <span className="tool-ico">☾</span>
          <span>Night</span>
        </button>
        <button id="btn-menu" className="tool" onClick={toggle('menu', () => openMenu(app))}>
          <span className="tool-ico">☰</span>
          <span>Menu</span>
        </button>
      </nav>

      <Sheet />

      <div id="alarm" role="alertdialog" aria-labelledby="alarm-title" hidden={!app.alarmReason}>
        <div className="alarm-card">
          <h1 id="alarm-title">⚓ ALARM</h1>
          <p id="alarm-reason">{app.alarmReason ?? ''}</p>
          <button id="alarm-silence" className="btn block big" onClick={() => app.silenceAlarm()}>
            Silence
          </button>
          <button id="alarm-disarm" className="btn block" onClick={() => void app.armAnchor(false)}>
            Disarm anchor watch
          </button>
        </div>
      </div>

      <Toast />
      <Disclaimer />
    </>
  );
}
