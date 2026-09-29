import { useLayoutEffect, useRef, type ReactNode, type Ref, type RefObject } from 'react';
import type { App } from '../app';
import { t } from '../i18n';
import { alarmText } from '../i18n/texts';
import { Disclaimer } from './disclaimer';
import { Instruments, NavStrip, type InstrumentsApp } from './instruments';
import { SheetFrame } from './sheet';
import { useLanguage } from './store';
import { Toast } from './toast';

export type ScreenApp = InstrumentsApp &
  Pick<App, 'follow' | 'recording' | 'anchor' | 'alarmReason' | 'silenceAlarm' | 'armAnchor'>;

export type Tool = 'route' | 'track' | 'anchor' | 'menu';

/** What the screen's buttons do; each is optional so a screen can be drawn without an app behind it. */
export interface ScreenControls {
  zoomIn?: () => void;
  zoomOut?: () => void;
  toggleSeamarks?: () => void;
  setDestination?: () => void;
  toggleOrientation?: () => void;
  follow?: () => void;
  tool?: (tool: Tool) => void;
  toggleNight?: () => void;
  closeSheet?: () => void;
  /** Runs before any tool, so a tool replaces the placement bar and the destination card. */
  beforeTool?: () => void;
}

/** The round map buttons on the right: zoom, seamarks, destination, orientation and follow. */
export function MapControls({
  courseUp = true,
  needleRef,
  controls = {},
}: {
  courseUp?: boolean;
  needleRef?: Ref<HTMLSpanElement>;
  controls?: ScreenControls;
}) {
  useLanguage();
  return (
    <div className="fabs" role="toolbar" aria-label={t('fab.controls')}>
      <button id="btn-zoom-in" className="fab" aria-label={t('fab.zoomIn')} onClick={controls.zoomIn}>
        +
      </button>
      <button id="btn-zoom-out" className="fab" aria-label={t('fab.zoomOut')} onClick={controls.zoomOut}>
        −
      </button>
      <button
        id="btn-seamarks"
        className="fab"
        aria-label={t('fab.seamarks')}
        title={t('fab.seamarksTitle')}
        onClick={controls.toggleSeamarks}
      >
        ⛯
      </button>
      <button
        id="btn-dest"
        className="fab"
        aria-label={t('fab.destination')}
        title={t('fab.destination')}
        onClick={controls.setDestination}
      >
        ⚑+
      </button>
      <button
        id="btn-orient"
        className="fab"
        aria-label={courseUp ? t('fab.courseUp') : t('fab.northUp')}
        title={courseUp ? t('fab.courseUpTitle') : t('fab.northUpTitle')}
        onClick={controls.toggleOrientation}
      >
        <span className="needle" ref={needleRef}>
          ▲<small>N</small>
        </span>
      </button>
      <button id="btn-follow" className="fab" aria-label={t('fab.follow')} onClick={controls.follow}>
        ⌖
      </button>
    </div>
  );
}

/** The bottom toolbar: the four sheets and the night switch. */
export function Toolbar({ controls = {} }: { controls?: ScreenControls }) {
  useLanguage();
  const tool = (t: Tool) => () => controls.tool?.(t);
  return (
    <nav id="toolbar" aria-label={t('toolbar.label')} onClickCapture={controls.beforeTool}>
      <button id="btn-route" className="tool" onClick={tool('route')}>
        <span className="tool-ico">⚑</span>
        <span>{t('toolbar.route')}</span>
      </button>
      <button id="btn-track" className="tool" onClick={tool('track')}>
        <span className="tool-ico rec-dot">●</span>
        <span>{t('toolbar.track')}</span>
      </button>
      <button id="btn-anchor" className="tool" onClick={tool('anchor')}>
        <span className="tool-ico">⚓</span>
        <span>{t('toolbar.anchor')}</span>
      </button>
      <button id="btn-night" className="tool" onClick={controls.toggleNight}>
        <span className="tool-ico">☾</span>
        <span>{t('toolbar.night')}</span>
      </button>
      <button id="btn-menu" className="tool" onClick={tool('menu')}>
        <span className="tool-ico">☰</span>
        <span>{t('toolbar.menu')}</span>
      </button>
    </nav>
  );
}

/** Full-screen anchor alarm; hidden while there is no `reason`. */
export function AnchorAlarm({
  reason,
  onSilence,
  onDisarm,
}: {
  reason: string | null;
  onSilence?: () => void;
  onDisarm?: () => void;
}) {
  useLanguage();
  return (
    <div id="alarm" role="alertdialog" aria-labelledby="alarm-title" hidden={!reason}>
      <div className="alarm-card">
        <h1 id="alarm-title">{`⚓ ${t('alarm.title')}`}</h1>
        <p id="alarm-reason">{reason ?? ''}</p>
        <button id="alarm-silence" className="btn block big" onClick={onSilence}>
          {t('alarm.silence')}
        </button>
        <button id="alarm-disarm" className="btn block" onClick={onDisarm}>
          {t('alarm.disarm')}
        </button>
      </div>
    </div>
  );
}

export interface ScreenSheet {
  key: string;
  title: string;
  content: ReactNode;
  /** still drawn while it slides out */
  closing?: boolean;
}

export interface ScreenBottom {
  kind: 'placing' | 'card';
  content: ReactNode;
}

/**
 * Keeps `--bottom-bar-h` on the screen at the bottom bar's rendered height, so the map buttons can sit above a
 * destination card or placement bar of any height.
 */
function useBottomBarHeight(root: RefObject<HTMLElement | null>, bar: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const rootEl = root.current;
    const barEl = bar.current;
    if (!rootEl || !barEl || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => rootEl.style.setProperty('--bottom-bar-h', `${barEl.offsetHeight}px`));
    observer.observe(barEl);
    return () => observer.disconnect();
  }, [root, bar]);
}

/**
 * The whole screen, drawn from props: instruments, guidance, chart, map buttons, toolbar, and whichever sheet, bottom
 * bar, toast, alarm or disclaimer is up. `.plotter` is the layout's size container, so the screen adapts to whatever
 * box it is given: the viewport in the app, a device frame in Storybook.
 */
export function PlotterScreen({
  app,
  chart,
  mapRef,
  needleRef,
  sheet = null,
  bottom = null,
  toast,
  disclaimer = false,
  controls = {},
}: {
  app: ScreenApp;
  /** What the chart area shows; in the app MapLibre draws into `mapRef` instead. */
  chart?: ReactNode;
  mapRef?: Ref<HTMLElement>;
  needleRef?: Ref<HTMLSpanElement>;
  sheet?: ScreenSheet | null;
  bottom?: ScreenBottom | null;
  /** A message shown as a toast; without one the screen shows what `toast()` sent. */
  toast?: string;
  disclaimer?: boolean;
  controls?: ScreenControls;
}) {
  useLanguage();
  const s = app.settings;
  const cls = [
    'plotter',
    app.follow && 'following',
    app.recording && 'recording',
    app.anchor?.armed && 'anchor-armed',
    s.seamarks && 'seamarks-on',
    s.orientation === 'north' && 'north-up',
    bottom?.kind === 'placing' && 'placing',
    bottom?.kind === 'card' && 'destcard',
  ];
  const sheetUp = !!sheet && !sheet.closing;
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  useBottomBarHeight(rootRef, barRef);
  return (
    <div
      ref={rootRef}
      className={cls.filter(Boolean).join(' ')}
      data-theme={s.theme}
      data-sheet={sheetUp ? sheet.key : undefined}
    >
      <Instruments app={app} />
      <NavStrip app={app} />
      <main id="map" aria-label={t('map.label')} ref={mapRef}>
        {chart}
        {bottom?.kind === 'placing' && <div id="crosshair" aria-hidden="true" />}
      </main>
      <div id="dest-bar" ref={barRef} hidden={!bottom}>
        {bottom?.content}
      </div>

      <MapControls courseUp={s.orientation === 'course'} needleRef={needleRef} controls={controls} />

      <div id="notice" aria-hidden="true">
        {t('notice')}
      </div>

      <Toolbar controls={controls} />

      <SheetFrame open={sheetUp} title={sheet?.title} bodyKey={sheet?.key} onClose={controls.closeSheet}>
        {sheet?.content}
      </SheetFrame>

      <AnchorAlarm
        reason={app.alarmReason ? alarmText(app.alarmReason) : null}
        onSilence={() => app.silenceAlarm()}
        onDisarm={() => void app.armAnchor(false)}
      />

      <Toast message={toast} />
      <Disclaimer open={disclaimer} />
    </div>
  );
}
