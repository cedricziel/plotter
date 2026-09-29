import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ApiMeta } from '../src/core/api';
import type { Place } from '../src/core/waterway-data';
import { startServer, type RunningServer } from '../server/app';
import { parseHeaders, shutdownTelemetry, startTelemetry } from '../server/telemetry';
import { fixture, latlon } from './graph-fixture';

const graph = fixture({ S: [0, 0], T: [10000, 0] }, [{ a: 'S', b: 'T', name: 'Hoofdvaart' }]);
const places: Place[] = [{ name: 'Hoorn', kind: 'town', ...latlon(9000, 200) }];

interface Seen {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

let dir: string;
let empty: string;
let upstream: Server;
let seen: Seen[];
let status = 200;
let plain: RunningServer;
let relaying: RunningServer;
let traced: RunningServer;
const memory = new InMemorySpanExporter();

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'plotter-data-'));
  empty = mkdtempSync(join(tmpdir(), 'plotter-empty-'));
  writeFileSync(join(dir, 'waterways.json'), JSON.stringify({ ...graph, built: '2026-01-01T00:00:00Z' }));
  writeFileSync(join(dir, 'places.json'), JSON.stringify(places));
  writeFileSync(
    join(dir, 'current.json'),
    JSON.stringify({ waterways: './waterways.json', places: './places.json', built: '2026-01-01T00:00:00Z', source: 'test' }),
  );
  upstream = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      seen.push({ path: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(status).end();
    });
  });
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  const endpoint = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  startTelemetry({ spanProcessors: [new SimpleSpanProcessor(memory)] });
  plain = await startServer({ dataDir: empty, port: 0, pollMs: 0 });
  relaying = await startServer({
    dataDir: empty,
    port: 0,
    pollMs: 0,
    relay: { endpoint, headers: { authorization: 'Bearer k', 'x-tenant-id': 't' } },
  });
  traced = await startServer({ dataDir: dir, port: 0, pollMs: 0 });
});

afterAll(async () => {
  await Promise.all([plain.close(), relaying.close(), traced.close()]);
  await shutdownTelemetry();
  await new Promise((r) => upstream.close(r));
  rmSync(dir, { recursive: true, force: true });
  rmSync(empty, { recursive: true, force: true });
});

beforeEach(() => {
  seen = [];
  status = 200;
  memory.reset();
});

const otlp = (s: RunningServer, signal: string, body: BodyInit, type = 'application/json') =>
  fetch(`${s.url}/api/otel/v1/${signal}`, { method: 'POST', headers: { 'content-type': type }, body });

describe('parseHeaders', () => {
  it('reads comma separated key=value pairs', () => {
    expect(parseHeaders('authorization=Bearer%20abc, x-tenant-id=t=1,,junk')).toEqual({
      authorization: 'Bearer abc',
      'x-tenant-id': 't=1',
    });
    expect(parseHeaders(undefined)).toEqual({});
  });
});

describe('browser relay', () => {
  it('answers 204 without forwarding when unconfigured', async () => {
    const res = await otlp(plain, 'traces', '{}');
    expect(res.status).toBe(204);
    expect(seen).toHaveLength(0);
  });

  it('forwards body and content-type with the configured headers', async () => {
    const body = JSON.stringify({ resourceSpans: [] });
    const res = await otlp(relaying, 'traces', body);
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0].path).toBe('/v1/traces');
    expect(seen[0].body.toString()).toBe(body);
    expect(seen[0].headers['content-type']).toBe('application/json');
    expect(seen[0].headers.authorization).toBe('Bearer k');
    expect(seen[0].headers['x-tenant-id']).toBe('t');
    await otlp(relaying, 'logs', new Uint8Array([1, 2, 3]), 'application/x-protobuf');
    expect(seen[1].path).toBe('/v1/logs');
    expect(seen[1].headers['content-type']).toBe('application/x-protobuf');
    expect([...seen[1].body]).toEqual([1, 2, 3]);
  });

  it('passes the upstream status through', async () => {
    status = 401;
    expect((await otlp(relaying, 'traces', '{}')).status).toBe(401);
  });

  it('answers 502 when the upstream is unreachable', async () => {
    const dead = await startServer({
      dataDir: empty,
      port: 0,
      pollMs: 0,
      relay: { endpoint: 'http://127.0.0.1:1', headers: {} },
    });
    expect((await otlp(dead, 'traces', '{}')).status).toBe(502);
    await dead.close();
  });

  it('rejects oversize bodies with 413', async () => {
    expect((await otlp(relaying, 'traces', 'x'.repeat(256 * 1024 + 1))).status).toBe(413);
    expect(seen).toHaveLength(0);
  });

  it('rejects other content types with 415', async () => {
    expect((await otlp(relaying, 'traces', 'hi', 'text/plain')).status).toBe(415);
    expect(seen).toHaveLength(0);
  });

  it('rate limits per client', async () => {
    const limited = await startServer({
      dataDir: empty,
      port: 0,
      pollMs: 0,
      rateLimits: { otel: 2 },
      relay: { endpoint: 'http://127.0.0.1:1', headers: {} },
    });
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await otlp(limited, 'traces', '{}')).status);
    expect(codes).toEqual([502, 502, 429]);
    await limited.close();
  });

  it('is reported in /api/meta and never creates spans', async () => {
    const flag = async (s: RunningServer) => ((await (await fetch(`${s.url}/api/meta`)).json()) as ApiMeta).telemetry;
    expect(await flag(plain)).toBe(false);
    expect(await flag(relaying)).toBe(true);
    memory.reset();
    await otlp(relaying, 'traces', '{}');
    expect(memory.getFinishedSpans()).toHaveLength(0);
  });
});

describe('request spans', () => {
  const find = (name: string) => memory.getFinishedSpans().find((s) => s.name === name);

  it('names the span after the route and keeps the query string out', async () => {
    const res = await fetch(`${traced.url}/api/search?q=hoorn&near=52.5,5.1`);
    expect(res.status).toBe(200);
    const span = find('GET /api/search');
    expect(span).toBeDefined();
    expect(span?.attributes).toMatchObject({
      'http.request.method': 'GET',
      'http.route': '/api/search',
      'url.path': '/api/search',
      'http.response.status_code': 200,
    });
    expect(JSON.stringify(span?.attributes)).not.toMatch(/hoorn|52\.5/);
    const child = find('search.query');
    expect(child?.attributes['search.result_count']).toBe(1);
    expect(JSON.stringify(child?.attributes)).not.toMatch(/hoorn/);
    expect(child?.parentSpanContext?.spanId).toBe(span?.spanContext().spanId);
  });

  it('joins the trace of an incoming traceparent', async () => {
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    await fetch(`${traced.url}/api/health`, {
      headers: { traceparent: `00-${traceId}-00f067aa0ba902b7-01` },
    });
    const span = find('GET /api/health');
    expect(span?.spanContext().traceId).toBe(traceId);
    expect(span?.parentSpanContext?.spanId).toBe('00f067aa0ba902b7');
  });

  it('marks unknown paths and records client errors without an error status', async () => {
    await fetch(`${traced.url}/api/nope?x=1`);
    const span = find('GET unmatched');
    expect(span?.attributes['http.route']).toBe('unmatched');
    expect(span?.attributes['http.response.status_code']).toBe(404);
    expect(span?.status.code).toBe(0);
  });

  it('describes routing without echoing positions', async () => {
    const res = await fetch(`${traced.url}/api/route`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: latlon(0, 0), to: latlon(10000, 0) }),
    });
    expect(res.status).toBe(200);
    const child = find('route.compute');
    expect(child?.attributes['route.success']).toBe(true);
    expect(child?.attributes['route.distance_m']).toBeGreaterThan(9000);
    expect(child?.attributes).toHaveProperty('route.maneuvers');
    expect(child?.attributes).toHaveProperty('route.warnings');
  });
});
