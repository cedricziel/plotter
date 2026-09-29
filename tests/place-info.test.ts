import { describe, expect, it } from 'vitest';
import { bridgeLabel, noteParts } from '../src/core/place-info';

describe('bridgeLabel', () => {
  it('tells opening from fixed bridges when the source knows', () => {
    expect(bridgeLabel({ canOpen: true })).toBe('Opening bridge');
    expect(bridgeLabel({ canOpen: false })).toBe('Fixed bridge');
  });

  it('says nothing when it does not', () => {
    expect(bridgeLabel({ clearance: 3 })).toBeNull();
    expect(bridgeLabel(undefined)).toBeNull();
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
