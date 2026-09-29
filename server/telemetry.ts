import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { context, metrics, propagation, trace, SpanStatusCode, type Attributes, type Span } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BasicTracerProvider, BatchSpanProcessor, type SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { HttpError } from './http';

const SCOPE = 'plotter-server';

export interface Relay {
  endpoint: string;
  headers: Record<string, string>;
}

/** `k=v,k=v` as in OTEL_EXPORTER_OTLP_HEADERS, values percent-decoded. */
export function parseHeaders(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (raw ?? '').split(',')) {
    const at = pair.indexOf('=');
    if (at < 1) continue;
    try {
      out[pair.slice(0, at).trim().toLowerCase()] = decodeURIComponent(pair.slice(at + 1).trim());
    } catch {
      /* skip a malformed value rather than fail startup */
    }
  }
  return out;
}

export function relayFromEnv(env: NodeJS.ProcessEnv = process.env): Relay | undefined {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.replace(/\/+$/, '');
  return endpoint ? { endpoint, headers: parseHeaders(env.OTEL_EXPORTER_OTLP_HEADERS) } : undefined;
}

let providers: { shutdown(): Promise<void> }[] = [];

/** Starts the exporters when OTEL_EXPORTER_OTLP_ENDPOINT is set; otherwise (or without `spanProcessors`) everything stays a no-op. */
export function startTelemetry(opts: { spanProcessors?: SpanProcessor[] } = {}): void {
  const exporting = !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (providers.length || !(exporting || opts.spanProcessors)) return;
  const env = process.env;
  const resource = resourceFromAttributes({
    'service.name': env.OTEL_SERVICE_NAME || SCOPE,
    ...(env.BUILD_ID && { 'service.version': env.BUILD_ID }),
    ...(env.OTEL_DEPLOYMENT_ENVIRONMENT && { 'deployment.environment.name': env.OTEL_DEPLOYMENT_ENVIRONMENT }),
  });
  const contextManager = new AsyncLocalStorageContextManager().enable();
  context.setGlobalContextManager(contextManager);
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());

  const tracer = new BasicTracerProvider({
    resource,
    spanProcessors: opts.spanProcessors ?? [new BatchSpanProcessor(new OTLPTraceExporter())],
  });
  trace.setGlobalTracerProvider(tracer);
  providers.push(tracer);
  if (!exporting) return;

  const meter = new MeterProvider({
    resource,
    readers: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter(), exportIntervalMillis: 60_000 })],
  });
  metrics.setGlobalMeterProvider(meter);
  const logger = new LoggerProvider({ resource, processors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })] });
  logs.setGlobalLoggerProvider(logger);
  providers.push(meter, logger);
}

export async function shutdownTelemetry(): Promise<void> {
  const stopping = providers;
  providers = [];
  await Promise.allSettled(stopping.map((p) => p.shutdown()));
  trace.disable();
  metrics.disable();
  logs.disable();
  context.disable();
  propagation.disable();
}

export const tracer = () => trace.getTracer(SCOPE);
export const meter = () => metrics.getMeter(SCOPE);

/** Runs `fn` in a child span of the active request; expected 4xx HttpErrors do not mark it failed. */
export function withSpan<T>(name: string, fn: (span: Span) => T): T {
  return tracer().startActiveSpan(name, (span) => {
    const fail = (e: unknown): never => {
      if (!(e instanceof HttpError && e.status < 500)) {
        span.recordException(e as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
      span.end();
      throw e;
    };
    try {
      const out = fn(span);
      if (!(out instanceof Promise)) {
        span.end();
        return out;
      }
      return out.then((v) => (span.end(), v), fail) as T;
    } catch (e) {
      return fail(e);
    }
  });
}

export function emitLog(severity: 'INFO' | 'ERROR', body: string, attributes: Attributes = {}): void {
  logs.getLogger(SCOPE).emit({
    severityNumber: severity === 'ERROR' ? SeverityNumber.ERROR : SeverityNumber.INFO,
    severityText: severity,
    body,
    attributes,
  });
}
