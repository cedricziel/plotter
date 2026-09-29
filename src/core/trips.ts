import { PlaceIndex } from './search';
import { decodeGraph, findRouteToPlace, type Graph, type RouteOptions, type RouteResult } from './routing';
import type { Place, PlaceKind, WaterwayFile } from './waterway-data';

/** A corridor saved for offline use: the part of the routing graph and the places along a charted course. */
export interface Trip {
  id: string;
  name: string;
  savedAt: number;
  /** metres either side of the course that were saved */
  bufferMeters: number;
  /** the course this corridor was saved for, encoded polyline */
  polyline: string;
  tileCount: number;
  bytes: number;
  graph: WaterwayFile;
  places: Place[];
}

/** Reroutes inside saved corridors; decoded graphs are kept per trip. */
export class TripRouter {
  private graphs = new Map<string, Graph>();

  private graphOf(trip: Trip): Graph {
    let g = this.graphs.get(trip.id);
    if (!g) this.graphs.set(trip.id, (g = decodeGraph(trip.graph)));
    return g;
  }

  /** The newest saved corridor that contains both ends and yields a route, or null. */
  route(
    trips: Trip[],
    from: { lat: number; lon: number },
    to: { lat: number; lon: number; kind?: PlaceKind },
    opts: RouteOptions,
    via: { lat: number; lon: number }[] = [],
  ): { trip: Trip; result: Extract<RouteResult, { ok: true }>; end?: Place } | null {
    for (const trip of [...trips].sort((a, b) => b.savedAt - a.savedAt)) {
      if (trip.graph.edges.length === 0) continue;
      const { result, end } = findRouteToPlace(this.graphOf(trip), from, via, to, trip.places, {
        ...opts,
        maxSnap: trip.bufferMeters,
      });
      if (result.ok) return { trip, result, end };
    }
    return null;
  }

  forget(id: string): void {
    this.graphs.delete(id);
  }
}

export function searchTrips(trips: Trip[], query: string, near?: { lat: number; lon: number }, limit = 10): Place[] {
  const seen = new Set<string>();
  const all = trips
    .flatMap((t) => t.places)
    .filter((p) => {
      const k = `${p.kind}|${p.name}|${p.lat.toFixed(4)}|${p.lon.toFixed(4)}`;
      return seen.has(k) ? false : (seen.add(k), true);
    });
  return new PlaceIndex(all).search(query, { near, limit });
}
