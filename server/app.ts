import {
  context,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
  type ObservableResult,
} from '@opentelemetry/api';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  ApiCorridorRequest,
  ApiCorridorResponse,
  ApiMeta,
  ApiPlacesResponse,
  ApiRouteRequest,
  ApiRouteResponse,
  ApiSearchResponse,
} from '../src/core/api';
import { CorridorTooLarge, corridorTiles, placesInCorridor, subgraph } from '../src/core/corridor';
import { distance } from '../src/core/geo';
import { decodePolyline, encodePolyline } from '../src/core/polyline';
import { findRouteToPlace } from '../src/core/routing';
import { DataStore } from './data';
import { HttpError, RateLimiter, clientKey, readBody, readJson, sendJson } from './http';
import { emitLog, meter, tracer, withSpan, type Relay } from './telemetry';
import type { PlaceKind } from '../src/core/waterway-data';
import { openChart, type ChartArchive } from './tiles';

export interface ServerOptions {
  dataDir: string;
  tilesDir?: string;
  port?: number;
  host?: string;
  /** how often to look for a newer dataset; 0 disables polling */
  pollMs?: number;
  /** most tiles one corridor may need */
  maxTiles?: number;
  /** key rate limits on X-Forwarded-For (set when behind a reverse proxy) */
  trustProxy?: boolean;
  /** requests per minute and client */
  rateLimits?: Partial<Record<keyof typeof LIMITS, number>>;
  /** where /api/otel/* forwards browser telemetry; unset answers 204 and drops it */
  relay?: Relay;
}

export interface RunningServer {
  url: string;
  port: number;
  server: Server;
  store: DataStore;
  close(): Promise<void>;
}

const BBOX = { minLat: 50.6, maxLat: 53.8, minLon: 3.0, maxLon: 7.4 };
const AVERAGE_TILE_BYTES = 20_000;
const MAX_CHART_ZOOM = 15;
const MAX_CORRIDOR_POINTS = 20_000;
const MAX_CORRIDOR_METERS = 600_000;
const LIMITS = { search: 120, route: 30, corridor: 6, otel: 60, places: 120 };
const MAX_PLACES_SPAN_DEG = 1.5;
const PLACE_RANK: Partial<Record<PlaceKind, number>> = {
  harbour: 0,
  marina: 0,
  mooring: 0,
  lock: 1,
  city: 2,
  town: 2,
  village: 2,
  bridge: 3,
};
const BODY_LIMITS = { route: 16 * 1024, corridor: 1024 * 1024, otel: 256 * 1024 };
const ROUTES = new Set(['/api/health', '/api/meta', '/api/search', '/api/route', '/api/corridor', '/api/places']);
const OTLP_TYPES = ['application/json', 'application/x-protobuf'];
const REQUEST_SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

const routeOf = (path: string) => (ROUTES.has(path) ? path : path.startsWith('/api/otel/') ? '/api/otel/*' : 'unmatched');

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function inNetherlands(lat: number, lon: number): boolean {
  return lat >= BBOX.minLat && lat <= BBOX.maxLat && lon >= BBOX.minLon && lon <= BBOX.maxLon;
}

function point(v: unknown, name: string): { lat: number; lon: number } {
  const p = v as { lat?: unknown; lon?: unknown } | null;
  if (!p || !num(p.lat) || !num(p.lon)) throw new HttpError(400, `${name} must be {lat, lon} numbers`);
  if (!inNetherlands(p.lat, p.lon)) throw new HttpError(422, `${name} is outside the Netherlands`);
  return { lat: p.lat, lon: p.lon };
}

function dimension(v: unknown, name: string): number | null {
  if (v == null || v === 0) return null;
  if (!num(v) || v < 0 || v > 100)
    throw new HttpError(400, `vessel.${name} must be a number of metres between 0 and 100`);
  return v;
}

function parseRoute(body: unknown) {
  const b = body as Partial<ApiRouteRequest> | null;
  if (!b || typeof b !== 'object') throw new HttpError(400, 'expected a JSON object');
  const from = point(b.from, 'from');
  const to = point(b.to, 'to');
  let via: { lat: number; lon: number }[] = [];
  if (b.via != null) {
    if (!Array.isArray(b.via) || b.via.length > 5) throw new HttpError(400, 'via must be a list of at most 5 points');
    via = b.via.map((p, i) => point(p, `via[${i}]`));
  }
  const vessel = b.vessel ?? {};
  if (typeof vessel !== 'object') throw new HttpError(400, 'vessel must be an object');
  const profile = {
    airDraft: dimension(vessel.airDraft, 'airDraft'),
    draft: dimension(vessel.draft, 'draft'),
    beam: dimension(vessel.beam, 'beam'),
  };
  if (b.speed != null && (!num(b.speed) || b.speed < 0.1 || b.speed > 30))
    throw new HttpError(400, 'speed must be between 0.1 and 30 m/s');
  if (b.destName != null && (typeof b.destName !== 'string' || b.destName.length > 100)) {
    throw new HttpError(400, 'destName must be a string of at most 100 characters');
  }
  const kinds: string[] = [
    'harbour',
    'marina',
    'mooring',
    'lock',
    'bridge',
    'city',
    'town',
    'village',
    'waterway',
    'waypoint',
  ];
  if (b.toKind != null && !kinds.includes(b.toKind)) throw new HttpError(400, 'toKind is not a known place kind');
  return { from, via, to, toKind: b.toKind, profile, speed: b.speed, destName: b.destName };
}

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const store = new DataStore(opts.dataDir);
  await store.reload();
  store.startPolling(opts.pollMs ?? 600_000);
  const maxTiles = opts.maxTiles ?? 20_000;
  const limits = { ...LIMITS, ...opts.rateLimits };
  const limiter = new RateLimiter();
  let chart: { archive: ChartArchive | null; checked: number } | null = null;

  const chartArchive = async (): Promise<ChartArchive | null> => {
    if (!opts.tilesDir) return null;
    if (!chart || Date.now() - chart.checked > 60_000)
      chart = { archive: await openChart(opts.tilesDir), checked: Date.now() };
    return chart.archive;
  };

  const ready = () => {
    if (!store.state) throw new HttpError(503, 'Routing data not available yet');
    return store.state;
  };

  const guard = (req: IncomingMessage, kind: keyof typeof LIMITS) => {
    const wait = limiter.check(`${kind}:${clientKey(req, opts.trustProxy ?? false)}`, limits[kind]);
    if (wait) throw new HttpError(429, 'too many requests', { retryAfter: wait });
  };

  async function meta(): Promise<ApiMeta> {
    const s = store.state;
    const archive = await chartArchive();
    const telemetry = !!opts.relay;
    if (!s) return { ready: false, chart: archive?.name ?? null, telemetry };
    return {
      ready: true,
      built: s.manifest.built,
      source: s.manifest.source,
      counts: { vertices: s.vertices, edges: s.edges, places: s.places.length },
      ...(s.fis
        ? {
            fis: {
              generation: s.fis.file.generation,
              bridges: s.fis.file.bridges.length,
              locks: s.fis.file.locks.length,
              berths: s.fis.file.berths.length,
              matched: s.fis.matched,
              obstacles: s.fis.obstacles,
            },
          }
        : {}),
      chart: archive?.name ?? null,
      telemetry,
    };
  }

  function search(url: URL): ApiSearchResponse {
    const q = (url.searchParams.get('q') ?? '').trim();
    if (q.length < 1 || q.length > 64) throw new HttpError(400, 'q must be 1 to 64 characters');
    let near: { lat: number; lon: number } | undefined;
    const nearParam = url.searchParams.get('near');
    if (nearParam) {
      const [lat, lon, ...rest] = nearParam.split(',').map(Number);
      if (rest.length || !num(lat) || !num(lon) || !inNetherlands(lat, lon))
        throw new HttpError(400, 'near must be "lat,lon" inside the Netherlands');
      near = { lat, lon };
    }
    let limit = 10;
    const limitParam = url.searchParams.get('limit');
    if (limitParam != null) {
      limit = Number(limitParam);
      if (!Number.isInteger(limit) || limit < 1) throw new HttpError(400, 'limit must be a positive integer');
      limit = Math.min(limit, 50);
    }
    const index = ready().index;
    return withSpan('search.query', (span) => {
      const results = index.search(q, { near, limit });
      span.setAttributes({ 'search.result_count': results.length, 'search.limit': limit, 'search.near': !!near });
      return { results };
    });
  }

  function places(url: URL): ApiPlacesResponse {
    const box = (url.searchParams.get('bbox') ?? '').split(',').map(Number);
    if (box.length !== 4 || !box.every(num))
      throw new HttpError(400, 'bbox must be "west,south,east,north" in degrees');
    const [w, s, e, n] = box;
    if (w >= e || s >= n) throw new HttpError(400, 'bbox must have west < east and south < north');
    const west = Math.max(w, BBOX.minLon);
    const east = Math.min(e, BBOX.maxLon);
    const south = Math.max(s, BBOX.minLat);
    const north = Math.min(n, BBOX.maxLat);
    if (east - west > MAX_PLACES_SPAN_DEG || north - south > MAX_PLACES_SPAN_DEG)
      throw new HttpError(422, `bbox is larger than ${MAX_PLACES_SPAN_DEG} degrees`);
    let limit = 300;
    const limitParam = url.searchParams.get('limit');
    if (limitParam != null) {
      limit = Number(limitParam);
      if (!Number.isInteger(limit) || limit < 1) throw new HttpError(400, 'limit must be a positive integer');
      limit = Math.min(limit, 500);
    }
    const found = ready().mapPlaces.filter(
      (p) => PLACE_RANK[p.kind] !== undefined && p.lon >= west && p.lon <= east && p.lat >= south && p.lat <= north,
    );
    found.sort((a, b) => PLACE_RANK[a.kind]! - PLACE_RANK[b.kind]!);
    return { places: found.slice(0, limit) };
  }

  function route(body: unknown): ApiRouteResponse {
    const { graph, places } = ready();
    const r = parseRoute(body);
    const { result, end } = withSpan('route.compute', (span) => {
      const found = findRouteToPlace(graph, r.from, r.via, { ...r.to, kind: r.toKind }, places, {
        profile: r.profile,
        speed: r.speed,
        destName: r.destName,
      });
      const { result } = found;
      span.setAttributes(
        result.ok
          ? {
              'route.success': true,
              'route.distance_m': result.distance,
              'route.maneuvers': result.maneuvers.length,
              'route.warnings': result.warnings.length,
            }
          : { 'route.success': false, 'route.failure': result.reason },
      );
      return found;
    });
    if (!result.ok) {
      throw new HttpError(result.reason === 'no-snap' ? 422 : 404, result.message, { reason: result.reason });
    }
    return {
      distance: result.distance,
      duration: result.duration,
      polyline: encodePolyline(result.shape),
      maneuvers: result.maneuvers,
      warnings: result.warnings,
      snap: { from: result.snapStart.dist, to: result.snapEnd.dist },
      ...(end ? { end: { name: end.name, lat: end.lat, lon: end.lon } } : {}),
    };
  }

  async function corridor(body: unknown): Promise<ApiCorridorResponse> {
    const s = ready();
    const b = body as Partial<ApiCorridorRequest> | null;
    if (!b || typeof b.polyline !== 'string') throw new HttpError(400, 'polyline (encoded, precision 6) is required');
    let shape: [number, number][];
    try {
      shape = decodePolyline(b.polyline);
    } catch {
      throw new HttpError(400, 'polyline is not a valid encoded polyline');
    }
    if (shape.length < 2) throw new HttpError(400, 'polyline needs at least two points');
    if (shape.length > MAX_CORRIDOR_POINTS)
      throw new HttpError(400, `polyline has more than ${MAX_CORRIDOR_POINTS} points`);
    if (shape.some(([lon, lat]) => !inNetherlands(lat, lon)))
      throw new HttpError(422, 'polyline leaves the Netherlands');
    let length = 0;
    for (let i = 1; i < shape.length; i++)
      length += distance({ lat: shape[i - 1][1], lon: shape[i - 1][0] }, { lat: shape[i][1], lon: shape[i][0] });
    if (length > MAX_CORRIDOR_METERS)
      throw new HttpError(422, `polyline is longer than ${MAX_CORRIDOR_METERS / 1000} km`);
    for (const k of ['bufferMeters', 'minZoom', 'maxZoom'] as const) {
      if (b[k] != null && !num(b[k])) throw new HttpError(400, `${k} must be a number`);
    }
    const buffer = Math.max(50, Math.min(5000, b.bufferMeters ?? 1000));
    const archive = await chartArchive();
    const header = archive ? await archive.getHeader() : null;
    const zTop = Math.min(MAX_CHART_ZOOM, header?.maxZoom ?? MAX_CHART_ZOOM);
    const minZoom = Math.max(0, Math.min(zTop, Math.round(b.minZoom ?? 8)));
    const maxZoom = Math.max(minZoom, Math.min(zTop, Math.round(b.maxZoom ?? 14)));

    let tiles: [number, number, number][];
    try {
      tiles = corridorTiles(shape, { buffer, minZoom, maxZoom, cap: maxTiles });
    } catch (e) {
      if (e instanceof CorridorTooLarge) {
        throw new HttpError(
          422,
          `Corridor too large: more than ${maxTiles} tiles. Use a shorter route, a narrower buffer or a lower maximum zoom.`,
        );
      }
      throw e;
    }
    let estimatedBytes = 0;
    let estimate: ApiCorridorResponse['estimate'] = 'average';
    if (archive) {
      for (const [z, x, y] of tiles) estimatedBytes += await archive.tileBytes(z, x, y);
      estimate = 'archive';
    } else {
      estimatedBytes = tiles.length * AVERAGE_TILE_BYTES;
    }
    return {
      tiles,
      tileCount: tiles.length,
      estimatedBytes,
      estimate,
      graph: subgraph(s.graph, shape, buffer, { built: s.manifest.built, source: s.manifest.source }),
      places: placesInCorridor(s.mapPlaces, shape, buffer),
    };
  }

  async function relay(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    if (!opts.relay) {
      req.resume();
      res.writeHead(204).end();
      return;
    }
    const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (!OTLP_TYPES.includes(type)) throw new HttpError(415, `content-type must be ${OTLP_TYPES.join(' or ')}`);
    guard(req, 'otel');
    const body = await readBody(req, BODY_LIMITS.otel);
    let upstream: Response;
    try {
      upstream = await fetch(opts.relay.endpoint + path, {
        method: 'POST',
        headers: { ...opts.relay.headers, 'content-type': req.headers['content-type'] as string },
        body: new Uint8Array(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new HttpError(502, 'telemetry upstream not reachable');
    }
    await upstream.arrayBuffer().catch(() => undefined);
    res.writeHead(upstream.status, { 'content-length': 0 }).end();
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const method = req.method ?? 'GET';
    const allow = (m: string) => {
      if (method !== m) throw new HttpError(405, `use ${m}`);
    };
    switch (url.pathname) {
      case '/api/health':
        allow('GET');
        return sendJson(req, res, 200, { ok: true, data: store.state ? 'ready' : 'missing' });
      case '/api/meta':
        allow('GET');
        return sendJson(req, res, 200, await meta());
      case '/api/search':
        allow('GET');
        guard(req, 'search');
        return sendJson(req, res, 200, search(url));
      case '/api/places':
        allow('GET');
        guard(req, 'places');
        return sendJson(req, res, 200, places(url));
      case '/api/route':
        allow('POST');
        guard(req, 'route');
        return sendJson(req, res, 200, route(await readJson(req, BODY_LIMITS.route)));
      case '/api/corridor':
        allow('POST');
        guard(req, 'corridor');
        return sendJson(
          req,
          res,
          200,
          await withSpan('corridor.build', async (span) => {
            const built = await corridor(await readJson(req, BODY_LIMITS.corridor));
            span.setAttributes({
              'corridor.tile_count': built.tileCount,
              'corridor.edge_count': built.graph.edges.length,
              'corridor.place_count': built.places.length,
            });
            return built;
          }),
        );
      case '/api/otel/v1/traces':
      case '/api/otel/v1/logs':
        allow('POST');
        return relay(req, res, url.pathname.slice('/api/otel'.length));
      default:
        throw new HttpError(404, 'not found');
    }
  }

  const dataGauges: [string, () => number | undefined][] = [
    ['plotter.data.ready', () => (store.state ? 1 : 0)],
    ['plotter.data.vertices', () => store.state?.vertices],
    ['plotter.data.edges', () => store.state?.edges],
    ['plotter.data.places', () => store.state?.places.length],
  ];
  const removeGauges = dataGauges.map(([name, read]) => {
    const gauge = meter().createObservableGauge(name);
    const callback = (result: ObservableResult) => {
      const value = read();
      if (value !== undefined) result.observe(value);
    };
    gauge.addCallback(callback);
    return () => gauge.removeCallback(callback);
  });

  const requestSeconds = meter().createHistogram('http.server.request.duration', {
    unit: 's',
    description: 'Duration of HTTP server requests',
    advice: { explicitBucketBoundaries: REQUEST_SECONDS },
  });

  const respond = async (req: IncomingMessage, res: ServerResponse, e: unknown): Promise<void> => {
    if (res.headersSent) return void res.end();
    if (e instanceof HttpError) {
      if (typeof e.extra.retryAfter === 'number') res.setHeader('retry-after', String(e.extra.retryAfter));
      const { retryAfter: _, ...extra } = e.extra;
      return sendJson(req, res, e.status, { error: e.message, ...extra });
    }
    console.error(e);
    trace.getActiveSpan()?.recordException(e as Error);
    emitLog('ERROR', 'unhandled error', {
      'exception.type': (e as Error)?.name ?? typeof e,
      'exception.message': (e as Error)?.message ?? String(e),
      'exception.stacktrace': (e as Error)?.stack ?? '',
    });
    return sendJson(req, res, 500, { error: 'internal error' });
  };

  const server = createServer((req, res) => {
    const method = req.method ?? 'GET';
    const path = (req.url ?? '/').split('?')[0];
    const route = routeOf(path);
    const run = () => handle(req, res).catch((e: unknown) => respond(req, res, e));
    if (route === '/api/otel/*' || route === '/api/health') return void run();

    const started = performance.now();
    const parent = propagation.extract(ROOT_CONTEXT, req.headers);
    const span = tracer().startSpan(
      `${method} ${route}`,
      { kind: SpanKind.SERVER, attributes: { 'http.request.method': method, 'http.route': route, 'url.path': path } },
      parent,
    );
    res.on('close', () => {
      const status = res.statusCode;
      span.setAttribute('http.response.status_code', status);
      if (status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
      requestSeconds.record((performance.now() - started) / 1000, {
        'http.request.method': method,
        'http.route': route,
        'http.response.status_code': status,
      });
    });
    return void context.with(trace.setSpan(parent, span), run);
  });
  await new Promise<void>((resolve) => server.listen(opts.port ?? 8080, opts.host ?? '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    server,
    store,
    close: () =>
      new Promise<void>((resolve) => {
        store.stop();
        for (const remove of removeGauges) remove();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
