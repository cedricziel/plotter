import type { GeoJSONSource, Map as MlMap, MapGeoJSONFeature } from 'maplibre-gl';
import { FIS_ATTRIBUTION, FIS_SOURCE } from '../core/fis';
import type { Trip } from '../core/trips';
import type { Place, PlaceKind } from '../core/waterway-data';
import { num, t } from '../i18n';
import { api } from '../services/api';
import { setOverlay } from './overlays';
import { viewportLoader, type Box } from './viewport';

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

export function markProps(p: Place, i: number) {
  const bridge = p.kind === 'bridge';
  const open = bridge && p.info?.canOpen === true;
  const clearance =
    bridge && p.info?.clearance ? `\n${num(p.info.clearance, 1)} m${open ? ` ${t('place.opens')}` : ''}` : '';
  return { i, name: p.name, group: groupOf(p.kind), detail: p.name + clearance, open };
}

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

  const render = (items: Place[]) => {
    shown = items;
    const source = map.getSource('place-marks') as GeoJSONSource | undefined;
    if (source) source.attribution = shown.some((p) => p.info?.source === FIS_SOURCE) ? FIS_ATTRIBUTION : '';
    setOverlay(map, 'place-marks', {
      type: 'FeatureCollection',
      features: shown.map((p, i) => ({
        type: 'Feature',
        properties: markProps(p, i),
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      })),
    });
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
  viewportLoader<Place>(map, {
    minZoom: MIN_ZOOM,
    pad: PAD,
    maxSpan: MAX_SPAN_DEG,
    debounceMs: DEBOUNCE_MS,
    load: (box, signal) => api.places(box, LIMIT, signal),
    fallback: (view) => fromTrips(hooks.trips(), view),
    render,
  });
}
