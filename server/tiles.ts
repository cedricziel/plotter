import { open, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { PMTiles, findTile, zxyToTileId, type Header, type Source } from 'pmtiles';

class FileSource implements Source {
  private readonly path: string;
  constructor(path: string) {
    this.path = path;
  }
  getKey(): string {
    return this.path;
  }
  async getBytes(offset: number, length: number) {
    const fh = await open(this.path, 'r');
    try {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await fh.read(buf, 0, length, offset);
      return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + bytesRead) as ArrayBuffer };
    } finally {
      await fh.close();
    }
  }
}

/** Reads tile sizes from a PMTiles archive's directories without touching the tile data. */
export class ChartArchive {
  readonly name: string;
  private readonly source: FileSource;
  private readonly pm: PMTiles;
  private header: Header | null = null;

  constructor(path: string) {
    this.name = basename(path);
    this.source = new FileSource(path);
    this.pm = new PMTiles(this.source);
  }

  async getHeader(): Promise<Header> {
    this.header ??= await this.pm.getHeader();
    return this.header;
  }

  /** Bytes of the stored tile, 0 when the archive has none there. */
  async tileBytes(z: number, x: number, y: number): Promise<number> {
    const h = await this.getHeader();
    if (z < h.minZoom || z > h.maxZoom) return 0;
    const id = zxyToTileId(z, x, y);
    let offset = h.rootDirectoryOffset;
    let length = h.rootDirectoryLength;
    for (let depth = 0; depth < 4; depth++) {
      const entries = await this.pm.cache.getDirectory(this.source, offset, length, h);
      const entry = findTile(entries, id);
      if (!entry) return 0;
      if (entry.runLength > 0) return entry.length;
      offset = h.leafDirectoryOffset + entry.offset;
      length = entry.length;
    }
    return 0;
  }
}

/** The chart the tiles job published (tiles/current.json), or the legacy netherlands.pmtiles. */
export async function openChart(tilesDir: string): Promise<ChartArchive | null> {
  const candidates: string[] = [];
  try {
    const cur = JSON.parse(await readFile(join(tilesDir, 'current.json'), 'utf8')) as { url?: string };
    if (cur.url) candidates.push(basename(cur.url));
  } catch {
    /* no manifest */
  }
  candidates.push('netherlands.pmtiles');
  for (const name of candidates) {
    const path = join(tilesDir, name);
    try {
      if ((await stat(path)).isFile()) return new ChartArchive(path);
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}
