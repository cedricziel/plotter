import { startBrowserSdk } from '@opentelemetry/browser-sdk';
import { ErrorsInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/errors';
import { FetchInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/fetch';
import { NavigationInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/navigation';
import { NavigationTimingInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/navigation-timing';
import { WebVitalsInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/web-vitals';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { SpanStatusCode, trace, type Attributes, type Span } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import type { LogRecordProcessor } from '@opentelemetry/sdk-logs';
import { deviceAttributes } from './core/device';

const KEY = 'plotter.telemetry';
const API_BASE = import.meta.env.VITE_API_URL || './api';

export function telemetryEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function setTelemetryEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* private mode: the choice lasts until reload */
  }
  if (!on) void stopTelemetry();
}

// Positions travel in query strings, so no exported URL keeps one.
const withoutQuery = (url: string): string => {
  const u = new URL(url, location.href);
  return u.origin + u.pathname;
};

const stripUrlQuery: LogRecordProcessor = {
  onEmit(record) {
    const url = record.attributes['url.full'];
    if (typeof url === 'string') record.setAttribute('url.full', withoutQuery(url));
  },
  forceFlush: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
};

let stop: (() => Promise<void>) | undefined;

function stopTelemetry(): Promise<void> {
  const s = stop;
  stop = undefined;
  return s?.() ?? Promise.resolve();
}

function startTelemetry(): void {
  if (!telemetryEnabled() || stop) return;
  const relay = new URL(`${API_BASE}/otel`, location.href).href;
  const api = new URL(`${API_BASE}/`, location.href).href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sdk = startBrowserSdk({
    logLevel: 'NONE',
    serviceName: 'plotter-web',
    serviceVersion: __BUILD_ID__,
    resourceAttributes: deviceAttributes({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      screenWidth: screen.width,
      screenHeight: screen.height,
      pixelRatio: devicePixelRatio,
      standalone:
        matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
    }),
    logs: { processors: [stripUrlQuery], exportConfig: { url: `${relay}/v1/logs` } },
    traces: { exportConfig: { url: `${relay}/v1/traces` } },
  });
  const unregister = registerInstrumentations({
    instrumentations: [
      new ErrorsInstrumentation(),
      new NavigationInstrumentation(),
      new NavigationTimingInstrumentation(),
      new WebVitalsInstrumentation(),
      new FetchInstrumentation({
        ignoreUrls: [new RegExp(`^(?!${api}(?!otel(/|$)))`)],
        sanitizeUrl: withoutQuery,
      }),
    ],
  });
  stop = async () => {
    unregister();
    await sdk.shutdown();
  };
}

startTelemetry();

/** Runs `fn` inside a span named `name`; `fn` can add attributes, a thrown error marks the span failed. */
export async function traced<T>(name: string, fn: (span: Span) => Promise<T>, attributes?: Attributes): Promise<T> {
  return trace.getTracer('plotter-web').startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (e) {
      span.recordException(e as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw e;
    } finally {
      span.end();
    }
  });
}

/** Records a named event with attributes; a no-op while telemetry is off. */
export function logEvent(name: string, attributes: Attributes): void {
  logs.getLogger('plotter-web').emit({ eventName: name, body: name, attributes });
}
