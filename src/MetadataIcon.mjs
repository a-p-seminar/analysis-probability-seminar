import { createElement as h } from 'react';

const shapes = {
  person: [
    ['circle', { cx: 12, cy: 7.5, r: 3.5 }],
    ['path', { d: 'M5 21v-2a7 7 0 0 1 14 0v2' }],
  ],
  calendar: [
    ['rect', { x: 3, y: 5, width: 18, height: 16, rx: 2 }],
    ['path', { d: 'M7 3v4M17 3v4M3 10h18M7 14h2M15 14h2M7 17h2' }],
  ],
  location: [
    ['path', { d: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z' }],
    ['circle', { cx: 12, cy: 10, r: 2.5 }],
  ],
  clock: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M12 7v5l3 2' }],
  ],
};

export function MetadataIcon({ type }) {
  return h('svg', {
    className: 'metadata-icon', viewBox: '0 0 24 24', width: 16, height: 16,
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
    strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true, focusable: 'false',
  }, (shapes[type] || []).map(([tag, attributes], key) => h(tag, { ...attributes, key })));
}
