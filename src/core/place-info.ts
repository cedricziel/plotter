import type { PlaceInfo } from './waterway-data';

export function bridgeLabel(info: PlaceInfo | undefined): string | null {
  if (info?.canOpen === undefined) return null;
  return info.canOpen ? 'Opening bridge' : 'Fixed bridge';
}

/** An operating note as its first line and the remaining lines. */
export function noteParts(note: string): { first: string; rest: string } {
  const lines = note
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return { first: lines[0] ?? '', rest: lines.slice(1).join('\n') };
}
