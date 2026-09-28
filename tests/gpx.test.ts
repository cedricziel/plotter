// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { escapeXml, parseGpx, toGpx } from '../src/core/gpx';
import type { Route, Track, Waypoint } from '../src/core/model';

const wps: Waypoint[] = [
  { id: 'a', name: 'Sluis <Oranje> & co', lat: 52.3866, lon: 4.9813, created: 0 },
  { id: 'b', name: 'Muiden', lat: 52.3317, lon: 5.0694, created: 0 },
];
const route: Route = { id: 'r', name: 'IJ naar Muiden', waypointIds: ['a', 'b', 'missing'], created: 0 };
const track: Track = {
  id: 't',
  name: 'Tocht',
  started: Date.UTC(2026, 5, 1, 10),
  points: [
    { lat: 52.38, lon: 4.9, time: Date.UTC(2026, 5, 1, 10, 0, 0) },
    { lat: 52.381, lon: 4.901, time: Date.UTC(2026, 5, 1, 10, 0, 30), ele: 0.5 },
  ],
};

describe('toGpx', () => {
  const xml = toGpx({ waypoints: wps, routes: [route], tracks: [track] });

  it('produces a GPX 1.1 document', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<gpx version="1.1"');
    expect(xml).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
    expect(xml.trim().endsWith('</gpx>')).toBe(true);
  });

  it('escapes names', () => {
    expect(xml).toContain('<name>Sluis &lt;Oranje&gt; &amp; co</name>');
    expect(escapeXml(`"'`)).toBe('&quot;&apos;');
  });

  it('writes waypoints, route points and track points', () => {
    expect(xml.match(/<wpt /g)).toHaveLength(2);
    expect(xml.match(/<rtept /g)).toHaveLength(2); // unknown id is skipped
    expect(xml.match(/<trkpt /g)).toHaveLength(2);
    expect(xml).toContain('<wpt lat="52.3866" lon="4.9813">');
    expect(xml).toContain('<time>2026-06-01T10:00:30.000Z</time>');
    expect(xml).toContain('<ele>0.5</ele>');
  });

  it('is well-formed XML', () => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.documentElement.localName).toBe('gpx');
  });

  it('handles empty input', () => {
    const empty = toGpx({});
    expect(empty).toContain('<gpx');
    expect(parseGpx(empty)).toEqual({ waypoints: [], routes: [], tracks: [] });
  });
});

describe('parseGpx', () => {
  it('round-trips exported data', () => {
    const parsed = parseGpx(toGpx({ waypoints: wps, routes: [route], tracks: [track] }));
    // 2 standalone waypoints + 2 route points
    expect(parsed.waypoints).toHaveLength(4);
    expect(parsed.waypoints[0].name).toBe('Sluis <Oranje> & co');
    expect(parsed.waypoints[0].lat).toBeCloseTo(52.3866, 7);
    expect(parsed.routes).toHaveLength(1);
    expect(parsed.routes[0].name).toBe('IJ naar Muiden');
    const ids = parsed.routes[0].waypointIds;
    expect(ids).toHaveLength(2);
    expect(parsed.waypoints.find((w) => w.id === ids[1])?.name).toBe('Muiden');
    expect(parsed.tracks[0].points).toHaveLength(2);
    expect(parsed.tracks[0].points[1].time).toBe(track.points[1].time);
  });

  it('rejects non-GPX input', () => {
    expect(() => parseGpx('<kml></kml>')).toThrow();
    expect(() => parseGpx('not xml')).toThrow();
  });

  it('skips points with invalid coordinates', () => {
    const xml = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
      <wpt lat="91" lon="5"/><wpt lat="52" lon="abc"/><wpt lat="52" lon="5"><name>ok</name></wpt></gpx>`;
    const r = parseGpx(xml);
    expect(r.waypoints).toHaveLength(1);
    expect(r.waypoints[0].name).toBe('ok');
  });
});

describe('gpx robustness', () => {
  it('omits <time> for track points without a valid time', () => {
    const bad: Track = { id: 'x', name: 'x', started: 0, points: [{ lat: 1, lon: 2, time: NaN }, { lat: 1, lon: 2, time: 8.64e15 + 1 }] };
    const xml = toGpx({ tracks: [bad] });
    expect(xml).not.toContain('<time>');
    expect((xml.match(/<trkpt/g) || []).length).toBe(2);
  });

  it('reads a missing or non-numeric elevation as null', () => {
    const xml = `<gpx version="1.1"><trk><trkseg>
      <trkpt lat="1" lon="2"><time>2026-06-01T10:00:00Z</time></trkpt>
      <trkpt lat="1" lon="2"><ele>abc</ele></trkpt>
      <trkpt lat="1" lon="2"><ele>3.5</ele></trkpt>
    </trkseg></trk></gpx>`;
    const pts = parseGpx(xml).tracks[0].points;
    expect(pts.map((p) => p.ele)).toEqual([null, null, 3.5]);
  });
});
