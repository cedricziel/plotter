import { distance, type LatLon } from './geo';
import { COG_MIN_SPEED } from './motion';

/** Share of the gap to each new fix a stopped boat's shown position moves by. */
const DRIFT = 0.05;
/** Reported accuracy covers about two in three fixes; twice it covers nearly all of a stopped boat's scatter. */
const HOLD_ACCURACIES = 2;
/** Smallest accuracy assumed, metres, even when the device claims better. */
const MIN_ACCURACY_M = 5;

export interface HoldFix extends LatLon {
  /** metres */
  accuracy: number;
  /** m/s, null when unknown */
  sog: number | null;
}

/**
 * Where to draw the boat. Under way it follows every fix. Stopped, a fix that wanders within its scatter only
 * nudges the shown position, so a moored boat and the map around it stay still instead of jumping every second.
 */
export class PositionHold {
  private shown: LatLon | null = null;

  update(f: HoldFix): LatLon {
    const here = { lat: f.lat, lon: f.lon };
    const stopped = f.sog == null || f.sog < COG_MIN_SPEED;
    if (
      !this.shown ||
      !stopped ||
      distance(this.shown, here) > HOLD_ACCURACIES * Math.max(f.accuracy, MIN_ACCURACY_M)
    ) {
      this.shown = here;
    } else {
      this.shown = {
        lat: this.shown.lat + (here.lat - this.shown.lat) * DRIFT,
        lon: this.shown.lon + (here.lon - this.shown.lon) * DRIFT,
      };
    }
    return this.shown;
  }
}
