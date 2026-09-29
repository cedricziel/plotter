export interface OplNode {
  type: 'n';
  id: number;
  tags: Record<string, string>;
  /** 1e-6 degrees */
  lat: number;
  lon: number;
}

export interface OplWay {
  type: 'w';
  id: number;
  tags: Record<string, string>;
  /** nodes with a known location, in order */
  nodes: { id: number; lat: number; lon: number }[];
}

export function decodeOplValue(s: string): string {
  return s.includes('%') ? s.replace(/%([0-9a-fA-F]+)%/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16))) : s;
}

const E6 = 1e6;

function parseTags(field: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const kv of field.slice(1).split(',')) {
    const eq = kv.indexOf('=');
    if (eq > 0) tags[decodeOplValue(kv.slice(0, eq))] = decodeOplValue(kv.slice(eq + 1));
  }
  return tags;
}

/**
 * Parses one line of `osmium add-locations-to-ways -f opl` output. Returns
 * null for relations, untagged nodes and anything that is not needed.
 */
export function parseOplLine(line: string): OplNode | OplWay | null {
  const kind = line.charCodeAt(0);
  if (kind !== 119 /* w */ && kind !== 110 /* n */) return null;
  const fields = line.split(' ');
  const id = Number(fields[0].slice(1));
  let tags: Record<string, string> | null = null;
  let nodeField = '';
  let x: string | undefined;
  let y: string | undefined;
  for (let i = 1; i < fields.length; i++) {
    const f = fields[i];
    switch (f.charCodeAt(0)) {
      case 84: // T
        if (f.length > 1) tags = parseTags(f);
        break;
      case 78: // N
        nodeField = f;
        break;
      case 120: // x
        x = f.slice(1);
        break;
      case 121: // y
        y = f.slice(1);
        break;
    }
  }
  if (!tags) return null;
  if (kind === 110) {
    if (!x || !y) return null;
    return { type: 'n', id, tags, lat: Math.round(parseFloat(y) * E6), lon: Math.round(parseFloat(x) * E6) };
  }
  const nodes: OplWay['nodes'] = [];
  if (nodeField.length > 1) {
    for (const ref of nodeField.slice(1).split(',')) {
      const xi = ref.indexOf('x');
      const yi = ref.indexOf('y');
      if (xi < 0 || yi < 0) continue;
      const lon = ref.slice(xi + 1, yi);
      const lat = ref.slice(yi + 1);
      if (!lon || !lat) continue;
      nodes.push({ id: Number(ref.slice(1, xi)), lat: Math.round(parseFloat(lat) * E6), lon: Math.round(parseFloat(lon) * E6) });
    }
  }
  return { type: 'w', id, tags, nodes };
}
