export interface KnownOverflow {
  /** CSS selector the overflowing element matches. */
  selector: string;
  /** Viewport widths this applies to; all widths when left out. */
  widths?: number[];
  /** Why the overflow is accepted for now. */
  reason: string;
}

/** Stories the layout suite leaves out, by story id, with the reason. */
export const SKIPPED_STORIES: Record<string, string> = {
  'pages-plotter-screen--overview':
    'A contact sheet of scaled-down phone screens in a four-column grid; it is wider than any viewport by design.',
};

/** Overflows the layout suite accepts. Remove an entry as soon as its overflow is fixed. */
export const KNOWN_OVERFLOWS: KnownOverflow[] = [
  {
    selector: '.stats > .stat > .stat-label, .stats > .stat > .stat-value',
    reason:
      'Sheet stat tiles (route, track, anchor, settings): long labels and values such as "Verbleibend", ' +
      '"GPS-Genauigkeit", "Holding" or ETA times are wider than their tile. Not fixed yet.',
  },
  {
    selector: '.legs > .leg',
    widths: [390],
    reason:
      'Route sheet: at 390 px a leg row with a long name, distance, course, ETA and its buttons is wider than ' +
      'the sheet; below 380 px the buttons wrap onto a second line and it fits. Not fixed yet.',
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
