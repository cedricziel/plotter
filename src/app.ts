import { AttributionControl, Map as MlMap, Marker, ScaleControl, addProtocol, setWorkerUrl } from 'maplibre-gl';
// MapLibre 6 locates its module worker at runtime; let Vite bundle it explicitly.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Protocol } from 'pmtiles';
import { alarmDebounce, checkAnchor, type AnchorCheck, type AnchorWatch } from './core/anchor';
import { circlePolygon, destination, routeLegs, type LatLon } from './core/geo';
import type { Route, Track, Waypoint } from './core/model';
import { uid } from './core/model';
import { routeProgress, type RouteProgress } from './core/navigation';
import { shouldLogPoint } from './core/track';
import { formatDistance, formatDuration } from './core/units';
import { onLongPress } from './map/longpress';
import { EMPTY, setOverlay } from './map/overlays';
import { buildStyle, type Basemap } from './map/style';
import { Alarm } from './services/alarm';
import * as db from './services/db';
import { Gps, type Fix, type GpsStatus } from './services/gps';
import { WakeLock } from './services/wakelock';
import { absUrl, loadSettings, saveSettings, type Settings } from './settings';
import { $, h, toast } from './ui/dom';

/** Centre of the Netherlands' main waterways, used before the first fix. */
const NL_CENTER: [number, number] = [5.3, 52.2];
const NL_BOUNDS: [[number, number], [number, number]] = [
  [2.9, 50.6],
  [7.4, 53.8],
];

export type Listener = () => void;

export class App {
  map!: MlMap;
  settings!: Settings;
  basemap: Basemap = 'pmtiles';

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

  follow = true;
  private ship!: Marker;
  private wpMarkers = new Map<string, Marker>();
  private listeners = new Set<Listener>();

  readonly gps = new Gps({
    onFix: (f) => this.onFix(f),
    onStatus: (s, m) => this.onGpsStatus(s, m),
  });
  readonly alarm = new Alarm();
  readonly wakeLock = new WakeLock();
  alarmReason: string | null = null;

  async init(container: HTMLElement): Promise<void> {
    this.settings = await loadSettings();
    const [wps, rts, trks] = await Promise.all([db.all('waypoints'), db.all('routes'), db.all('tracks')]).catch(
      () => [[], [], []] as [Waypoint[], Route[], Track[]],
    );
    wps.forEach((w) => this.waypoints.set(w.id, w));
    rts.forEach((r) => this.routes.set(r.id, r));
    trks.forEach((t) => this.tracks.set(t.id, t));

    setWorkerUrl(maplibreWorkerUrl);
    const protocol = new Protocol();
    addProtocol('pmtiles', protocol.tile);
    this.basemap = (await probePmtiles(absUrl(this.settings.pmtilesUrl))) ? 'pmtiles' : 'osm';
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

    // Night mode: multiply the rendered chart (incl. markers) with pure red.
    const night = h('div', { class: 'night-filter' });
    container.insertBefore(night, container.querySelector('.maplibregl-control-container'));

    this.ship = new Marker({ element: shipElement(), rotationAlignment: 'map', pitchAlignment: 'map' });

    this.map.on('style.load', () => this.renderOverlays());
    this.map.on('dragstart', () => this.setFollow(false));
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
    const unlock = () => {
      if (this.anchor?.armed) this.alarm.prime();
      void this.updateWakeLock();
    };
    document.addEventListener('pointerdown', unlock, { passive: true });

    this.applyTheme();
    this.renderWaypointMarkers();
    this.gps.start();
    void this.updateWakeLock();
    setInterval(() => this.emit(), 1000); // clock + stale-fix display
  }

  // ---- observers ---------------------------------------------------------

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(): void {
    this.listeners.forEach((l) => l());
  }

  // ---- settings / style --------------------------------------------------

  private style() {
    return buildStyle({
      theme: this.settings.theme,
      basemap: this.basemap,
      pmtilesUrl: absUrl(this.settings.pmtilesUrl),
      glyphsUrl: absUrl(this.settings.glyphsUrl),
      seamarks: this.settings.seamarks,
    });
  }

  async updateSettings(patch: Partial<Settings>): Promise<void> {
    const prev = this.settings;
    this.settings = { ...prev, ...patch };
    await saveSettings(this.settings);
    if (patch.pmtilesUrl != null && patch.pmtilesUrl !== prev.pmtilesUrl) {
      this.basemap = (await probePmtiles(absUrl(this.settings.pmtilesUrl))) ? 'pmtiles' : 'osm';
      if (this.basemap === 'osm') toast('PMTiles not reachable – using OpenStreetMap fallback');
    }
    const restyle = ['theme', 'pmtilesUrl', 'glyphsUrl'].some(
      (k) => k in patch && patch[k as keyof Settings] !== prev[k as keyof Settings],
    );
    if (restyle || (patch.pmtilesUrl != null && patch.pmtilesUrl !== prev.pmtilesUrl)) {
      this.map.setStyle(this.style(), { diff: false });
    }
    if ('seamarks' in patch && this.map.getLayer('seamarks')) {
      this.map.setLayoutProperty('seamarks', 'visibility', this.settings.seamarks ? 'visible' : 'none');
    }
    if ('theme' in patch) this.applyTheme();
    if ('keepAwake' in patch) void this.updateWakeLock();
    if ('activeRouteId' in patch) {
      this.nextIndex = 0;
      void db.setKv('nextIndex', 0);
    }
    this.renderOverlays();
    this.emit();
  }

  private applyTheme(): void {
    document.documentElement.dataset.theme = this.settings.theme;
    $('meta[name="theme-color"]')?.setAttribute('content', this.settings.theme === 'night' ? '#000000' : '#0b3d6b');
  }

  setFollow(on: boolean): void {
    if (this.follow === on) return;
    this.follow = on;
    if (on && this.fix) this.map.easeTo({ center: [this.fix.lon, this.fix.lat], duration: 500 });
    this.emit();
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

    this.ship.setLngLat([f.lon, f.lat]).setRotation(f.cog ?? 0);
    this.ship.getElement().classList.toggle('no-cog', f.cog == null);
    if (first) {
      this.ship.addTo(this.map);
      this.map.jumpTo({ center: [f.lon, f.lat], zoom: Math.max(this.map.getZoom(), 14) });
    } else if (this.follow) {
      this.map.easeTo({ center: [f.lon, f.lat], duration: 600, easing: (t) => t });
    }

    if (this.recording) this.logTrackPoint(f);
    if (this.anchor?.armed) this.evaluateAnchor(f);
    else if (this.anchor) this.anchorCheck = checkAnchor(this.anchor, f, f.accuracy);

    this.updateProgress();
    this.renderPositionOverlays();
    this.emit();
  }

  // ---- overlays ----------------------------------------------------------

  renderOverlays(): void {
    if (!this.map.isStyleLoaded() && !this.map.getSource('cog')) return;
    this.renderPositionOverlays();
    this.renderRoute();
    this.renderTracks();
    this.renderAnchor();
  }

  private renderPositionOverlays(): void {
    const f = this.fix;
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

  renderRoute(): void {
    if (!this.map.getSource('route')) return;
    const pts = this.routePoints(this.activeRoute);
    const { legs } = routeLegs(pts);
    setOverlay(this.map, 'route', {
      type: 'FeatureCollection',
      features: legs.map((l) => ({
        type: 'Feature',
        properties: { label: `${formatDistance(l.distance, this.settings.distanceUnit)} · ${Math.round(l.bearing)}°` },
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

  async addWaypoint(p: LatLon, openEditor = false): Promise<Waypoint> {
    const n = this.waypoints.size + 1;
    const w: Waypoint = { id: uid(), name: `WP ${String(n).padStart(2, '0')}`, lat: p.lat, lon: p.lon, created: Date.now() };
    this.waypoints.set(w.id, w);
    await db.put('waypoints', w);
    this.renderWaypointMarkers();
    if (openEditor) this.onWaypointTap(w.id);
    this.emit();
    return w;
  }

  async updateWaypoint(id: string, patch: Partial<Waypoint>): Promise<void> {
    const w = this.waypoints.get(id);
    if (!w) return;
    Object.assign(w, patch);
    await db.put('waypoints', w);
    this.renderRoute();
    this.updateProgress();
    this.emit();
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

  setNextIndex(i: number): void {
    this.nextIndex = i;
    void db.setKv('nextIndex', i);
    this.updateProgress(false);
    this.renderWaypointMarkers();
    this.emit();
  }

  private updateProgress(autoAdvance = true): void {
    const pts = this.routePoints(this.activeRoute);
    if (!this.fix || pts.length === 0) {
      this.progress = null;
      return;
    }
    const p = routeProgress(this.fix, pts, this.nextIndex, this.fix.sog, autoAdvance ? undefined : 0);
    if (p && p.nextIndex !== this.nextIndex) {
      this.nextIndex = p.nextIndex;
      void db.setKv('nextIndex', p.nextIndex);
      navigator.vibrate?.(150);
      toast(`Waypoint reached – next: ${pts[p.nextIndex].name}`);
      this.renderWaypointMarkers();
    }
    this.progress = p;
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

  async updateWakeLock(): Promise<void> {
    const want = this.settings.keepAwake || !!this.anchor?.armed || !!this.recording;
    if (want) await this.wakeLock.enable();
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
