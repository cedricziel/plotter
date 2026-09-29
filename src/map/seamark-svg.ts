import type { BuoyShape, SymbolSpec, Topmark } from '../core/seamark-symbol';
import type { Theme } from './style';

const SIZE = 32;
const PIXEL_RATIO = 2;

interface Palette {
  colours: Record<string, string>;
  outline: string;
  flare: string;
  noticeFill: string;
  noticeInk: string;
}

/**
 * Night is red on black with equal green and blue channels, so nothing on the
 * chart leaves the red spectrum. Red and green marks then differ by fill: solid
 * against nearly black.
 */
const PALETTES: Record<Theme, Palette> = {
  day: {
    colours: {
      red: '#d6262b',
      green: '#1e9e46',
      yellow: '#f7d117',
      black: '#1a1a1a',
      white: '#ffffff',
      blue: '#1c5fd4',
      orange: '#f08c00',
      grey: '#868e96',
    },
    outline: '#222222',
    flare: '#c2188f',
    noticeFill: '#ffffff',
    noticeInk: '#1a1a1a',
  },
  night: {
    colours: {
      red: '#ff3030',
      green: '#2a0000',
      yellow: '#ff9a9a',
      black: '#000000',
      white: '#ffd6d6',
      blue: '#7a0000',
      orange: '#ff6a6a',
      grey: '#a04040',
    },
    outline: '#ff5a5a',
    flare: '#ff8080',
    noticeFill: '#000000',
    noticeInk: '#ff5a5a',
  },
};

interface Body {
  /** top and bottom of the drawing, for the colour bands */
  top: number;
  bottom: number;
  x: number;
  width: number;
  element: (attrs: string) => string;
}

const rect = (x: number, y: number, w: number, h: number, r = 0.8): Body => ({
  x,
  top: y,
  bottom: y + h,
  width: w,
  element: (attrs) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ${attrs}/>`,
});

const BODIES: Record<BuoyShape, Body> = {
  can: rect(10, 14, 12, 12),
  pillar: rect(13, 12, 6, 14),
  spar: rect(14.5, 8, 3, 20, 0.5),
  cone: {
    x: 9,
    top: 12,
    bottom: 26,
    width: 14,
    element: (attrs) => `<polygon points="16,12 23,26 9,26" ${attrs}/>`,
  },
  sphere: {
    x: 9.5,
    top: 13.5,
    bottom: 26.5,
    width: 13,
    element: (attrs) => `<circle cx="16" cy="20" r="6.5" ${attrs}/>`,
  },
  barrel: {
    x: 9,
    top: 14,
    bottom: 26,
    width: 14,
    element: (attrs) => `<ellipse cx="16" cy="20" rx="7" ry="6" ${attrs}/>`,
  },
};
const STAKE = rect(14.5, 12, 3, 16, 0.4);

const triangle = (pts: string, attrs: string) => `<polygon points="${pts}" ${attrs}/>`;
const coneUp = (base: number, h: number, attrs: string) => triangle(`12.5,${base} 19.5,${base} 16,${base - h}`, attrs);
const coneDown = (top: number, h: number, attrs: string) => triangle(`12.5,${top} 19.5,${top} 16,${top + h}`, attrs);

function topmarkSvg(mark: Topmark, base: number, fill: string, stroke: string): string {
  const a = `fill="${fill}" stroke="${stroke}" stroke-width="1" stroke-linejoin="round"`;
  switch (mark) {
    case 'cone-up':
      return coneUp(base, 6.5, a);
    case 'cone-down':
      return coneDown(base - 6.5, 6.5, a);
    case 'cones-up':
      return coneUp(base, 4.5, a) + coneUp(base - 5, 4.5, a);
    case 'cones-down':
      return coneDown(base - 9.5, 4.5, a) + coneDown(base - 4.5, 4.5, a);
    case 'cones-base':
      return coneUp(base - 4.6, 4.6, a) + coneDown(base - 4.6, 4.6, a);
    case 'cones-point':
      return coneDown(base - 9.2, 4.6, a) + coneUp(base, 4.6, a);
    case 'cylinder':
      return `<rect x="13" y="${base - 5}" width="6" height="5" ${a}/>`;
    case 'sphere':
      return `<circle cx="16" cy="${base - 3.2}" r="3.2" ${a}/>`;
    case 'spheres':
      return `<circle cx="16" cy="${base - 2.8}" r="2.8" ${a}/><circle cx="16" cy="${base - 8.6}" r="2.8" ${a}/>`;
    case 'x':
      return (
        `<line x1="12.5" y1="${base - 7}" x2="19.5" y2="${base}" stroke="${stroke}" stroke-width="3.6" stroke-linecap="round"/>` +
        `<line x1="19.5" y1="${base - 7}" x2="12.5" y2="${base}" stroke="${stroke}" stroke-width="3.6" stroke-linecap="round"/>` +
        `<line x1="12.5" y1="${base - 7}" x2="19.5" y2="${base}" stroke="${fill}" stroke-width="2" stroke-linecap="round"/>` +
        `<line x1="19.5" y1="${base - 7}" x2="12.5" y2="${base}" stroke="${fill}" stroke-width="2" stroke-linecap="round"/>`
      );
  }
}

const NEUTRAL_TOPMARKS = new Set<Topmark>(['cones-up', 'cones-down', 'cones-base', 'cones-point', 'spheres']);

const wrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE * PIXEL_RATIO}" height="${SIZE * PIXEL_RATIO}" viewBox="0 0 ${SIZE} ${SIZE}">${inner}</svg>`;

const flarePath = (fill: string) => `<path d="M8 15 L2 3 Q8 0 14 3 Z" fill="${fill}"/>`;

/** The magenta flare that marks a seamark with a light, drawn in the top right of its own image. */
export const flareSvg = (theme: Theme): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16">${flarePath(PALETTES[theme].flare)}</svg>`;

function bandsSvg(body: Body, bands: string[], p: Palette, stroke: string): string {
  const fill = (name: string) => p.colours[name] ?? p.colours.grey;
  if (bands.length === 1) return body.element(`fill="${fill(bands[0])}" ${stroke}`);
  const h = (body.bottom - body.top) / bands.length;
  const stripes = bands
    .map(
      (b, i) =>
        `<rect x="${body.x - 1}" y="${(body.top + i * h).toFixed(2)}" width="${body.width + 2}" height="${(h + 0.05).toFixed(2)}" fill="${fill(b)}"/>`,
    )
    .join('');
  return `<clipPath id="b">${body.element('')}</clipPath><g clip-path="url(#b)">${stripes}</g>${body.element(`fill="none" ${stroke}`)}`;
}

/** The SVG drawing of a seamark symbol, sized for registering as a 2x map image. */
export function symbolSvg(spec: SymbolSpec, theme: Theme): string {
  const p = PALETTES[theme];
  const stroke = `stroke="${p.outline}" stroke-width="1.3" stroke-linejoin="round"`;
  if (spec.body === 'light') {
    return wrap(
      `<path d="M16 20 L7 5 Q16 0 25 5 Z" fill="${p.flare}"/><circle cx="16" cy="21" r="3" fill="${p.flare}" ${stroke}/>`,
    );
  }
  if (spec.body === 'notice') {
    return wrap(
      `<rect x="9" y="9" width="14" height="14" rx="1.5" fill="${p.noticeFill}" ${stroke}/>` +
        `<rect x="12" y="14.2" width="8" height="3.6" fill="${p.noticeInk}"/>`,
    );
  }
  const body = spec.body === 'beacon' ? STAKE : BODIES[spec.shape ?? 'pillar'];
  const base = Math.max(body.top - 1, 10);
  let inner = '';
  if (spec.body === 'beacon')
    inner += `<path d="M10 28H22" stroke="${p.outline}" stroke-width="1.5" stroke-linecap="round"/>`;
  inner += bandsSvg(body, spec.bands, p, stroke);
  if (spec.topmark) {
    const colour = NEUTRAL_TOPMARKS.has(spec.topmark) ? 'black' : spec.bands[0];
    inner += topmarkSvg(spec.topmark, base, p.colours[colour] ?? p.colours.grey, p.outline);
  }
  return wrap(inner);
}
