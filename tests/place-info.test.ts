import { describe, expect, it } from 'vitest';
import { noteParts } from '../src/core/place-info';
import { placeLabel } from '../src/i18n/texts';

describe('placeLabel', () => {
  it('tells opening from fixed bridges when the source knows', () => {
    expect(placeLabel({ kind: 'bridge', info: { canOpen: true } })).toBe('Opening bridge');
    expect(placeLabel({ kind: 'bridge', info: { canOpen: false } })).toBe('Fixed bridge');
  });

  it('names the kind when it does not', () => {
    expect(placeLabel({ kind: 'bridge', info: { clearance: 3 } })).toBe('Bridge');
    expect(placeLabel({ kind: 'bridge' })).toBe('Bridge');
  });
});

describe('noteParts', () => {
  it('splits an operating note into its first line and the rest', () => {
    expect(noteParts('Brug wordt lokaal bediend.\nAanvraag via 06-123.\n\nHoud rekening met vertraging.')).toEqual({
      first: 'Brug wordt lokaal bediend.',
      rest: 'Aanvraag via 06-123.\nHoud rekening met vertraging.',
    });
  });

  it('has no rest for a single line and skips leading blank lines', () => {
    expect(noteParts('Op verzoek')).toEqual({ first: 'Op verzoek', rest: '' });
    expect(noteParts('\n  Dag en nacht  \n')).toEqual({
      first: 'Dag en nacht',
      rest: '',
    });
  });
});
