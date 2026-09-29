#!/usr/bin/env node
/**
 * Builds the routing graph and place index from OPL on stdin:
 *   osmium add-locations-to-ways --ignore-missing-nodes -f opl in.osm.pbf | node tools/waterways/cli.ts --out DIR --source URL
 * Writes waterways-<date>.json, places-<date>.json and, last, current.json.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, chown, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import type { DataManifest, Place, WaterwayFile } from '../../src/core/waterway-data.ts';
import { WaterwayBuilder } from './build.ts';

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    source: { type: 'string', default: 'unknown' },
    date: { type: 'string' },
    input: { type: 'string' },
    chown: { type: 'string' },
  },
});
if (!values.out) {
  console.error('usage: cli.ts --out DIR [--source URL] [--date YYYYMMDD] [--input file.opl] [--chown UID:GID]');
  process.exit(2);
}
const out = values.out;
const built = new Date();
const owner = values.chown?.split(':').map(Number);
const date = values.date ?? built.toISOString().slice(0, 10).replaceAll('-', '');

/** World-readable and, when asked for, owned by the uid that serves the files; must happen before the manifest is published. */
async function share(path: string): Promise<void> {
  await chmod(path, 0o644);
  if (owner) await chown(path, owner[0], owner[1]).catch(() => {});
}

async function writeJson(path: string, head: string, edges: unknown[], tail: string): Promise<void> {
  const s = createWriteStream(path);
  s.write(head);
  for (let i = 0; i < edges.length; i++) {
    if (!s.write(`${i ? ',\n' : '\n'}${JSON.stringify(edges[i])}`)) await once(s, 'drain');
  }
  s.write(tail);
  s.end();
  await once(s, 'finish');
}

async function writeGraph(path: string, f: WaterwayFile): Promise<void> {
  const head =
    `{"version":${f.version},"built":${JSON.stringify(f.built)},"source":${JSON.stringify(f.source)},` +
    `"names":${JSON.stringify(f.names)},"vertices":${JSON.stringify(f.vertices)},"edges":[`;
  await writeJson(path, head, f.edges, '\n]}\n');
}

async function writePlaces(path: string, places: Place[]): Promise<void> {
  await writeJson(path, '[', places, '\n]\n');
}

const t0 = Date.now();
const builder = new WaterwayBuilder({ source: values.source!, built: built.toISOString() });
const input = values.input ? createReadStream(values.input) : process.stdin;
let lines = 0;
for await (const line of createInterface({ input, crlfDelay: Infinity })) {
  builder.add(line);
  lines++;
}
const { file, places, stats } = builder.finish();

const wName = `waterways-${date}.json`;
const pName = `places-${date}.json`;
await writeGraph(join(out, `${wName}.part`), file);
await writePlaces(join(out, `${pName}.part`), places);
await share(join(out, `${wName}.part`));
await share(join(out, `${pName}.part`));
await rename(join(out, `${wName}.part`), join(out, wName));
await rename(join(out, `${pName}.part`), join(out, pName));

const manifest: DataManifest = {
  waterways: `./data/${wName}`,
  places: `./data/${pName}`,
  built: file.built,
  source: file.source,
};
await writeFile(join(out, 'current.json.new'), `${JSON.stringify(manifest)}\n`);
await share(join(out, 'current.json.new'));
await rename(join(out, 'current.json.new'), join(out, 'current.json'));

for (const f of await readdir(out)) {
  if (/^(waterways|places)-.*\.json(\.part)?$/.test(f) && f !== wName && f !== pName) await rm(join(out, f));
}

const sizes = { waterways: (await stat(join(out, wName))).size, places: (await stat(join(out, pName))).size };
console.error(JSON.stringify({ lines, seconds: (Date.now() - t0) / 1000, sizes, stats }, null, 2));
