import { useEffect, useRef } from 'react';
import type { App } from '../app';
import { t } from '../i18n';
import { alarmText } from '../i18n/texts';
import { DestBar, closeDestination, startPlacement } from './destination';
import { Disclaimer } from './disclaimer';
import { Instruments, NavStrip } from './instruments';
import { openAnchor, openMenu, openRoute, openTrack } from './panels';
import { Sheet, closeSheet, sheetOpen } from './sheet';
import { useLanguage, useVersion } from './store';
import { Toast, toast } from './toast';

const toggle = (key: string, open: () => void) => () => (sheetOpen(key) ? closeSheet() : open());

/** The whole screen: instruments, chart, map buttons, toolbar, sheet, alarm and toast. Re-renders on every App emit. */
export function Shell({ app }: { app: App }) {
  useVersion(app);
  useLanguage();
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
      toast(orientation === 'course' ? t('fab.courseUp') : t('fab.northUp'));
      if (app.follow) app.setFollow(true);
      else if (orientation === 'north') app.map.easeTo({ bearing: 0, duration: 400 });
    });
  };

  return (
    <>
      {ready ? <Instruments app={app} /> : <header id="instruments" aria-live="off" />}
      {ready ? <NavStrip app={app} /> : <div id="navstrip" hidden />}
      <main id="map" aria-label={t('map.label')} />
      {ready ? <DestBar app={app} /> : <div id="dest-bar" hidden />}

      <div className="fabs" role="toolbar" aria-label={t('fab.controls')}>
        <button
          id="btn-zoom-in"
          className="fab"
          aria-label={t('fab.zoomIn')}
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
          aria-label={t('fab.zoomOut')}
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
          aria-label={t('fab.seamarks')}
          title={t('fab.seamarksTitle')}
          onClick={() => void app.updateSettings({ seamarks: !app.settings.seamarks })}
        >
          ⛯
        </button>
        <button
          id="btn-dest"
          className="fab"
          aria-label={t('fab.destination')}
          title={t('fab.destination')}
          onClick={() => startPlacement(app)}
        >
          ⚑+
        </button>
        <button
          id="btn-orient"
          className="fab"
          aria-label={courseUp ? t('fab.courseUp') : t('fab.northUp')}
          title={courseUp ? t('fab.courseUpTitle') : t('fab.northUpTitle')}
          onClick={orient}
        >
          <span className="needle" ref={needle}>
            ▲<small>N</small>
          </span>
        </button>
        <button
          id="btn-follow"
          className="fab"
          aria-label={t('fab.follow')}
          onClick={() => (app.fix ? app.setFollow(true) : toast(t('toast.waitingForGps')))}
        >
          ⌖
        </button>
      </div>

      <div id="notice" aria-hidden="true">
        {t('notice')}
      </div>

      {/* Any tool replaces the placement bar and the destination card. */}
      <nav id="toolbar" aria-label={t('toolbar.label')} onClickCapture={closeDestination}>
        <button id="btn-route" className="tool" onClick={toggle('route', () => openRoute(app))}>
          <span className="tool-ico">⚑</span>
          <span>{t('toolbar.route')}</span>
        </button>
        <button id="btn-track" className="tool" onClick={toggle('track', () => openTrack(app))}>
          <span className="tool-ico rec-dot">●</span>
          <span>{t('toolbar.track')}</span>
        </button>
        <button id="btn-anchor" className="tool" onClick={toggle('anchor', () => openAnchor(app))}>
          <span className="tool-ico">⚓</span>
          <span>{t('toolbar.anchor')}</span>
        </button>
        <button
          id="btn-night"
          className="tool"
          onClick={() => void app.updateSettings({ theme: app.settings.theme === 'night' ? 'day' : 'night' })}
        >
          <span className="tool-ico">☾</span>
          <span>{t('toolbar.night')}</span>
        </button>
        <button id="btn-menu" className="tool" onClick={toggle('menu', () => openMenu(app))}>
          <span className="tool-ico">☰</span>
          <span>{t('toolbar.menu')}</span>
        </button>
      </nav>

      <Sheet />

      <div id="alarm" role="alertdialog" aria-labelledby="alarm-title" hidden={!app.alarmReason}>
        <div className="alarm-card">
          <h1 id="alarm-title">{`⚓ ${t('alarm.title')}`}</h1>
          <p id="alarm-reason">{app.alarmReason ? alarmText(app.alarmReason) : ''}</p>
          <button id="alarm-silence" className="btn block big" onClick={() => app.silenceAlarm()}>
            {t('alarm.silence')}
          </button>
          <button id="alarm-disarm" className="btn block" onClick={() => void app.armAnchor(false)}>
            {t('alarm.disarm')}
          </button>
        </div>
      </div>

      <Toast />
      <Disclaimer />
    </>
  );
}
