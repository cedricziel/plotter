import type { IncomingMessage, ServerResponse } from 'node:http';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(gzip);
const GZIP_MIN_BYTES = 1024;

const STATUS_CODES: Record<number, string> = { 404: 'not-found', 429: 'rate-limited', 503: 'not-ready' };

/** `code` lets the client word the error in its language; it defaults from the status. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly extra: Record<string, unknown>;
  constructor(status: number, message: string, extra: Record<string, unknown> = {}, code?: string) {
    super(message);
    this.status = status;
    this.code = code ?? STATUS_CODES[status] ?? (status >= 500 ? 'internal' : 'bad-request');
    this.extra = extra;
  }
}

export async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) throw new HttpError(413, `body larger than ${limit} bytes`);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, `body larger than ${limit} bytes`);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  const body = await readBody(req, limit);
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new HttpError(400, 'body is not valid JSON');
  }
}

export async function sendJson(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: unknown,
): Promise<void> {
  const raw = Buffer.from(JSON.stringify(body));
  const headers: Record<string, string | number> = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    vary: 'accept-encoding',
  };
  let payload = raw;
  if (raw.length >= GZIP_MIN_BYTES && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
    payload = await gzipAsync(raw);
    headers['content-encoding'] = 'gzip';
  }
  headers['content-length'] = payload.length;
  res.writeHead(status, headers);
  res.end(payload);
}

const MAX_KEYS = 10_000;
const EVICT_BATCH = 1_000;

/** Fixed-window request counter per key. */
export class RateLimiter {
  private hits = new Map<string, { count: number; reset: number }>();
  private readonly windowMs: number;

  constructor(windowMs = 60_000) {
    this.windowMs = windowMs;
  }

  /** Seconds to wait when over the limit, otherwise 0. */
  check(key: string, max: number, now = Date.now()): number {
    if (this.hits.size >= MAX_KEYS) {
      for (const [k, v] of this.hits) if (v.reset <= now) this.hits.delete(k);
      // Make room for a batch, so a flood of new keys pays for the scan once per batch, not per request.
      for (const k of this.hits.keys()) {
        if (this.hits.size < MAX_KEYS - EVICT_BATCH) break;
        this.hits.delete(k);
      }
    }
    const h = this.hits.get(key);
    if (!h || h.reset <= now) {
      this.hits.set(key, { count: 1, reset: now + this.windowMs });
      return 0;
    }
    if (h.count >= max) return Math.max(1, Math.ceil((h.reset - now) / 1000));
    h.count++;
    return 0;
  }
}

export function clientKey(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = String(req.headers['x-forwarded-for'] ?? '')
      .split(',')[0]
      .trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress ?? 'unknown';
}
