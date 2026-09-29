import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { emitLog } from './telemetry';
import { FIS_FORMAT_VERSION, mergeFisIntoGraph, mergeFisPlaces, type FisFile } from '../src/core/fis';
import { PlaceIndex } from '../src/core/search';
import { decodeGraph, type Graph } from '../src/core/routing';
import {
  FORMAT_VERSION,
  type DataManifest,
  type Place,
  type Seamark,
  type WaterwayFile,
} from '../src/core/waterway-data';

export interface DataState {
  key: string;
  manifest: DataManifest;
  graph: Graph;
  /** OpenStreetMap places; what search and town-to-harbour routing use */
  places: Place[];
  /** places plus the official bridges, locks and berths; what the map and offline packs show */
  mapPlaces: Place[];
  seamarks: Seamark[];
  index: PlaceIndex;
  edges: number;
  vertices: number;
  fis: { file: FisFile; matched: number; obstacles: number } | null;
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

  /** The fairway data is an addition: a missing or unreadable file must not take routing down. */
  private async loadFis(manifest: DataManifest): Promise<FisFile | null> {
    if (!manifest.fis) return null;
    try {
      const fis = JSON.parse(await readFile(join(this.dir, basename(manifest.fis)), 'utf8')) as FisFile;
      const lists = [fis.bridges, fis.locks, fis.berths];
      if (fis.version !== FIS_FORMAT_VERSION || !lists.every(Array.isArray)) {
        throw new Error(`unsupported fairway file version ${fis.version}`);
      }
      return fis;
    } catch (e) {
      const message = `fairway data ignored: ${(e as Error).message}`;
      console.error(message);
      emitLog('ERROR', message);
      return null;
    }
  }

  /** Seamarks are an addition too: manifests from before they existed, or a broken file, leave the list empty. */
  private async loadSeamarks(manifest: DataManifest): Promise<Seamark[]> {
    if (!manifest.seamarks) return [];
    try {
      const list = JSON.parse(await readFile(join(this.dir, basename(manifest.seamarks)), 'utf8')) as Seamark[];
      if (!Array.isArray(list)) throw new Error('seamarks file is not a list');
      return list;
    } catch (e) {
      const message = `seamarks ignored: ${(e as Error).message}`;
      console.error(message);
      emitLog('ERROR', message);
      return [];
    }
  }

  private async load(): Promise<boolean> {
    let manifest: DataManifest;
    try {
      manifest = JSON.parse(await readFile(join(this.dir, 'current.json'), 'utf8')) as DataManifest;
    } catch {
      return false;
    }
    const key = `${manifest.waterways}|${manifest.places}|${manifest.built}|${manifest.fis ?? ''}|${manifest.seamarks ?? ''}`;
    if (this.state?.key === key) return false;
    try {
      const file = JSON.parse(await readFile(join(this.dir, basename(manifest.waterways)), 'utf8')) as WaterwayFile;
      if (file.version !== FORMAT_VERSION || !Array.isArray(file.edges) || !Array.isArray(file.vertices)) {
        throw new Error(`unsupported waterway file version ${file.version}`);
      }
      const places = JSON.parse(await readFile(join(this.dir, basename(manifest.places)), 'utf8')) as Place[];
      if (!Array.isArray(places)) throw new Error('places file is not a list');
      const graph = decodeGraph(file);
      const fis = await this.loadFis(manifest);
      const seamarks = await this.loadSeamarks(manifest);
      const merge = fis ? mergeFisIntoGraph(graph, fis) : null;
      this.state = {
        key,
        manifest,
        graph,
        places,
        mapPlaces: fis ? mergeFisPlaces(places, fis) : places,
        seamarks,
        index: new PlaceIndex(places),
        edges: file.edges.length,
        vertices: file.vertices.length / 2,
        fis: fis && merge ? { file: fis, matched: merge.matched, obstacles: merge.total } : null,
      };
      const fisNote = fis && merge ? `, fairway ${fis.generation}: ${merge.matched}/${merge.total} bridges` : '';
      const summary = `data loaded: ${file.edges.length} edges, ${places.length} places, built ${manifest.built}`;
      console.log(summary + fisNote);
      emitLog('INFO', summary, { 'data.edges': file.edges.length, 'data.places': places.length, 'data.built': manifest.built });
      return true;
    } catch (e) {
      const message = `data reload failed, keeping previous data: ${(e as Error).message}`;
      console.error(message);
      emitLog('ERROR', message);
      return false;
    }
  }
}
