import type {
  ApiCorridorRequest,
  ApiCorridorResponse,
  ApiErrorBody,
  ApiMeta,
  ApiPlacesResponse,
  ApiRouteRequest,
  ApiRouteResponse,
  ApiSearchResult,
  ApiSeamarksResponse,
} from '../core/api';
import type { Place, Seamark } from '../core/waterway-data';
import { t } from '../i18n';
import { errorText } from '../i18n/texts';
import { absUrl } from '../settings';

/**
 * `unavailable`: the service could not be reached or has no data yet; `rejected`: it answered and said no.
 * `message` is in the language chosen when the error came; `code` is the server's, when it sent one.
 */
export class ApiError extends Error {
  readonly kind: 'unavailable' | 'rejected';
  readonly status: number;
  readonly code?: string;
  constructor(kind: 'unavailable' | 'rejected', status: number, message: string, code?: string) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

const BASE = import.meta.env.VITE_API_URL || './api';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(absUrl(`${BASE}${path}`), init);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError('unavailable', 0, t('plan.unreachable'));
  }
  if (res.ok) {
    try {
      return (await res.json()) as T;
    } catch {
      throw new ApiError('unavailable', res.status, t('api.unreadable'));
    }
  }
  let body: Partial<ApiErrorBody> = {};
  try {
    body = (await res.json()) as Partial<ApiErrorBody>;
  } catch {
    /* proxy error pages are not JSON */
  }
  const message = body.error ? errorText(body as ApiErrorBody) : t('api.requestFailed', { status: res.status });
  throw new ApiError(res.status >= 500 ? 'unavailable' : 'rejected', res.status, message, body.code);
}

const json = (body: unknown, signal?: AbortSignal): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
  signal,
});

export const api = {
  meta: () => call<ApiMeta>('/meta'),
  async search(q: string, near?: { lat: number; lon: number } | null, signal?: AbortSignal): Promise<ApiSearchResult[]> {
    const params = new URLSearchParams({ q, limit: '12' });
    if (near) params.set('near', `${near.lat.toFixed(5)},${near.lon.toFixed(5)}`);
    return (await call<{ results: ApiSearchResult[] }>(`/search?${params}`, { signal })).results;
  },
  async places(bbox: [number, number, number, number], limit: number, signal?: AbortSignal): Promise<Place[]> {
    const params = new URLSearchParams({ bbox: bbox.map((v) => v.toFixed(4)).join(','), limit: String(limit) });
    return (await call<ApiPlacesResponse>(`/places?${params}`, { signal })).places;
  },
  async seamarks(bbox: [number, number, number, number], limit: number, signal?: AbortSignal): Promise<Seamark[]> {
    const params = new URLSearchParams({ bbox: bbox.map((v) => v.toFixed(4)).join(','), limit: String(limit) });
    return (await call<ApiSeamarksResponse>(`/seamarks?${params}`, { signal })).seamarks;
  },
  route: (req: ApiRouteRequest, signal?: AbortSignal) => call<ApiRouteResponse>('/route', json(req, signal)),
  corridor: (req: ApiCorridorRequest, signal?: AbortSignal) => call<ApiCorridorResponse>('/corridor', json(req, signal)),
};
