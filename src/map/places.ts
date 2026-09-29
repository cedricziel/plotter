import type { Map as MlMap, MapGeoJSONFeature } from 'maplibre-gl';
import type { Trip } from '../core/trips';
import type { Place, PlaceKind } from '../core/waterway-data';
import { api } from '../services/api';
import { setOverlay } from './overlays';

type Box = [west: number, south: number, east: number, north: number];

const MIN_ZOOM = 11;
const DEBOUNCE_MS = 400;
const PAD = 0.3;
const MAX_SPAN_DEG = 1.5;
const LIMIT = 400;
const TAP_PX = 8;
const SHOWN_KINDS = new Set<PlaceKind>(['harbour', 'marina', 'mooring', 'lock', 'bridge', 'city', 'town', 'village']);

const groupOf = (kind: PlaceKind) =>
  kind === 'harbour' || kind === 'marina' || kind === 'mooring'
    ? 'harbour'
    : kind === 'lock' || kind === 'bridge'
      ? 'structure'
      : 'town';

export interface PlacesHooks {
  trips: () => Trip[];
  /** true while a tap must not open a place (crosshair placement) */
  blocked: () => boolean;
  onPick: (place: Place) => void;
}

/** Town kind for a tapped Protomaps label, from `kind_detail` and `population`. */
export function basemapPlace(props: Record<string, unknown>, geometry: GeoJSON.Geometry): Place | null {
  if (geometry.type !== 'Point') return null;
  const name = String(props['name:nl'] ?? props.name ?? '');
  if (!name) return null;
  const detail = String(props.kind_detail ?? '');
  const pop = Number(props.population) || 0;
  const kind: PlaceKind =
    detail === 'city' || detail === 'town' || detail === 'village'
      ? detail
      : detail === 'hamlet'
        ? 'village'
        : pop >= 50_000
          ? 'city'
          : pop > 0 && pop < 5_000
            ? 'village'
            : 'town';
  return {
    name,
    kind,
    lat: geometry.coordinates[1],
    lon: geometry.coordinates[0],
  };
}

const inside = (b: Box, o: Box) => b[0] >= o[0] && b[1] >= o[1] && b[2] <= o[2] && b[3] <= o[3];

/** The viewport grown by PAD on every side, never wider than the API accepts. */
function padded([w, s, e, n]: Box): Box {
  const grow = (span: number) => Math.max(0, Math.min(span * PAD, (MAX_SPAN_DEG - span) / 2));
  const dx = grow(e - w);
  const dy = grow(n - s);
  return [w - dx, s - dy, e + dx, n + dy];
}

function fromTrips(trips: Trip[], [w, s, e, n]: Box): Place[] {
  const seen = new Set<string>();
  return trips
    .flatMap((t) => t.places)
    .filter((p) => {
      const key = `${p.kind}|${p.name}|${p.lat.toFixed(4)}|${p.lon.toFixed(4)}`;
      if (!SHOWN_KINDS.has(p.kind) || p.lon < w || p.lon > e || p.lat < s || p.lat > n || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, LIMIT);
}

/** Shows harbours, locks, bridges and towns from the places API on the map and opens one when tapped. */
export function mountPlaces(map: MlMap, hooks: PlacesHooks): void {
  let shown: Place[] = [];
  let fetched: { box: Box; zoom: number } | null = null;
  let timer: number | undefined;
  let pending: AbortController | undefined;

  const render = () =>
    setOverlay(map, 'place-marks', {
      type: 'FeatureCollection',
      features: shown.map((p, i) => ({
        type: 'Feature',
        properties: { i, name: p.name, group: groupOf(p.kind) },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      })),
    });

  const refresh = async () => {
    const zoom = map.getZoom();
    if (zoom < MIN_ZOOM) return;
    const b = map.getBounds();
    const view: Box = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    if (fetched && inside(view, fetched.box) && Math.abs(zoom - fetched.zoom) < 1) return;
    pending?.abort();
    const ctl = (pending = new AbortController());
    const box = padded(view);
    try {
      shown = await api.places(box, LIMIT, ctl.signal);
      fetched = { box, zoom };
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      shown = fromTrips(hooks.trips(), view);
      fetched = null;
    }
    render();
  };

  const pick = ({ x, y }: { x: number; y: number }): Place | null => {
    const layers = ['place-marks', 'places'].filter((id) => map.getLayer(id));
    if (!layers.length) return null;
    const found = map.queryRenderedFeatures(
      [
        [x - TAP_PX, y - TAP_PX],
        [x + TAP_PX, y + TAP_PX],
      ],
      { layers },
    );
    const marks = found.filter((f) => f.layer.id === 'place-marks');
    const candidates = marks.length ? marks : found;
    let best: { place: Place; dist: number } | null = null;
    for (const f of candidates) {
      const place = placeOf(f);
      if (!place) continue;
      const at = map.project([place.lon, place.lat]);
      const dist = Math.hypot(at.x - x, at.y - y);
      if (!best || dist < best.dist) best = { place, dist };
    }
    return best?.place ?? null;
  };

  const placeOf = (f: MapGeoJSONFeature): Place | null => {
    if (f.layer.id !== 'place-marks') return basemapPlace(f.properties, f.geometry);
    const place = shown[Number(f.properties.i)];
    return place?.name === f.properties.name ? place : null;
  };

  map.on('click', (e) => {
    if (hooks.blocked()) return;
    const place = pick(e.point);
    if (place) hooks.onPick(place);
  });
  map.on('mousemove', (e) => {
    map.getCanvas().style.cursor = !hooks.blocked() && pick(e.point) ? 'pointer' : '';
  });
  map.on('moveend', () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => void refresh(), DEBOUNCE_MS);
  });
  map.on('style.load', render);
  void refresh();
}
