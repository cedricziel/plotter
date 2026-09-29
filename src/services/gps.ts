import { destination } from '../core/geo';
import { GpsStats } from '../core/gps-stats';
import { MotionEstimator } from '../core/motion';
import { t } from '../i18n';

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

const LOST_AFTER_MS = 30_000;

/**
 * Wraps navigator.geolocation.watchPosition and derives SOG/COG, falling back
 * to a fit over recent fixes when the device does not report speed/heading.
 */
export class Gps {
  private watchId: number | null = null;
  private lostTimer: number | undefined;
  private motion = new MotionEstimator();
  /** Quality of the position source since the last report; never positions. */
  readonly stats = new GpsStats();
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
      this.cb.onStatus('unavailable', t('gps.notSupported'));
      return;
    }
    if (!window.isSecureContext) {
      this.cb.onStatus('unavailable', t('gps.needsHttps'));
      return;
    }
    this.cb.onStatus('searching');
    this.watchId = navigator.geolocation.watchPosition(
      (p) =>
        this.handle(
          p.coords.latitude,
          p.coords.longitude,
          p.coords.accuracy,
          p.coords.speed,
          p.coords.heading,
          p.timestamp,
        ),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) this.cb.onStatus('denied', t('gps.permissionDenied'));
        else if (err.code === err.TIMEOUT) this.cb.onStatus('lost', t('gps.timeout'));
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
    const { sog, cog } = this.motion.update({ lat, lon, accuracy, speed, heading, time });
    this.stats.add({ time, accuracy, speed, heading });

    this.cb.onStatus('ok');
    this.cb.onFix({ lat, lon, accuracy, sog, cog, time });

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
  constructor(
    private emit: (f: {
      lat: number;
      lon: number;
      accuracy: number;
      speed: number;
      heading: number;
      time: number;
    }) => void,
  ) {}
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
