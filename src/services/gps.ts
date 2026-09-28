import { bearing, destination, distance } from '../core/geo';

export interface Fix {
  lat: number;
  lon: number;
  /** metres, 1σ */
  accuracy: number;
  /** speed over ground, m/s (smoothed), null if unknown */
  sog: number | null;
  /** course over ground, degrees true, null if unknown / stationary */
  cog: number | null;
  /** epoch ms */
  time: number;
}

export type GpsStatus = 'off' | 'searching' | 'ok' | 'lost' | 'denied' | 'unavailable';

export interface GpsCallbacks {
  onFix(fix: Fix): void;
  onStatus(status: GpsStatus, message?: string): void;
}

/** Below this speed COG is meaningless noise (≈ 1 km/h). */
const COG_MIN_SPEED = 0.28;
const LOST_AFTER_MS = 30_000;

/**
 * Wraps navigator.geolocation.watchPosition and derives SOG/COG, falling back
 * to position deltas when the device does not report speed/heading.
 */
export class Gps {
  private watchId: number | null = null;
  private lostTimer: number | undefined;
  private prev: { lat: number; lon: number; time: number } | null = null;
  private sog: number | null = null;
  private cog: number | null = null;
  private sim: Simulator | null = null;

  constructor(private cb: GpsCallbacks) {}

  start(): void {
    if (new URLSearchParams(location.search).has('sim')) {
      this.sim = new Simulator((f) => this.handle(f.lat, f.lon, f.accuracy, f.speed, f.heading, f.time));
      this.sim.start();
      this.cb.onStatus('searching');
      return;
    }
    if (!('geolocation' in navigator)) {
      this.cb.onStatus('unavailable', 'Geolocation not supported');
      return;
    }
    if (!window.isSecureContext) {
      this.cb.onStatus('unavailable', 'Geolocation requires HTTPS');
      return;
    }
    this.cb.onStatus('searching');
    this.watchId = navigator.geolocation.watchPosition(
      (p) =>
        this.handle(p.coords.latitude, p.coords.longitude, p.coords.accuracy, p.coords.speed, p.coords.heading, p.timestamp),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) this.cb.onStatus('denied', 'Location permission denied');
        else if (err.code === err.TIMEOUT) this.cb.onStatus('lost', 'GPS timeout');
        else this.cb.onStatus('lost', err.message);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  }

  stop(): void {
    if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    this.sim?.stop();
    this.sim = null;
    clearTimeout(this.lostTimer);
    this.cb.onStatus('off');
  }

  private handle(
    lat: number,
    lon: number,
    accuracy: number,
    speed: number | null,
    heading: number | null,
    time: number,
  ): void {
    const here = { lat, lon, time };
    let derivedSpeed: number | null = null;
    let derivedCourse: number | null = null;
    if (this.prev) {
      const dt = (time - this.prev.time) / 1000;
      const d = distance(this.prev, here);
      if (dt > 0.5) derivedSpeed = d / dt;
      // Only trust a position-delta course when movement exceeds the noise.
      if (d > Math.max(3, accuracy * 0.5)) derivedCourse = bearing(this.prev, here);
    }

    const rawSpeed = speed != null && Number.isFinite(speed) && speed >= 0 ? speed : derivedSpeed;
    if (rawSpeed != null) this.sog = this.sog == null ? rawSpeed : this.sog * 0.6 + rawSpeed * 0.4;

    const rawCourse = heading != null && Number.isFinite(heading) ? heading : derivedCourse;
    if (this.sog != null && this.sog < COG_MIN_SPEED) {
      // keep last COG for symbol orientation, but don't update from noise
    } else if (rawCourse != null) {
      this.cog = rawCourse;
    }

    if (!this.prev || distance(this.prev, here) > 1 || time - this.prev.time > 5000) this.prev = here;

    this.cb.onStatus('ok');
    this.cb.onFix({ lat, lon, accuracy, sog: this.sog, cog: this.cog, time });

    clearTimeout(this.lostTimer);
    this.lostTimer = window.setTimeout(() => this.cb.onStatus('lost', 'No GPS fix for 30 s'), LOST_AFTER_MS);
  }
}

/** Demo/dev mode (?sim): a boat doing 9 km/h on the IJ near Amsterdam. */
class Simulator {
  private timer: number | undefined;
  private pos = { lat: 52.3812, lon: 4.8905 };
  private hdg = 75;
  private t = 0;
  constructor(private emit: (f: { lat: number; lon: number; accuracy: number; speed: number; heading: number; time: number }) => void) {}
  start() {
    this.timer = window.setInterval(() => {
      this.t++;
      this.hdg = (75 + 25 * Math.sin(this.t / 40) + 360) % 360;
      const speed = 2.5;
      this.pos = destination(this.pos, this.hdg, speed);
      this.emit({ ...this.pos, accuracy: 6, speed, heading: this.hdg, time: Date.now() });
    }, 1000);
  }
  stop() {
    clearInterval(this.timer);
  }
}
