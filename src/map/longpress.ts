import type { LngLat, Map as MlMap, MapMouseEvent, MapTouchEvent } from 'maplibre-gl';

const HOLD_MS = 600;
const MOVE_TOLERANCE_PX = 10;

/**
 * Long-press on touch devices, right-click / context menu on desktop.
 * Cancelled by movement, multi-touch or the map starting to pan.
 */
export function onLongPress(map: MlMap, cb: (lngLat: LngLat) => void): void {
  let timer: number | undefined;
  let start: { x: number; y: number } | null = null;
  let lastTouch = 0;

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    start = null;
  };

  map.on('touchstart', (e: MapTouchEvent) => {
    lastTouch = Date.now();
    if (e.originalEvent.touches.length !== 1) return cancel();
    start = { x: e.point.x, y: e.point.y };
    const lngLat = e.lngLat;
    timer = window.setTimeout(() => {
      timer = undefined;
      navigator.vibrate?.(30);
      cb(lngLat);
    }, HOLD_MS);
  });
  map.on('touchmove', (e: MapTouchEvent) => {
    if (!start) return;
    if (e.originalEvent.touches.length !== 1 || Math.hypot(e.point.x - start.x, e.point.y - start.y) > MOVE_TOLERANCE_PX)
      cancel();
  });
  map.on('touchend', cancel);
  map.on('touchcancel', cancel);
  map.on('dragstart', cancel);
  map.on('zoomstart', cancel);

  map.on('contextmenu', (e: MapMouseEvent) => {
    // Touch browsers also fire contextmenu after a long press; the timer path
    // already handled that, so only act on mouse input.
    e.preventDefault();
    if (Date.now() - lastTouch < 1500) return;
    cb(e.lngLat);
  });
}
