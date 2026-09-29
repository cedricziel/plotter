import type { Span } from '@opentelemetry/api';
import { AttributionControl, Map as MlMap, Marker, ScaleControl, addProtocol, setWorkerUrl } from 'maplibre-gl';
// MapLibre 6 locates its module worker at runtime; let Vite bundle it explicitly.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { PMTiles, Protocol } from 'pmtiles';
import { alarmDebounce, checkAnchor, type AnchorCheck, type AnchorWatch } from './core/anchor';
import { Announcer, OffCourseMonitor, pointAlong, shapeInfo, shapeProgress, withConnectors, type ShapeInfo } from './core/course';
import { circlePolygon, destination, routeLegs, timeToGo, type LatLon } from './core/geo';
import { PositionHold } from './core/position-hold';
import type { CourseDestination, CourseManeuver, Route, Track, Waypoint } from './core/model';
import { uid } from './core/model';
import { routeProgress, type RouteProgress } from './core/navigation';
import { encodePolyline } from './core/polyline';
import { TripRouter, type Trip } from './core/trips';
import type { Place } from './core/waterway-data';
import { shouldLogPoint } from './core/track';
import { formatDistance, formatDuration } from './core/units';
import { resolveLanguage, setLanguage } from './i18n';
import { onLongPress } from './map/longpress';
import { EMPTY, SEAMARK_LAYERS, setOverlay } from './map/overlays';
import { buildStyle, type Basemap } from './map/style';
import { Alarm } from './services/alarm';
import { Compass } from './services/compass';
import { api } from './services/api';
import { planCourse, type Charted } from './services/courses';
import { DEFAULT_CHART_URL, resolveChartUrl } from './services/chart';
import * as db from './services/db';
import { Gps, type Fix, type GpsStatus } from './services/gps';
import { speak } from './services/voice';
import { logEvent, traced } from './telemetry';
import { WakeLock } from './services/wakelock';
import { navBearing, navZoom } from './core/camera';
import { absUrl, loadSettings, saveSettings, type Settings } from './settings';
import { onUserActivation } from './ui/activation';
import { $, h, toast } from './ui/dom';

/** Centre of the Netherlands' main waterways, used before the first fix. */
const NL_CENTER: [number, number] = [5.3, 52.2];
const NL_BOUNDS: [[number, number], [number, number]] = [
  [2.9, 50.6],
  [7.4, 53.8],
];

export type Listener = () => void;

/** How often the GPS quality summary goes to telemetry. */
const GPS_REPORT_MS = 5 * 60_000;

export class App {
  map!: MlMap;
  settings!: Settings;
  basemap: Basemap = 'pmtiles';
  private chartUrl = DEFAULT_CHART_URL;

  fix: Fix | null = null;
  gpsStatus: GpsStatus = 'off';
  gpsMessage = '';

  waypoints = new Map<string, Waypoint>();
  routes = new Map<string, Route>();
  tracks = new Map<string, Track>();
  recording: Track | null = null;
  private unsavedPoints = 0;

  anchor: (AnchorWatch & { armed: boolean }) | null = null;
  anchorCheck: AnchorCheck | null = null;
  private anchorCounter = 0;

  progress: RouteProgress | null = null;
  nextIndex = 0;
  private routeNext = -1;
  private renderedAlong = -1;
  private along: number | undefined;
  private shapes = new WeakMap<Route, ShapeInfo>();

  trips: Trip[] = [];
  recents: Place[] = [];
  private tripRouter = new TripRouter();
  private protocol!: Protocol;
  /** set while a saved-corridor download runs */
  offline: { routeId: string; phase: 'estimating' | 'downloading'; done: number; total: number; cancel: () => void } | null = null;
  private offMonitor = new OffCourseMonitor();
  private announcer = new Announcer();
  offCourse = false;
  recalculating = false;

  follow = true;
  /** Adaptive zoom while following a route; off after the user zooms, back on with ⌖. */
  autoZoom = true;
  private followToken = 0;
  private readonly hold = new PositionHold();
  /** Where the boat is drawn: the fix, held still while a stopped boat's fix wanders. */
  private shown: LatLon | null = null;
  private ship!: Marker;
  private wpMarkers = new Map<string, Marker>();
  private listeners = new Set<Listener>();

  readonly gps = new Gps({
    onFix: (f) => this.onFix(f),
    onStatus: (s, m) => this.onGpsStatus(s, m),
  });
  readonly alarm = new Alarm();
  readonly wakeLock = new WakeLock();
  readonly compass = new Compass((h) => this.onHeading(h));
  /** Compass heading of the bow, when the compass is on and reading. */
  heading: number | null = null;
  alarmReason: string | null = null;

  async init(container: HTMLElement): Promise<void> {
    this.settings = await loadSettings();
    this.applyLanguage();
    const [wps, rts, trks] = await Promise.all([db.all('waypoints'), db.all('routes'), db.all('tracks')]).catch(
      () => [[], [], []] as [Waypoint[], Route[], Track[]],
    );
    this.trips = await db.all('trips').catch(() => []);
    this.recents = (await db.getKv<Place[]>('recents').catch(() => undefined)) ?? [];
    wps.forEach((w) => this.waypoints.set(w.id, w));
    rts.forEach((r) => this.routes.set(r.id, r));
    trks.forEach((t) => this.tracks.set(t.id, t));

    setWorkerUrl(maplibreWorkerUrl);
    const protocol = new Protocol();
    this.protocol = protocol;
    addProtocol('pmtiles', protocol.tile);
    this.chartUrl = await resolveChartUrl(this.settings.pmtilesUrl);
    this.basemap = (await probePmtiles(absUrl(this.chartUrl))) ? 'pmtiles' : 'osm';
    if (this.basemap === 'osm') toast('Offline chart not found – using online OpenStreetMap tiles', 6000);

    const view = await db.getKv<{ center: [number, number]; zoom: number }>('view').catch(() => undefined);
    this.map = new MlMap({
      container,
      style: this.style(),
      center: view?.center ?? NL_CENTER,
      zoom: view?.zoom ?? 7,
      maxBounds: [
        [NL_BOUNDS[0][0] - 3, NL_BOUNDS[0][1] - 2],
        [NL_BOUNDS[1][0] + 3, NL_BOUNDS[1][1] + 2],
      ],
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
    });
    this.map.touchZoomRotate.disableRotation();
    this.map.addControl(new AttributionControl({ compact: true }), 'bottom-left');
    this.map.addControl(new ScaleControl({ unit: this.settings.distanceUnit }), 'bottom-left');

    this.ship = new Marker({ element: shipElement(), rotationAlignment: 'map', pitchAlignment: 'map' });

    this.map.on('style.load', () => this.renderOverlays());
    this.map.on('dragstart', () => {
      this.followToken++;
      this.setFollow(false);
    });
    this.map.on('zoomstart', (e) => {
      if ((e as { originalEvent?: Event }).originalEvent) this.autoZoom = false;
    });
    this.map.on('moveend', () => {
      const c = this.map.getCenter();
      void db.setKv('view', { center: [c.lng, c.lat], zoom: this.map.getZoom() });
    });
    onLongPress(this.map, (ll) => void this.addWaypoint({ lat: ll.lat, lon: ll.lng }, true));

    const anchor = await db.getKv<App['anchor']>('anchor').catch(() => undefined);
    if (anchor) {
      this.anchor = anchor;
      if (anchor.armed) toast('Anchor watch restored – tap anywhere to re-enable alarm sound', 6000);
    }
    const recId = await db.getKv<string | null>('recording').catch(() => undefined);
    if (recId && this.tracks.get(recId) && !this.tracks.get(recId)!.ended) this.recording = this.tracks.get(recId)!;

    this.nextIndex = (await db.getKv<number>('nextIndex').catch(() => 0)) ?? 0;

    // Audio contexts and wake locks need a user gesture on some browsers.
    // Stays silent once the lock is held: re-rendering on every tap makes iOS drop the click.
    onUserActivation(document, () => {
      if (this.anchor?.armed) this.alarm.prime();
      if (this.wantsWakeLock && !this.wakeLock.active) void this.wakeLock.enable();
    });
    this.wakeLock.onChange = () => this.emit();

    this.applyTheme();
    this.renderWaypointMarkers();
    this.gps.start();
    if (this.settings.compass) this.compass.resumeOnTap();
    void this.updateWakeLock();
    setInterval(() => this.emit(), 1000); // clock + stale-fix display
    setInterval(() => this.reportGps(), GPS_REPORT_MS);
    // Capture phase, so the summary is queued before the telemetry SDK flushes on hide.
    const reportOnHide = () => document.visibilityState === 'hidden' && this.reportGps();
    document.addEventListener('visibilitychange', reportOnHide, { capture: true });
    window.addEventListener('pagehide', () => this.reportGps(), { capture: true });
  }

  // ---- observers ---------------------------------------------------------

  /** Bumped on every emit, so views can tell a new state from the last one they drew. */
  version = 0;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  emit(): void {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  // ---- settings / style --------------------------------------------------

  private style() {
    return buildStyle({
      theme: this.settings.theme,
      basemap: this.basemap,
      pmtilesUrl: absUrl(this.chartUrl),
      glyphsUrl: absUrl(this.settings.glyphsUrl),
      seamarks: this.settings.seamarks,
      openseamap: this.settings.openseamap,
      aerial: this.settings.aerial,
    });
  }

  async updateSettings(patch: Partial<Settings>): Promise<void> {
    const prev = this.settings;
    this.settings = { ...prev, ...patch };
    await saveSettings(this.settings);
    if (patch.pmtilesUrl != null && patch.pmtilesUrl !== prev.pmtilesUrl) {
      this.chartUrl = await resolveChartUrl(this.settings.pmtilesUrl);
      this.basemap = (await probePmtiles(absUrl(this.chartUrl))) ? 'pmtiles' : 'osm';
      if (this.basemap === 'osm') toast('PMTiles not reachable – using OpenStreetMap fallback');
    }
    const restyle = ['theme', 'pmtilesUrl', 'glyphsUrl', 'openseamap', 'aerial'].some(
      (k) => k in patch && patch[k as keyof Settings] !== prev[k as keyof Settings],
    );
    if (restyle || (patch.pmtilesUrl != null && patch.pmtilesUrl !== prev.pmtilesUrl)) {
      this.map.setStyle(this.style(), { diff: false });
    }
    if ('seamarks' in patch) {
      for (const id of SEAMARK_LAYERS) {
        if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', this.settings.seamarks ? 'visible' : 'none');
      }
    }
    if ('theme' in patch) this.applyTheme();
    if ('language' in patch) this.applyLanguage();
    if ('keepAwake' in patch) void this.updateWakeLock();
    if (patch.compass === false) this.compass.disable();
    if ('activeRouteId' in patch) {
      this.nextIndex = 0;
      this.resetCourseTracking();
      void db.setKv('nextIndex', 0);
      this.updateProgress();
    }
    this.renderOverlays();
    this.emit();
  }

  /** Sets the UI language from the setting; Auto follows the device. */
  private applyLanguage(): void {
    setLanguage(resolveLanguage(this.settings.language, navigator.languages ?? []));
  }

  private applyTheme(): void {
    document.documentElement.dataset.theme = this.settings.theme;
    $('meta[name="theme-color"]')?.setAttribute('content', this.settings.theme === 'night' ? '#000000' : '#0b3d6b');
  }

  setFollow(on: boolean): void {
    if (on) {
      this.autoZoom = true;
      if (this.fix) this.followCamera(this.shownFix(), 500);
    }
    if (this.follow === on) return;
    this.follow = on;
    this.emit();
  }

  /** Follow again after `ms` unless the user moves the map in the meantime. */
  resumeFollowAfter(ms: number): void {
    const token = ++this.followToken;
    setTimeout(() => {
      if (token === this.followToken && this.fix) this.setFollow(true);
    }, ms);
  }

  get navigating(): boolean {
    return !!this.progress && !this.progress.finished;
  }

  private followCamera(f: Fix, duration: number): void {
    const map = this.map;
    const h = map.getContainer().clientHeight;
    const center: [number, number] = [f.lon, f.lat];
    if (!this.navigating) {
      map.easeTo({ center, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration, easing: (t) => t });
      return;
    }
    const courseUp = this.settings.orientation === 'course';
    const zoom = this.autoZoom
      ? navZoom({
          sog: f.sog,
          toManeuver: this.progress!.dtw,
          lat: f.lat,
          screenPx: h * (courseUp ? 0.6 : 0.45),
          current: map.getZoom(),
        })
      : map.getZoom();
    map.easeTo({
      center,
      zoom,
      bearing: navBearing(this.settings.orientation, f.cog, f.sog, map.getBearing()),
      padding: { top: courseUp ? Math.round(h * 0.35) : 0, bottom: 0, left: 0, right: 0 },
      duration,
      easing: (t) => t,
    });
  }

  /**
   * Turn on the compass. Call straight from the tap: iOS asks for motion
   * permission only inside one.
   */
  async enableCompass(): Promise<boolean> {
    const ok = await this.compass.enable();
    if (!ok) toast('Compass not available – allow Motion & Orientation access for this site');
    await this.updateSettings({ compass: ok });
    return ok;
  }

  /** Sends how the position source has been doing since the last report, then starts a new window. */
  private reportGps(): void {
    const summary = this.gps.stats.summary();
    if (!summary) return;
    this.gps.stats.reset();
    logEvent('gps.summary', {
      ...summary,
      'plotter.compass.enabled': this.settings.compass,
      'plotter.compass.reading': this.heading != null,
      'plotter.wakelock.wanted': this.wantsWakeLock,
      'plotter.wakelock.active': this.wakeLock.active,
    });
  }

  private onHeading(h: number | null): void {
    this.heading = h;
    if (this.fix) this.orientShip();
  }

  /** The ship points where the bow does when the compass knows, otherwise along the course over ground. */
  private orientShip(): void {
    const dir = this.heading ?? this.fix?.cog ?? null;
    this.ship.setRotation(dir ?? 0);
    this.ship.getElement().classList.toggle('no-cog', dir == null);
  }

  // ---- GPS ---------------------------------------------------------------

  private onGpsStatus(s: GpsStatus, msg?: string): void {
    const was = this.gpsStatus;
    this.gpsStatus = s;
    this.gpsMessage = msg ?? '';
    if (s === 'denied' || s === 'unavailable') toast(msg ?? 'GPS unavailable', 6000);
    if (s === 'lost' && this.anchor?.armed) this.raiseAlarm('GPS signal lost');
    if (was !== s) this.emit();
  }

  private onFix(f: Fix): void {
    const first = !this.fix;
    this.fix = f;
    const shown = (this.shown = this.hold.update(f));

    this.ship.setLngLat([shown.lon, shown.lat]);
    this.orientShip();
    if (first) {
      this.ship.addTo(this.map);
      this.map.jumpTo({ center: [shown.lon, shown.lat], zoom: Math.max(this.map.getZoom(), 14) });
    }

    if (this.recording) this.logTrackPoint(f);
    if (this.anchor?.armed) this.evaluateAnchor(f);
    else if (this.anchor) this.anchorCheck = checkAnchor(this.anchor, f, f.accuracy);

    this.updateProgress();
    if (!first && this.follow) this.followCamera(this.shownFix(), 600);
    this.renderPositionOverlays();
    this.emit();
  }

  // ---- overlays ----------------------------------------------------------

  renderOverlays(): void {
    if (!this.map.isStyleLoaded() && !this.map.getSource('cog')) return;
    this.renderPositionOverlays();
    this.renderRoute();
    this.renderNavLine();
    this.renderTracks();
    this.renderAnchor();
  }

  /** The current fix at the position the boat is drawn. */
  private shownFix(): Fix {
    return { ...this.fix!, ...this.shown };
  }

  private renderPositionOverlays(): void {
    const f = this.fix ? this.shownFix() : null;
    if (!f || !this.map.getSource('cog')) return;
    setOverlay(this.map, 'accuracy', {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [circlePolygon(f, Math.max(f.accuracy, 1), 48)] },
    });
    const mins = this.settings.cogMinutes;
    if (mins > 0 && f.cog != null && f.sog != null && f.sog > 0.28) {
      const end = destination(f, f.cog, f.sog * mins * 60);
      // tick marks every 5 minutes (every minute for 5-min vectors)
      const step = mins === 5 ? 1 : 5;
      const ticks: GeoJSON.Feature[] = [];
      for (let m = step; m < mins; m += step) {
        const p = destination(f, f.cog, f.sog * m * 60);
        ticks.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } });
      }
      setOverlay(this.map, 'cog', {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: [[f.lon, f.lat], [end.lon, end.lat]] },
          },
          ...ticks,
        ],
      });
    } else {
      setOverlay(this.map, 'cog', EMPTY);
    }
  }

  routePoints(r: Route | null | undefined): Waypoint[] {
    if (!r) return [];
    return r.waypointIds.map((id) => this.waypoints.get(id)).filter((w): w is Waypoint => !!w);
  }

  get activeRoute(): Route | null {
    return (this.settings.activeRouteId && this.routes.get(this.settings.activeRouteId)) || null;
  }

  /** Course line from own ship to the waypoint being steered to (to the course, once well off a charted one). */
  private renderNavLine(): void {
    if (!this.map.getSource('nav-line')) return;
    const route = this.activeRoute;
    const pts = this.routePoints(route);
    let to: LatLon | null | undefined = this.fix && this.progress ? pts[this.progress.nextIndex] : null;
    if (route?.shape) {
      const off = this.progress?.xte != null ? Math.abs(this.progress.xte) : 0;
      to = this.fix && this.progress && this.along != null && off > 60 ? pointAlong(this.shapeOf(route), this.along + 100) : null;
    }
    setOverlay(
      this.map,
      'nav-line',
      to && this.fix
        ? {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: [[this.fix.lon, this.fix.lat], [to.lon, to.lat]] },
          }
        : EMPTY,
    );
  }

  renderRoute(): void {
    if (!this.map.getSource('route')) return;
    this.routeNext = this.nextIndex;
    const route = this.activeRoute;
    if (route?.shape) {
      this.renderCourse(route);
      this.renderWaypointMarkers();
      return;
    }
    setOverlay(this.map, 'maneuvers', EMPTY);
    const pts = this.routePoints(route);
    const { legs } = routeLegs(pts);
    setOverlay(this.map, 'route', {
      type: 'FeatureCollection',
      features: legs.map((l, i) => ({
        type: 'Feature',
        properties: {
          label: `${formatDistance(l.distance, this.settings.distanceUnit)} · ${Math.round(l.bearing)}°`,
          state: i + 1 === this.nextIndex ? 'active' : i + 1 < this.nextIndex ? 'done' : 'ahead',
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [l.from.lon, l.from.lat],
            [l.to.lon, l.to.lat],
          ],
        },
      })),
    });
    this.renderWaypointMarkers();
  }

  /** A charted course follows its shape: the part behind the boat dimmed, the rest solid, maneuvers as dots. */
  private renderCourse(route: Route): void {
    const shape = route.shape!;
    const info = this.shapeOf(route);
    const along = this.fix && this.along != null ? this.along : 0;
    this.renderedAlong = along;
    const split = along > 0 ? pointAlong(info, along) : null;
    let cut = 1;
    while (cut < info.cum.length - 1 && info.cum[cut] < along) cut++;
    const done = split ? [...shape.slice(0, cut), [split.lon, split.lat]] : [];
    const rest = split ? [[split.lon, split.lat], ...shape.slice(cut)] : shape;
    const line = (coordinates: number[][], state: string): GeoJSON.Feature => ({
      type: 'Feature',
      properties: { state },
      geometry: { type: 'LineString', coordinates },
    });
    setOverlay(this.map, 'route', {
      type: 'FeatureCollection',
      features: [...(done.length > 1 ? [line(done, 'done')] : []), ...(rest.length > 1 ? [line(rest, 'active')] : [])],
    });
    const nextWp = route.waypointIds[this.nextIndex];
    setOverlay(this.map, 'maneuvers', {
      type: 'FeatureCollection',
      features: (route.maneuvers ?? [])
        .filter((m) => m.type !== 'depart' && m.type !== 'arrive')
        .map((m) => ({
          type: 'Feature',
          properties: { type: m.type, next: m.wp === nextWp },
          geometry: { type: 'Point', coordinates: [m.lon, m.lat] },
        })),
    });
  }

  private shapeOf(route: Route): ShapeInfo {
    let info = this.shapes.get(route);
    if (!info) this.shapes.set(route, (info = shapeInfo(route.shape!)));
    return info;
  }

  renderTracks(): void {
    if (!this.map.getSource('tracks')) return;
    const line = (t: Track): GeoJSON.Feature => ({
      type: 'Feature',
      properties: { id: t.id },
      geometry: { type: 'LineString', coordinates: t.points.map((p) => [p.lon, p.lat]) },
    });
    const saved = this.settings.showTracks
      ? [...this.tracks.values()].filter((t) => t !== this.recording && t.points.length > 1).map(line)
      : [];
    setOverlay(this.map, 'tracks', { type: 'FeatureCollection', features: saved });
    setOverlay(
      this.map,
      'track-live',
      this.recording && this.recording.points.length > 1 ? line(this.recording) : EMPTY,
    );
  }

  renderAnchor(): void {
    if (!this.map.getSource('anchor')) return;
    const a = this.anchor;
    if (!a) return setOverlay(this.map, 'anchor', EMPTY);
    setOverlay(this.map, 'anchor', {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [circlePolygon(a.position, a.radius)] },
        },
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [a.position.lon, a.position.lat] } },
      ],
    });
  }

  renderWaypointMarkers(): void {
    const route = this.activeRoute;
    for (const [id, m] of this.wpMarkers) {
      if (!this.waypoints.has(id)) {
        m.remove();
        this.wpMarkers.delete(id);
      }
    }
    for (const w of this.waypoints.values()) {
      if (w.hidden) {
        this.wpMarkers.get(w.id)?.remove();
        this.wpMarkers.delete(w.id);
        continue;
      }
      let m = this.wpMarkers.get(w.id);
      if (!m) {
        m = createWaypointMarker(w, {
          onTap: () => this.onWaypointTap(w.id),
          onDragEnd: (ll) => void this.moveWaypoint(w.id, ll),
        });
        m.setLngLat([w.lon, w.lat]).addTo(this.map);
        this.wpMarkers.set(w.id, m);
      } else {
        m.setLngLat([w.lon, w.lat]);
      }
      const el = m.getElement();
      el.querySelector('.wp-label')!.textContent = w.name;
      const idx = route ? route.waypointIds.indexOf(w.id) : -1;
      el.classList.toggle('in-route', idx >= 0);
      el.classList.toggle('next', idx >= 0 && idx === this.progress?.nextIndex);
      el.querySelector('.wp-dot')!.textContent = idx >= 0 ? String(idx + 1) : '';
    }
  }

  /** Set by the UI layer to open the waypoint sheet. */
  onWaypointTap: (id: string) => void = () => {};

  // ---- waypoints & routes -----------------------------------------------

  async addWaypoint(p: LatLon, openEditor = false, name?: string): Promise<Waypoint> {
    const n = this.waypoints.size + 1;
    const w: Waypoint = { id: uid(), name: name ?? `WP ${String(n).padStart(2, '0')}`, lat: p.lat, lon: p.lon, created: Date.now() };
    this.waypoints.set(w.id, w);
    // Give immediate feedback on the long-press; persist afterwards.
    this.renderWaypointMarkers();
    if (openEditor) this.onWaypointTap(w.id);
    this.emit();
    await db.put('waypoints', w);
    return w;
  }

  async updateWaypoint(id: string, patch: Partial<Waypoint>): Promise<void> {
    const w = this.waypoints.get(id);
    if (!w) return;
    Object.assign(w, patch);
    this.renderRoute();
    this.updateProgress();
    this.emit();
    await db.put('waypoints', w);
  }

  private moveWaypoint(id: string, ll: LatLon): Promise<void> {
    return this.updateWaypoint(id, { lat: ll.lat, lon: ll.lon });
  }

  async deleteWaypoint(id: string): Promise<void> {
    this.waypoints.delete(id);
    await db.remove('waypoints', id);
    for (const r of this.routes.values()) {
      if (r.waypointIds.includes(id)) {
        r.waypointIds = r.waypointIds.filter((x) => x !== id);
        await db.put('routes', r);
      }
    }
    this.renderRoute();
    this.updateProgress();
    this.emit();
  }

  async saveRoute(r: Route): Promise<void> {
    this.routes.set(r.id, r);
    await db.put('routes', r);
    this.renderRoute();
    this.updateProgress();
    this.emit();
  }

  async createRoute(name?: string): Promise<Route> {
    const r: Route = { id: uid(), name: name ?? `Route ${this.routes.size + 1}`, waypointIds: [], created: Date.now() };
    await this.saveRoute(r);
    await this.updateSettings({ activeRouteId: r.id });
    return r;
  }

  async deleteRoute(id: string): Promise<void> {
    this.routes.delete(id);
    await db.remove('routes', id);
    if (this.settings.activeRouteId === id) await this.updateSettings({ activeRouteId: null });
    this.renderRoute();
    this.emit();
  }

  /** "Go to": a one-waypoint route, reused between calls. */
  async goTo(id: string): Promise<void> {
    const stored = await db.getKv<string>('gotoRouteId').catch(() => undefined);
    let r = stored ? this.routes.get(stored) : undefined;
    if (!r) {
      r = { id: uid(), name: 'Go to', waypointIds: [], created: Date.now() };
      await db.setKv('gotoRouteId', r.id);
    }
    r.waypointIds = [id];
    await this.saveRoute(r);
    await this.updateSettings({ activeRouteId: r.id });
  }

  /** Append a waypoint to the active route, starting a new one if none is active. */
  async addStop(id: string): Promise<Route> {
    const active = this.activeRoute;
    const stop = this.waypoints.get(id);
    if (active?.shape && active.dest && stop) {
      await this.chartCourse(active.dest, { via: [{ lat: stop.lat, lon: stop.lon }] });
      return this.activeRoute ?? active;
    }
    const r = active ?? (await this.createRoute());
    r.waypointIds.push(id);
    await this.saveRoute(r);
    return r;
  }

  /** Deselect the active route/destination. */
  async stopNavigation(): Promise<void> {
    await this.updateSettings({ activeRouteId: null });
    if (this.follow && this.fix) this.followCamera(this.shownFix(), 500);
  }

  setNextIndex(i: number): void {
    this.nextIndex = i;
    void db.setKv('nextIndex', i);
    this.updateProgress(false);
    this.renderWaypointMarkers();
    this.emit();
  }

  private resetCourseTracking(): void {
    this.along = undefined;
    this.renderedAlong = -1;
    this.offMonitor.reset();
    this.offCourse = false;
    this.announcer = new Announcer();
  }

  private updateProgress(autoAdvance = true): void {
    const route = this.activeRoute;
    const pts = this.routePoints(route);
    if (!this.fix || pts.length === 0) {
      this.progress = null;
      this.renderNavLine();
      return;
    }
    const clamped = Math.max(0, Math.min(pts.length - 1, this.nextIndex));
    if (clamped !== this.nextIndex) {
      this.nextIndex = clamped;
      void db.setKv('nextIndex', clamped);
    }
    const charted = !!(route?.shape && route.maneuvers);
    let p: RouteProgress | null;
    if (charted) {
      const sp = shapeProgress(this.shapeOf(route!), route!.maneuvers!, this.fix, {
        speed: this.fix.sog,
        cog: this.fix.cog,
        index: this.nextIndex,
        hint: this.along,
      });
      this.along = sp?.along;
      p = sp;
    } else {
      p = routeProgress(this.fix, pts, this.nextIndex, this.fix.sog, autoAdvance ? undefined : 0, this.fix.cog);
    }
    if (p && !(this.fix.sog != null && this.fix.sog >= 0.5)) {
      p.ttg = timeToGo(p.remaining, this.settings.cruiseSpeed);
      p.ttgNext = timeToGo(p.dtw, this.settings.cruiseSpeed);
    }
    if (p && p.nextIndex !== this.nextIndex) {
      this.nextIndex = p.nextIndex;
      void db.setKv('nextIndex', p.nextIndex);
      navigator.vibrate?.(150);
      if (!charted) toast(`Waypoint reached – next: ${pts[p.nextIndex].name}`);
      this.renderWaypointMarkers();
    }
    this.progress = p;
    if (charted && p) this.followCourse(route!, p);
    else if (this.offCourse || this.along != null) this.resetCourseTracking();
    const moved = charted && this.along != null && Math.abs(this.along - this.renderedAlong) >= 50;
    if (this.routeNext !== this.nextIndex || moved) this.renderRoute();
    this.renderNavLine();
  }

  /** The maneuver the strip and the voice prompts are counting down to. */
  nextManeuver(route: Route | null = this.activeRoute): CourseManeuver | null {
    if (!route?.maneuvers) return null;
    const wp = route.waypointIds[this.progress?.nextIndex ?? this.nextIndex];
    return route.maneuvers.find((m) => m.wp === wp) ?? null;
  }

  private followCourse(route: Route, p: RouteProgress): void {
    const next = this.nextManeuver(route);
    if (next && this.settings.voicePrompts && !p.finished) {
      const said = this.announcer.update(next.wp ?? next.text, p.dtw, next.text);
      if (said) speak(said);
    }
    const realFix = this.gpsStatus === 'ok' && (this.fix?.accuracy ?? Infinity) <= 50;
    const state = this.offMonitor.update(Date.now(), p.finished ? null : p.xte, realFix);
    if (state.off && !this.offCourse) {
      this.offCourse = true;
      toast('Off course – tap to recalculate', 10_000, () => void this.recalculate());
      if (this.settings.voicePrompts) speak('Off course');
      this.emit();
    } else if (!state.off && this.offCourse) {
      this.offCourse = false;
      this.emit();
    }
    if (state.recalc) void this.recalculate(true);
  }

  async importData(data: { waypoints: Waypoint[]; routes: Route[]; tracks: Track[] }): Promise<void> {
    await db.putMany('waypoints', data.waypoints);
    await db.putMany('routes', data.routes);
    await db.putMany('tracks', data.tracks);
    data.waypoints.forEach((w) => this.waypoints.set(w.id, w));
    data.routes.forEach((r) => this.routes.set(r.id, r));
    data.tracks.forEach((t) => this.tracks.set(t.id, t));
    this.renderOverlays();
    this.renderWaypointMarkers();
    this.emit();
  }

  // ---- charted courses ---------------------------------------------------

  vesselProfile() {
    const s = this.settings;
    return { airDraft: s.airDraft, draft: s.draft, beam: s.beam };
  }

  /** Remember a destination for the empty search box and the offline search. */
  rememberPlace(p: Place): void {
    const key = (q: Place) => `${q.name}|${q.lat.toFixed(4)}|${q.lon.toFixed(4)}`;
    this.recents = [{ name: p.name, kind: p.kind, lat: p.lat, lon: p.lon }, ...this.recents.filter((q) => key(q) !== key(p))].slice(0, 20);
    void db.setKv('recents', this.recents);
  }

  /** Straight line to a place: "Go to" on a new waypoint named after it. */
  async goStraight(p: CourseDestination): Promise<void> {
    if (p.kind) this.rememberPlace({ name: p.name, kind: p.kind, lat: p.lat, lon: p.lon });
    const w = await this.addWaypoint(p, false, p.name);
    await this.goTo(w.id);
  }

  /**
   * Chart a course from the boat to `dest`: from the routing service, from a saved
   * corridor when the service cannot be reached, else a straight line (unless `keep`
   * asks to leave the current course alone). Returns whether a course was charted.
   */
  async chartCourse(dest: CourseDestination, opts: { via?: LatLon[]; keep?: boolean } = {}): Promise<boolean> {
    const f = this.fix;
    if (!f) {
      toast(
        this.gpsStatus === 'denied'
          ? 'Location is blocked. Allow it for this site to chart a course.'
          : 'Waiting for a GPS fix before a course can be charted',
        6000,
      );
      return false;
    }
    const from = { lat: f.lat, lon: f.lon };
    if (dest.kind) this.rememberPlace({ name: dest.name, kind: dest.kind, lat: dest.lat, lon: dest.lon });
    const plan = await traced('course.chart', async (span) => {
      const planned = await planCourse(
        { route: (req) => api.route(req), trips: this.trips, tripRouter: this.tripRouter },
        { from, to: dest, via: opts.via ?? [], vessel: this.vesselProfile(), speed: this.settings.cruiseSpeed },
      );
      if ('charted' in planned) {
        const { source, maneuvers } = planned.charted;
        span.setAttributes({
          'course.success': true,
          'course.source': source,
          'course.distance_m': maneuvers.at(-1)?.dist ?? 0,
          'course.maneuvers': maneuvers.length,
        });
      } else {
        span.setAttribute('course.success', false);
      }
      return planned;
    });
    const charted = 'charted' in plan ? plan.charted : null;
    const problem = 'problem' in plan ? plan.problem : '';
    if (!charted) {
      if (opts.keep) {
        toast(`${problem} – keeping the current course`, 6000);
      } else {
        toast(`${problem} — using straight line`, 6000);
        await this.goStraight(dest);
      }
      return false;
    }
    await this.installCourse(dest, charted);
    return true;
  }

  private async installCourse(dest: CourseDestination, c: Charted): Promise<void> {
    const f = this.fix!;
    const du = this.settings.distanceUnit;
    const end = c.end ?? dest;
    const linked = withConnectors(c.shape, c.maneuvers, { lat: f.lat, lon: f.lon }, end);
    const warnings = [...c.warnings];
    if (c.snap.from > 250) warnings.push(`Start is ${formatDistance(c.snap.from, du)} from the nearest charted waterway`);
    if (c.snap.to > 250) warnings.push(`Destination is ${formatDistance(c.snap.to, du)} from the waterway, the last part is a straight line`);

    const storedId = await db.getKv<string>('courseRouteId').catch(() => undefined);
    const old = storedId ? this.routes.get(storedId) : undefined;
    if (old) await this.dropCourseWaypoints(old);

    const now = Date.now();
    const maneuvers: CourseManeuver[] = linked.maneuvers.map((m) => ({ ...m }));
    const created: Waypoint[] = maneuvers.slice(1).map((m) => {
      const arrive = m.type === 'arrive';
      const w: Waypoint = { id: uid(), name: arrive ? end.name : m.text, lat: m.lat, lon: m.lon, created: now };
      if (!arrive) w.hidden = true;
      m.wp = w.id;
      return w;
    });
    created.forEach((w) => this.waypoints.set(w.id, w));
    await db.putMany('waypoints', created);
    const route: Route = {
      id: old?.id ?? uid(),
      name: `To ${dest.name}`,
      created: now,
      waypointIds: created.map((w) => w.id),
      shape: linked.shape,
      maneuvers,
      dest: { name: dest.name, lat: dest.lat, lon: dest.lon, kind: dest.kind },
      warnings,
      source: c.source,
      tripId: c.tripId,
    };
    if (!old) await db.setKv('courseRouteId', route.id);
    await this.saveRoute(route);
    await this.updateSettings({ activeRouteId: route.id });
    this.emit();
  }

  private async dropCourseWaypoints(route: Route): Promise<void> {
    for (const id of route.waypointIds) {
      this.wpMarkers.get(id)?.remove();
      this.wpMarkers.delete(id);
      this.waypoints.delete(id);
    }
    await db.removeMany('waypoints', route.waypointIds);
    route.waypointIds = [];
  }

  /** Chart the active course again from the current position. */
  async recalculate(auto = false): Promise<void> {
    const route = this.activeRoute;
    if (!route?.dest || this.recalculating) return;
    this.recalculating = true;
    this.emit();
    try {
      toast(auto ? 'Off course – recalculating…' : 'Recalculating…', 2500);
      const { name, lat, lon, kind } = route.dest;
      const ok = await traced(
        'course.recalculate',
        () => this.chartCourse({ name, lat, lon, kind: kind ?? 'waterway' }, { keep: true }),
        { 'course.auto': auto },
      );
      if (ok && this.settings.voicePrompts) speak('New course charted');
    } finally {
      this.recalculating = false;
      this.emit();
    }
  }

  // ---- saved corridors ---------------------------------------------------

  private pmtiles(): PMTiles {
    const url = absUrl(this.chartUrl);
    let pm = this.protocol.get(url);
    if (!pm) {
      pm = new PMTiles(url);
      this.protocol.add(pm);
    }
    return pm;
  }

  /**
   * Save the corridor along a charted course for offline use: asks the service what it takes,
   * confirms the size, then loads the map tiles through the PMTiles client (the service worker
   * caches the ranges) and keeps the routing graph and places in IndexedDB.
   */
  saveForOffline(route: Route): Promise<void> {
    return traced('trip.save', (span) => this.saveTrip(route, span));
  }

  private async saveTrip(route: Route, span: Span): Promise<void> {
    span.setAttribute('trip.success', false);
    if (this.offline || !route.shape) return;
    const ac = new AbortController();
    const job = { routeId: route.id, phase: 'estimating' as const, done: 0, total: 0, cancel: () => ac.abort() };
    this.offline = job;
    this.emit();
    try {
      const corridor = await api.corridor({ polyline: encodePolyline(route.shape), bufferMeters: 1000, minZoom: 8, maxZoom: 14 }, ac.signal);
      const withTiles = this.basemap === 'pmtiles';
      const tiles = withTiles ? corridor.tiles : [];
      const mb = (corridor.estimatedBytes / 1e6).toFixed(1);
      const what = withTiles
        ? `${tiles.length} map tiles, about ${mb} MB${corridor.estimate === 'average' ? ' (estimated)' : ''}, plus the routing data`
        : 'the routing data (the offline chart is not in use, so no map tiles)';
      if (!confirm(`Save “${route.dest?.name ?? route.name}” for offline use?\n\n${what}.`)) return;

      this.offline = { ...job, phase: 'downloading', total: tiles.length };
      this.emit();
      let bytes = 0;
      let failed = 0;
      const pm = this.pmtiles();
      const queue = [...tiles];
      const worker = async () => {
        while (queue.length && !ac.signal.aborted) {
          const [z, x, y] = queue.shift()!;
          let got: number | null = null;
          for (let attempt = 0; attempt < 3 && got == null && !ac.signal.aborted; attempt++) {
            try {
              got = (await pm.getZxy(z, x, y, ac.signal))?.data.byteLength ?? 0;
            } catch (e) {
              if (ac.signal.aborted) return;
              if (attempt === 2) failed++;
              void e;
            }
          }
          bytes += got ?? 0;
          job.done++;
          this.offline = { ...job, phase: 'downloading', total: tiles.length, done: job.done };
          if (job.done % 10 === 0) this.emit();
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
      if (ac.signal.aborted) throw new DOMException('cancelled', 'AbortError');
      if (failed > Math.max(2, tiles.length * 0.02)) throw new Error(`${failed} map tiles could not be downloaded`);

      const trip: Trip = {
        id: uid(),
        name: route.dest?.name ?? route.name,
        savedAt: Date.now(),
        bufferMeters: 1000,
        polyline: encodePolyline(route.shape),
        tileCount: tiles.length,
        bytes: corridor.estimate === 'archive' ? corridor.estimatedBytes : bytes,
        graph: corridor.graph,
        places: corridor.places,
        seamarks: corridor.seamarks,
      };
      await db.put('trips', trip);
      this.trips.push(trip);
      route.tripId = trip.id;
      await this.saveRoute(route);
      span.setAttributes({ 'trip.success': true, 'trip.tiles': trip.tileCount, 'trip.bytes': trip.bytes });
      toast(`Saved for offline: ${trip.name}, ${(trip.bytes / 1e6).toFixed(1)} MB`);
    } catch (e) {
      if ((e as Error).name === 'AbortError') toast('Offline save cancelled');
      else toast(`Offline save failed: ${(e as Error).message}`, 6000);
    } finally {
      this.offline = null;
      this.emit();
    }
  }

  async deleteTrip(id: string): Promise<void> {
    await db.remove('trips', id);
    this.trips = this.trips.filter((t) => t.id !== id);
    this.tripRouter.forget(id);
    for (const r of this.routes.values()) {
      if (r.tripId !== id) continue;
      delete r.tripId;
      await db.put('routes', r);
    }
    this.emit();
  }

  // ---- tracks ------------------------------------------------------------

  async startRecording(): Promise<void> {
    if (this.recording) return;
    const now = Date.now();
    const d = new Date(now);
    const t: Track = {
      id: uid(),
      name: `Track ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      points: [],
      started: now,
    };
    this.tracks.set(t.id, t);
    this.recording = t;
    await db.put('tracks', t);
    await db.setKv('recording', t.id);
    if (this.fix) this.logTrackPoint(this.fix);
    void this.updateWakeLock();
    this.renderTracks();
    this.emit();
  }

  async stopRecording(): Promise<void> {
    const t = this.recording;
    if (!t) return;
    t.ended = Date.now();
    this.recording = null;
    await db.put('tracks', t);
    await db.setKv('recording', null);
    void this.updateWakeLock();
    this.renderTracks();
    this.emit();
    toast(`Track saved: ${formatDistance(trackDistance(t), this.settings.distanceUnit)}, ${formatDuration((t.ended - t.started) / 1000)}`);
  }

  private logTrackPoint(f: Fix): void {
    const t = this.recording!;
    const last = t.points[t.points.length - 1];
    const p = { lat: f.lat, lon: f.lon, time: f.time, speed: f.sog };
    if (!shouldLogPoint(last, p, f.accuracy)) return;
    t.points.push(p);
    this.renderTracks();
    // Persist in batches to limit IndexedDB churn.
    if (++this.unsavedPoints >= 10 || t.points.length === 1) {
      this.unsavedPoints = 0;
      void db.put('tracks', t);
    }
  }

  async deleteTrack(id: string): Promise<void> {
    if (this.recording?.id === id) await this.stopRecording();
    this.tracks.delete(id);
    await db.remove('tracks', id);
    this.renderTracks();
    this.emit();
  }

  async renameTrack(id: string, name: string): Promise<void> {
    const t = this.tracks.get(id);
    if (!t) return;
    t.name = name;
    await db.put('tracks', t);
    this.emit();
  }

  // ---- anchor watch ------------------------------------------------------

  async setAnchor(position: LatLon, radius: number): Promise<void> {
    this.anchor = { position, radius, armed: this.anchor?.armed ?? false };
    await this.persistAnchor();
  }

  async setAnchorRadius(radius: number): Promise<void> {
    if (!this.anchor) return;
    this.anchor.radius = Math.max(5, Math.min(1000, radius));
    await this.persistAnchor();
  }

  async armAnchor(armed: boolean): Promise<void> {
    if (!this.anchor) return;
    this.anchor.armed = armed;
    this.anchorCounter = 0;
    if (armed) this.alarm.prime();
    else this.silenceAlarm();
    await this.persistAnchor();
    void this.updateWakeLock();
  }

  async clearAnchor(): Promise<void> {
    this.silenceAlarm();
    this.anchor = null;
    this.anchorCheck = null;
    await db.setKv('anchor', null);
    this.renderAnchor();
    void this.updateWakeLock();
    this.emit();
  }

  private async persistAnchor(): Promise<void> {
    await db.setKv('anchor', this.anchor);
    if (this.anchor && this.fix) this.anchorCheck = checkAnchor(this.anchor, this.fix, this.fix.accuracy);
    this.renderAnchor();
    this.emit();
  }

  private evaluateAnchor(f: Fix): void {
    const a = this.anchor!;
    this.anchorCheck = checkAnchor(a, f, f.accuracy);
    const d = alarmDebounce(this.anchorCounter, this.anchorCheck);
    this.anchorCounter = d.counter;
    if (d.sound) this.raiseAlarm(`Anchor drag: ${Math.round(this.anchorCheck.distance)} m from anchor (radius ${a.radius} m)`);
    else if (this.alarmReason === 'GPS signal lost') this.silenceAlarm();
  }

  raiseAlarm(reason: string): void {
    const fresh = this.alarmReason == null;
    this.alarmReason = reason;
    this.alarm.start();
    if (fresh) this.emit();
  }

  silenceAlarm(): void {
    this.alarm.stop();
    this.alarmReason = null;
    this.anchorCounter = 0;
    this.emit();
  }

  // ---- wake lock ---------------------------------------------------------

  /** The screen stays on when asked to, and always while the anchor alarm or a track recording runs. */
  private get wantsWakeLock(): boolean {
    return this.settings.keepAwake || !!this.anchor?.armed || !!this.recording;
  }

  async updateWakeLock(): Promise<void> {
    if (this.wantsWakeLock) await this.wakeLock.enable();
    else await this.wakeLock.disable();
    this.emit();
  }
}

// ---- helpers ---------------------------------------------------------------


function trackDistance(t: Track): number {
  return routeLegs(t.points).total;
}

/** Check that the PMTiles archive is reachable (or cached by the service worker). */
async function probePmtiles(url: string): Promise<boolean> {
  try {
    // Same range the pmtiles client requests first, so the SW cache entry is shared.
    const res = await fetch(url, { headers: { Range: 'bytes=0-16383' } });
    if (!res.ok) return false;
    const buf = new Uint8Array(await res.arrayBuffer());
    return String.fromCharCode(...buf.slice(0, 7)) === 'PMTiles';
  } catch {
    return false;
  }
}

function shipElement(): HTMLElement {
  const el = h('div', { class: 'ship', 'aria-label': 'Own vessel' });
  el.innerHTML =
    '<svg viewBox="-20 -28 40 56" width="40" height="56" aria-hidden="true">' +
    '<path d="M0,-26 C9,-14 11,-2 10,22 L-10,22 C-11,-2 -9,-14 0,-26 Z" class="hull"/>' +
    '<circle r="3.5" class="centre"/></svg>';
  return el;
}

function createWaypointMarker(
  w: Waypoint,
  cb: { onTap: () => void; onDragEnd: (ll: LatLon) => void },
): Marker {
  const el = h('div', { class: 'wp' }, h('div', { class: 'wp-dot' }), h('div', { class: 'wp-label' }, w.name));
  const m = new Marker({ element: el, draggable: true, anchor: 'center' });
  let dragged = false;
  m.on('dragstart', () => {
    dragged = true;
    el.classList.add('dragging');
  });
  m.on('dragend', () => {
    el.classList.remove('dragging');
    const ll = m.getLngLat();
    cb.onDragEnd({ lat: ll.lat, lon: ll.lng });
    setTimeout(() => (dragged = false), 50);
  });
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!dragged) cb.onTap();
  });
  return m;
}
