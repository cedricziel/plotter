import { kindLabel, seamarkRows, symbolSpec } from '../core/seamark-symbol';
import type { Seamark } from '../core/waterway-data';
import { symbolSvg } from '../map/seamark-svg';
import type { Theme } from '../map/style';
import { h } from './dom';

/** The compact card for a tapped seamark: what it is, its name, colours, topmark and light. */
export function seamarkCard(seamark: Seamark, theme: Theme, onClose: () => void): HTMLElement {
  const rows = seamarkRows(seamark);
  const symbol = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(symbolSvg(symbolSpec(seamark), theme))}`;
  return h(
    'div',
    { class: 'dest-card seamark-card' },
    h(
      'div',
      { class: 'dest-title' },
      h('span', { class: 'result-ico' }, h('img', { src: symbol, alt: '', width: 32, height: 32 })),
      h('span', { class: 'result-text' }, h('b', null, kindLabel(seamark))),
      h('button', { class: 'btn big', 'aria-label': 'Close', onclick: onClose }, '✕'),
    ),
    rows.length
      ? h('dl', { class: 'dest-info' }, ...rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]))
      : null,
  );
}
