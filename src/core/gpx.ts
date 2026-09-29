import type { Route, Track, TrackPoint, Waypoint } from './model';
import { uid } from './model';

const CREATOR = 'Plotter (virtual chartplotter)';

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const coord = (n: number) => n.toFixed(7).replace(/0+$/, '').replace(/\.$/, '');
const attrs = (p: { lat: number; lon: number }) => `lat="${coord(p.lat)}" lon="${coord(p.lon)}"`;
const nameTag = (name: string | undefined, indent: string) =>
  name ? `\n${indent}<name>${escapeXml(name)}</name>` : '';

function header(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="${escapeXml(CREATOR)}" xmlns="http://www.topografix.com/GPX/1/1" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">`
  );
}

export interface GpxData {
  waypoints?: Waypoint[];
  routes?: Route[];
  tracks?: Track[];
}

/** Serialise waypoints, routes and tracks to a GPX 1.1 document. */
export function toGpx(data: GpxData): string {
  const out: string[] = [header()];
  const wpById = new Map((data.waypoints ?? []).map((w) => [w.id, w]));

  for (const w of data.waypoints ?? []) {
    out.push(`  <wpt ${attrs(w)}>${nameTag(w.name, '    ')}\n    <sym>Waypoint</sym>\n  </wpt>`);
  }

  for (const r of data.routes ?? []) {
    const pts = r.waypointIds
      .map((id) => wpById.get(id))
      .filter((w): w is Waypoint => !!w)
      .map((w) => `    <rtept ${attrs(w)}>${nameTag(w.name, '      ')}\n    </rtept>`);
    out.push(`  <rte>${nameTag(r.name, '    ')}\n${pts.join('\n')}${pts.length ? '\n' : ''}  </rte>`);
  }

  for (const t of data.tracks ?? []) {
    const pts = t.points.map((p) => {
      const ele = p.ele != null ? `\n        <ele>${p.ele.toFixed(1)}</ele>` : '';
      const d = Number.isFinite(p.time) ? new Date(p.time) : null;
      const time = d && !Number.isNaN(d.getTime()) ? `\n        <time>${d.toISOString()}</time>` : '';
      return `      <trkpt ${attrs(p)}>${ele}${time}\n      </trkpt>`;
    });
    out.push(
      `  <trk>${nameTag(t.name, '    ')}\n    <trkseg>\n${pts.join('\n')}${pts.length ? '\n' : ''}    </trkseg>\n  </trk>`,
    );
  }

  out.push('</gpx>\n');
  return out.join('\n');
}

export interface ParsedGpx {
  waypoints: Waypoint[];
  routes: Route[];
  tracks: Track[];
}

function childText(el: Element, tag: string): string | undefined {
  for (const c of Array.from(el.children)) {
    if (c.localName === tag) return c.textContent?.trim() || undefined;
  }
  return undefined;
}

function children(el: Element, tag: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName === tag);
}

function readPoint(el: Element): { lat: number; lon: number } | null {
  const lat = Number(el.getAttribute('lat'));
  const lon = Number(el.getAttribute('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  if (el.getAttribute('lat') == null || el.getAttribute('lon') == null) return null;
  return { lat, lon };
}

/**
 * Parse a GPX document. Route points become waypoints (so they can be edited
 * on the map) referenced by the imported route. Uses DOMParser, so it runs in
 * the browser (and in tests under happy-dom).
 */
export function parseGpx(xml: string, now = Date.now()): ParsedGpx {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (!root || root.localName !== 'gpx' || doc.getElementsByTagName('parsererror').length) {
    throw new Error('Not a valid GPX file');
  }

  const waypoints: Waypoint[] = [];
  const routes: Route[] = [];
  const tracks: Track[] = [];

  children(root, 'wpt').forEach((el, i) => {
    const p = readPoint(el);
    if (p) waypoints.push({ id: uid(), name: childText(el, 'name') ?? `WPT ${i + 1}`, created: now, ...p });
  });

  children(root, 'rte').forEach((rte, ri) => {
    const name = childText(rte, 'name') ?? `Route ${ri + 1}`;
    const ids: string[] = [];
    children(rte, 'rtept').forEach((el, i) => {
      const p = readPoint(el);
      if (!p) return;
      const w: Waypoint = { id: uid(), name: childText(el, 'name') ?? `${name} ${i + 1}`, created: now, ...p };
      waypoints.push(w);
      ids.push(w.id);
    });
    routes.push({ id: uid(), name, waypointIds: ids, created: now });
  });

  children(root, 'trk').forEach((trk, ti) => {
    const points: TrackPoint[] = [];
    for (const seg of children(trk, 'trkseg')) {
      for (const el of children(seg, 'trkpt')) {
        const p = readPoint(el);
        if (!p) continue;
        const t = childText(el, 'time');
        const ele = childText(el, 'ele');
        const time = t ? Date.parse(t) : NaN;
        points.push({
          ...p,
          time: Number.isFinite(time) ? time : now,
          ele: ele != null && Number.isFinite(Number(ele)) ? Number(ele) : null,
        });
      }
    }
    tracks.push({
      id: uid(),
      name: childText(trk, 'name') ?? `Track ${ti + 1}`,
      points,
      started: points[0]?.time ?? now,
      ended: points[points.length - 1]?.time ?? now,
    });
  });

  return { waypoints, routes, tracks };
}
