import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { PlaceIndex } from '../src/core/search';
import { decodeGraph, type Graph } from '../src/core/routing';
import { FORMAT_VERSION, type DataManifest, type Place, type WaterwayFile } from '../src/core/waterway-data';

export interface DataState {
  key: string;
  manifest: DataManifest;
  graph: Graph;
  places: Place[];
  index: PlaceIndex;
  edges: number;
  vertices: number;
}

/** In-memory routing data loaded from the data job's output; reload() swaps it atomically. */
export class DataStore {
  state: DataState | null = null;
  private readonly dir: string;
  private loading: Promise<boolean> | null = null;
  private timer: NodeJS.Timeout | undefined;

  constructor(dir: string) {
    this.dir = dir;
  }

  reload(): Promise<boolean> {
    this.loading ??= this.load().finally(() => (this.loading = null));
    return this.loading;
  }

  /** Re-checks current.json every `ms`; the previous data keeps serving until the new files are parsed. */
  startPolling(ms: number): void {
    if (ms <= 0) return;
    this.timer = setInterval(() => void this.reload(), ms);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
  }

  private async load(): Promise<boolean> {
    let manifest: DataManifest;
    try {
      manifest = JSON.parse(await readFile(join(this.dir, 'current.json'), 'utf8')) as DataManifest;
    } catch {
      return false;
    }
    const key = `${manifest.waterways}|${manifest.places}|${manifest.built}`;
    if (this.state?.key === key) return false;
    try {
      const file = JSON.parse(await readFile(join(this.dir, basename(manifest.waterways)), 'utf8')) as WaterwayFile;
      if (file.version !== FORMAT_VERSION || !Array.isArray(file.edges) || !Array.isArray(file.vertices)) {
        throw new Error(`unsupported waterway file version ${file.version}`);
      }
      const places = JSON.parse(await readFile(join(this.dir, basename(manifest.places)), 'utf8')) as Place[];
      if (!Array.isArray(places)) throw new Error('places file is not a list');
      const graph = decodeGraph(file);
      this.state = {
        key,
        manifest,
        graph,
        places,
        index: new PlaceIndex(places),
        edges: file.edges.length,
        vertices: file.vertices.length / 2,
      };
      console.log(`data loaded: ${file.edges.length} edges, ${places.length} places, built ${manifest.built}`);
      return true;
    } catch (e) {
      console.error(`data reload failed, keeping previous data: ${(e as Error).message}`);
      return false;
    }
  }
}
