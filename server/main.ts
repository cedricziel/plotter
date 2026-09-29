import { startServer } from './app';
import { emitLog, relayFromEnv, shutdownTelemetry, startTelemetry } from './telemetry';

const env = process.env;
const relay = relayFromEnv(env);
startTelemetry();
const running = await startServer({
  dataDir: env.DATA_DIR ?? '/srv/data',
  tilesDir: env.TILES_DIR ?? '/srv/tiles',
  port: Number(env.PORT ?? 8080),
  host: env.HOST ?? '0.0.0.0',
  pollMs: Number(env.POLL_MS ?? 600_000),
  maxTiles: Number(env.MAX_TILES ?? 20_000),
  trustProxy: env.TRUST_PROXY === '1',
  relay,
});
console.log(`plotter server listening on :${running.port}`);
emitLog('INFO', 'server started', { 'server.port': running.port, 'telemetry.relay': !!relay });

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(
    sig,
    () =>
      void running
        .close()
        .then(shutdownTelemetry)
        .then(() => process.exit(0)),
  );
}
