export interface KnownOverflow {
  /** CSS selector the overflowing element matches. */
  selector: string;
  /** Viewport widths this applies to; all widths when left out. */
  widths?: number[];
  /** Why the overflow is accepted for now. */
  reason: string;
}

/** Overflows the layout suite accepts. Remove an entry as soon as its overflow is fixed. */
export const KNOWN_OVERFLOWS: KnownOverflow[] = [
  {
    selector: '#instruments, #instruments > .inst-pos',
    widths: [360],
    reason:
      'Instrument bar: the position readout does not fit a 360 px row and runs past the right edge. Not fixed yet.',
  },
  {
    selector: '.stats > .stat > .stat-label, .stats > .stat > .stat-value',
    reason:
      'Sheet stat tiles (route, track, anchor, settings): long labels and values such as "Verbleibend", ' +
      '"GPS-Genauigkeit", "Holding" or ETA times are wider than their tile on phones and in the side panel. Not fixed yet.',
  },
  {
    selector: '.legs > .leg',
    widths: [360, 390],
    reason:
      'Route sheet: a leg row with a long name, distance, course and ETA is wider than a phone sheet. Not fixed yet.',
  },
  {
    selector: '#dest-bar .btn',
    widths: [360, 390],
    reason: 'Destination bar: German button labels ("Hierhin", "Als Stopp") are wider than their buttons on phones.',
  },
  {
    selector: '#btn-dest',
    reason:
      'The "⚑+" glyph is about 3 px wider than its round button in the fallback font; decorative, still readable.',
  },
  {
    selector: '#crosshair',
    reason: 'By design: the crosshair lines are pseudo-elements that stick out 12 px past the ring.',
  },
];
