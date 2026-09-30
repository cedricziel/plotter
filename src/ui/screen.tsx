import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import type { App } from '../app';
import { t } from '../i18n';
import { alarmText } from '../i18n/texts';
import { Disclaimer } from './disclaimer';
import { Icon, type IconName } from './icons';
import { Instruments, NavStrip, StatusPill, type InstrumentsApp } from './instruments';
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
  /** Opens the Route sheet with its search box focused. */
  search?: () => void;
  closeSheet?: () => void;
  /** Runs before any tool, so a tool replaces the placement bar and the destination card. */
  beforeTool?: () => void;
}

/** The map buttons on the right: zoom, orientation, follow and seamarks. */
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
    <div className="fabs glass" role="toolbar" aria-label={t('fab.controls')}>
      <button id="btn-zoom-in" className="fab" aria-label={t('fab.zoomIn')} onClick={controls.zoomIn}>
        <Icon name="plus" />
      </button>
      <button id="btn-zoom-out" className="fab" aria-label={t('fab.zoomOut')} onClick={controls.zoomOut}>
        <Icon name="minus" />
      </button>
      <button
        id="btn-orient"
        className="fab"
        aria-label={courseUp ? t('fab.courseUp') : t('fab.northUp')}
        title={courseUp ? t('fab.courseUpTitle') : t('fab.northUpTitle')}
        onClick={controls.toggleOrientation}
      >
        <span className="needle" ref={needleRef}>
          <Icon name="north" />
        </span>
      </button>
      <button id="btn-follow" className="fab" aria-label={t('fab.follow')} onClick={controls.follow}>
        <Icon name="locate" />
      </button>
      <button
        id="btn-seamarks"
        className="fab"
        aria-label={t('fab.seamarks')}
        title={t('fab.seamarksTitle')}
        onClick={controls.toggleSeamarks}
      >
        <Icon name="layers" />
      </button>
    </div>
  );
}

/** The dashboard at the bottom: the menu button and the instruments. */
export function Dashboard({
  app,
  menuOpen = false,
  onMenu,
}: {
  app: InstrumentsApp;
  menuOpen?: boolean;
  onMenu?: () => void;
}) {
  useLanguage();
  return (
    <div id="dash" className="glass">
      <button
        id="btn-menu"
        aria-label={t('tools.open')}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? 'menu' : undefined}
        onClick={onMenu}
      >
        <Icon name={menuOpen ? 'x' : 'grid'} />
      </button>
      <Instruments app={app} />
    </div>
  );
}

/** The menu above the dashboard's menu button: destination, the sheets and the palette. Closes on a pick or Escape. */
export function ToolMenu({
  night = false,
  recording = false,
  controls = {},
  onClose,
}: {
  night?: boolean;
  recording?: boolean;
  controls?: ScreenControls;
  onClose?: () => void;
}) {
  useLanguage();
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const item = (id: string, icon: IconName, label: string, run?: () => void, extra?: ReactNode) => (
    <button
      id={id}
      role="menuitem"
      onClick={() => {
        onClose?.();
        run?.();
      }}
    >
      <span>{label}</span>
      {extra}
      <Icon name={icon} />
    </button>
  );
  const tool = (x: Tool) => () => {
    controls.beforeTool?.();
    controls.tool?.(x);
  };
  const search = () => {
    controls.beforeTool?.();
    controls.search?.();
  };
  return (
    <>
      <div className="menu-scrim" onClick={onClose} />
      <div id="menu" className="glass" role="menu" aria-label={t('tools.label')}>
        {item('btn-search', 'search', t('tools.search'), search)}
        {item('btn-dest', 'target', t('tools.placeDest'), controls.setDestination)}
        {item('btn-route', 'route', t('sheet.route'), tool('route'))}
        {item(
          'btn-track',
          'rec',
          t('sheet.track'),
          tool('track'),
          recording && <b className="menu-rec">{t('status.rec')}</b>,
        )}
        {item('btn-anchor', 'anchor', t('sheet.anchor'), tool('anchor'))}
        <hr />
        {item('btn-night', night ? 'sun' : 'moon', night ? t('tools.day') : t('tools.night'), controls.toggleNight)}
        {item('btn-settings', 'sliders', t('sheet.settings'), tool('menu'))}
      </div>
    </>
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
 * The whole screen, drawn from props: chart, status pill, guidance, map buttons, dashboard and menu, and whichever sheet, bottom
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
    app.activeRoute && 'navigating',
    s.seamarks && 'seamarks-on',
    s.orientation === 'north' && 'north-up',
    bottom?.kind === 'placing' && 'placing',
    bottom?.kind === 'card' && 'destcard',
  ];
  const sheetUp = !!sheet && !sheet.closing;
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
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
      <main id="map" aria-label={t('map.label')} ref={mapRef}>
        {chart}
        {bottom?.kind === 'placing' && <div id="crosshair" aria-hidden="true" />}
      </main>
      <div id="dest-bar" ref={barRef} hidden={!bottom}>
        {bottom?.content}
      </div>

      <StatusPill app={app} />
      <NavStrip app={app} />
      <MapControls courseUp={s.orientation === 'course'} needleRef={needleRef} controls={controls} />

      <div id="notice" aria-hidden="true">
        {t('notice')}
      </div>

      <Dashboard app={app} menuOpen={menuOpen} onMenu={() => setMenuOpen(!menuOpen)} />
      {menuOpen && (
        <ToolMenu night={s.theme === 'night'} recording={!!app.recording} controls={controls} onClose={closeMenu} />
      )}

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
