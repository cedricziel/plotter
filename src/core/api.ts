import type { Maneuver } from './routing';
import type { PlaceKind, WaterwayFile, Place } from './waterway-data';

export interface ApiSearchResult {
  name: string;
  kind: PlaceKind;
  lat: number;
  lon: number;
  /** metres from the `near` position, when one was sent */
  distance?: number;
}

export interface ApiSearchResponse {
  results: ApiSearchResult[];
}

export interface ApiPlacesResponse {
  places: Place[];
}

export interface ApiVessel {
  /** metres */
  airDraft?: number | null;
  draft?: number | null;
  beam?: number | null;
}

export interface ApiRouteRequest {
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  via?: { lat: number; lon: number }[];
  vessel?: ApiVessel;
  /** cruise speed in m/s, used for the duration and lock delays */
  speed?: number;
  destName?: string;
  /** what `to` is; a town, city or village ends the route at its harbour when there is one */
  toKind?: PlaceKind;
}

export interface ApiRouteResponse {
  distance: number;
  duration: number;
  /** encoded polyline, precision 6 */
  polyline: string;
  maneuvers: Maneuver[];
  warnings: string[];
  /** metres between the requested points and the waterway they were snapped to */
  snap: { from: number; to: number };
  /** where the route ends when that is not `to` itself: the harbour of a town */
  end?: { name: string; lat: number; lon: number };
}

export interface ApiCorridorRequest {
  /** encoded polyline, precision 6 */
  polyline: string;
  bufferMeters?: number;
  minZoom?: number;
  maxZoom?: number;
}

export interface ApiCorridorResponse {
  tiles: [number, number, number][];
  tileCount: number;
  /** bytes of tile data the client will download */
  estimatedBytes: number;
  /** whether estimatedBytes was read from the chart archive or guessed */
  estimate: 'archive' | 'average';
  graph: WaterwayFile;
  places: Place[];
}

export interface ApiMeta {
  ready: boolean;
  built?: string;
  source?: string;
  counts?: { vertices: number; edges: number; places: number };
  chart?: string | null;
  /** whether /api/otel forwards browser telemetry */
  telemetry?: boolean;
}

export interface ApiError {
  error: string;
}
