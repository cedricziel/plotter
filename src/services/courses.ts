import type { ApiRouteRequest, ApiRouteResponse } from '../core/api';
import type { CourseDestination } from '../core/model';
import { decodePolyline } from '../core/polyline';
import type { Maneuver, VesselProfile } from '../core/routing';
import type { TripRouter, Trip } from '../core/trips';
import type { Place } from '../core/waterway-data';
import { t } from '../i18n';
import { ApiError } from './api';

/** A course as charted, from the routing service or from a saved corridor. */
export interface Charted {
  shape: [number, number][];
  maneuvers: Maneuver[];
  warnings: string[];
  source: 'online' | 'offline';
  /** metres between the requested start and destination and the waterway */
  snap: { from: number; to: number };
  /** where the course really ends when that is not the destination itself: the harbour of a town */
  end?: { name: string; lat: number; lon: number };
  tripId?: string;
}

export interface CourseRequest {
  from: { lat: number; lon: number };
  to: CourseDestination;
  via: { lat: number; lon: number }[];
  vessel: VesselProfile;
  speed: number;
}

export interface PlanDeps {
  route: (req: ApiRouteRequest) => Promise<ApiRouteResponse>;
  trips: Trip[];
  tripRouter: TripRouter;
}

export type Plan = { charted: Charted } | { problem: string };

const asEnd = (p?: Place) => (p ? { name: p.name, lat: p.lat, lon: p.lon } : undefined);

/**
 * Chart a course from the routing service; when the service cannot be reached,
 * from a saved corridor that holds both ends. Otherwise say what went wrong.
 */
export async function planCourse(deps: PlanDeps, req: CourseRequest): Promise<Plan> {
  try {
    const r = await deps.route({
      from: req.from,
      to: req.to,
      toKind: req.to.kind,
      via: req.via.length ? req.via : undefined,
      vessel: req.vessel,
      speed: req.speed,
      destName: req.to.name,
    });
    return {
      charted: {
        shape: decodePolyline(r.polyline),
        maneuvers: r.maneuvers,
        warnings: r.warnings,
        source: 'online',
        snap: r.snap,
        end: r.end,
      },
    };
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    if (e.kind === 'rejected') return { problem: e.message };
    const off = deps.tripRouter.route(
      deps.trips,
      req.from,
      req.to,
      { profile: req.vessel, speed: req.speed, destName: req.to.name },
      req.via,
    );
    if (!off) return { problem: e.status === 503 ? t('plan.noData') : t('plan.unreachable') };
    return {
      charted: {
        shape: off.result.shape,
        maneuvers: off.result.maneuvers,
        warnings: off.result.warnings,
        source: 'offline',
        snap: { from: off.result.snapStart.dist, to: off.result.snapEnd.dist },
        end: asEnd(off.end),
        tripId: off.trip.id,
      },
    };
  }
}
