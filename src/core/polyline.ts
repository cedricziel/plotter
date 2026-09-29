/** Encoded polyline algorithm (precision 6 by default); points are [lon, lat] like GeoJSON. */
export function encodePolyline(points: [number, number][], precision = 6): string {
  const f = 10 ** precision;
  let out = '';
  let pLat = 0;
  let pLon = 0;
  for (const [lon, lat] of points) {
    const la = Math.round(lat * f);
    const lo = Math.round(lon * f);
    out += encodeValue(la - pLat) + encodeValue(lo - pLon);
    pLat = la;
    pLon = lo;
  }
  return out;
}

function encodeValue(v: number): string {
  let n = v < 0 ? ~(v << 1) : v << 1;
  let s = '';
  while (n >= 0x20) {
    s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
    n >>= 5;
  }
  return s + String.fromCharCode(n + 63);
}

export function decodePolyline(encoded: string, precision = 6): [number, number][] {
  const f = 10 ** precision;
  const out: [number, number][] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const next = (): number => {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      if (i >= encoded.length) throw new Error('truncated polyline');
      b = encoded.charCodeAt(i++) - 63;
      if (b < 0 || b > 63) throw new Error('invalid polyline character');
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < encoded.length) {
    lat += next();
    lon += next();
    out.push([lon / f, lat / f]);
  }
  return out;
}
