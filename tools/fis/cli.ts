#!/usr/bin/env node
/**
 * Downloads the Vaarweginformatie fairway objects (bridges, locks, berths) and publishes them:
 *   node tools/fis/cli.ts --out DIR [--force] [--chown UID:GID] [--timeout-min 20]
 * Writes fis-<generation>.json, then adds it to the existing current.json. Does nothing when that
 * generation is already published, unless --force.
 */
import { chmod, chown, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { DataManifest } from '../../src/core/waterway-data.ts';
import {
  CONCURRENCY,
  GEOTYPES,
  buildFis,
  createLimiter,
  currentGeneration,
  fetchAll,
  publishedManifest,
  shouldSkip,
  type FisRaw,
} from './build.ts';

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    force: { type: 'boolean', default: false },
    chown: { type: 'string' },
    'timeout-min': { type: 'string', default: '20' },
  },
});
if (!values.out) {
  console.error('usage: cli.ts --out DIR [--force] [--chown UID:GID] [--timeout-min N]');
  process.exit(2);
}
const out = values.out;
const owner = values.chown?.split(':').map(Number);
const t0 = Date.now();

/** World-readable and, when asked for, owned by the uid that serves the files; must happen before the manifest is published. */
async function share(path: string): Promise<void> {
  await chmod(path, 0o644);
  if (owner) await chown(path, owner[0], owner[1]).catch(() => {});
}

async function readManifest(): Promise<DataManifest | null> {
  try {
    return JSON.parse(await readFile(join(out, 'current.json'), 'utf8')) as DataManifest;
  } catch {
    return null;
  }
}

const signal = AbortSignal.timeout(Number(values['timeout-min']) * 60_000);
const { generation, published } = await currentGeneration({ signal });
const manifest = await readManifest();
if (shouldSkip(generation, manifest, values.force)) {
  console.error(`generation ${generation} is already published`);
  process.exit(0);
}
if (!manifest?.waterways) {
  console.error('no waterway data published yet in the output directory; run plotter-waterways first');
  process.exit(1);
}

const limit = createLimiter(CONCURRENCY);
const fetched = await Promise.all(GEOTYPES.map((t) => fetchAll(t, { generation, limit, signal })));
const raw = Object.fromEntries(GEOTYPES.map((t, i) => [t, fetched[i]])) as FisRaw;
const file = buildFis(raw, {
  generation,
  published,
  built: new Date().toISOString(),
  source: 'https://www.vaarweginformatie.nl',
});

const name = `fis-${generation}.json`;
await writeFile(join(out, `${name}.part`), JSON.stringify(file));
await share(join(out, `${name}.part`));
await rename(join(out, `${name}.part`), join(out, name));

// Read again: the waterways job may have published while this one was downloading.
const latest = (await readManifest()) ?? manifest;
await writeFile(join(out, 'current.json.new'), `${JSON.stringify(publishedManifest(latest, name, generation))}\n`);
await share(join(out, 'current.json.new'));
await rename(join(out, 'current.json.new'), join(out, 'current.json'));

for (const f of await readdir(out)) {
  if (/^fis-.*\.json(\.part)?$/.test(f) && f !== name) await rm(join(out, f));
}

const counts = Object.fromEntries(GEOTYPES.map((t, i) => [t, fetched[i].length]));
console.error(
  JSON.stringify(
    {
      generation,
      seconds: (Date.now() - t0) / 1000,
      bytes: (await stat(join(out, name))).size,
      fetched: counts,
      bridges: file.bridges.length,
      bridgesWithClearance: file.bridges.filter((b) => b.clearance !== undefined).length,
      locks: file.locks.length,
      berths: file.berths.length,
    },
    null,
    2,
  ),
);
