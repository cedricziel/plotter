/** An operating note as its first line and the remaining lines. */
export function noteParts(note: string): { first: string; rest: string } {
  const lines = note
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return { first: lines[0] ?? '', rest: lines.slice(1).join('\n') };
}
