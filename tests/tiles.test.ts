import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zxyToTileId } from 'pmtiles';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ChartArchive, openChart } from '../server/tiles';

function varint(n: number): number[] {
  const out: number[] = [];
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
}

/** Minimal uncompressed PMTiles v3 archive: one root directory, tiles laid out back to back. */
function archive(tiles: { z: number; x: number; y: number; size: number }[]): Buffer {
  const entries = tiles.map((t) => ({ id: zxyToTileId(t.z, t.x, t.y), size: t.size })).sort((a, b) => a.id - b.id);
  const dir: number[] = [...varint(entries.length)];
  let prev = 0;
  for (const e of entries) {
    dir.push(...varint(e.id - prev));
    prev = e.id;
  }
  for (let i = 0; i < entries.length; i++) dir.push(...varint(1));
  for (const e of entries) dir.push(...varint(e.size));
  for (let i = 0; i < entries.length; i++) dir.push(...varint(i === 0 ? 1 : 0));
  const total = entries.reduce((s, e) => s + e.size, 0);
  const header = Buffer.alloc(127);
  header.write('PMTiles', 0, 'latin1');
  header[7] = 3;
  const u64 = (o: number, v: number) => header.writeBigUInt64LE(BigInt(v), o);
  u64(8, 127);
  u64(16, dir.length);
  u64(24, 127 + dir.length);
  u64(32, 0);
  u64(40, 127 + dir.length);
  u64(48, 0);
  u64(56, 127 + dir.length);
  u64(64, total);
  u64(72, entries.length);
  u64(80, entries.length);
  u64(88, entries.length);
  header[96] = 1;
  header[97] = 1; // internal compression: none
  header[98] = 1; // tile compression: none
  header[99] = 1; // mvt
  header[100] = 0;
  header[101] = 14;
  return Buffer.concat([header, Buffer.from(dir), Buffer.alloc(total)]);
}

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'plotter-tiles-'));
  writeFileSync(
    join(dir, 'netherlands-20260101.pmtiles'),
    archive([
      { z: 10, x: 524, y: 336, size: 1200 },
      { z: 10, x: 525, y: 336, size: 800 },
      { z: 12, x: 2100, y: 1345, size: 5000 },
    ]),
  );
  writeFileSync(join(dir, 'current.json'), JSON.stringify({ url: './tiles/netherlands-20260101.pmtiles' }));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('ChartArchive', () => {
  it('reads the stored size of a tile and 0 for missing ones', async () => {
    const chart = new ChartArchive(join(dir, 'netherlands-20260101.pmtiles'));
    expect(await chart.tileBytes(10, 524, 336)).toBe(1200);
    expect(await chart.tileBytes(10, 525, 336)).toBe(800);
    expect(await chart.tileBytes(12, 2100, 1345)).toBe(5000);
    expect(await chart.tileBytes(10, 526, 336)).toBe(0);
    expect(await chart.tileBytes(15, 0, 0)).toBe(0);
  });

  it('exposes the header zoom range', async () => {
    const chart = new ChartArchive(join(dir, 'netherlands-20260101.pmtiles'));
    expect((await chart.getHeader()).maxZoom).toBe(14);
  });
});

describe('openChart', () => {
  it('follows tiles/current.json', async () => {
    expect((await openChart(dir))?.name).toBe('netherlands-20260101.pmtiles');
  });

  it('returns null when there is no chart', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'plotter-notiles-'));
    try {
      expect(await openChart(empty)).toBeNull();
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
