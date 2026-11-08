/** Inline 16px icon set for the Arrange workspace. No icon dependency. */
const svg = (paths: string, size = 16) =>
  `<svg viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const icons = {
  grip: svg('<path d="M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01" stroke-width="2"/>', 14),
  eye: svg('<path d="M1.5 8S3.8 3.8 8 3.8 14.5 8 14.5 8 12.2 12.2 8 12.2 1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="1.9"/>'),
  eyeOff: svg('<path d="M6.3 3.9A6.9 6.9 0 0 1 8 3.8c4.2 0 6.5 4.2 6.5 4.2a12 12 0 0 1-2 2.5M4 4.9A12 12 0 0 0 1.5 8S3.8 12.2 8 12.2c.9 0 1.7-.2 2.4-.5"/><path d="M2.5 2.5 13.5 13.5"/>'),
  lock: svg('<rect x="3.4" y="7" width="9.2" height="6.2" rx="1.4"/><path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7"/>'),
  unlock: svg('<rect x="3.4" y="7" width="9.2" height="6.2" rx="1.4"/><path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.5-1.1"/>'),
  chevron: svg('<path d="M4 6.5 8 10.5 12 6.5"/>', 14),
  chevronRight: svg('<path d="M6.5 4 10.5 8 6.5 12"/>', 14),
  folder: svg('<path d="M1.8 5.2A1.4 1.4 0 0 1 3.2 3.8h2.4l1.2 1.4h5a1.4 1.4 0 0 1 1.4 1.4v5.2a1.4 1.4 0 0 1-1.4 1.4H3.2a1.4 1.4 0 0 1-1.4-1.4Z"/>'),
  trash: svg('<path d="M2.8 4.5h10.4M6.3 4.5V3.2h3.4v1.3M4.2 4.5l.6 8.1a1.2 1.2 0 0 0 1.2 1.1h4a1.2 1.2 0 0 0 1.2-1.1l.6-8.1"/><path d="M6.6 7v4M9.4 7v4"/>', 14),
  more: svg('<circle cx="3.4" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="12.6" cy="8" r="1.1" fill="currentColor" stroke="none"/>'),
  search: svg('<circle cx="7.2" cy="7.2" r="4.2"/><path d="m10.4 10.4 3 3"/>', 14),
  copy: svg('<rect x="5.4" y="5.4" width="8.2" height="8.2" rx="1.3"/><path d="M10.6 5.4V3.6a1.3 1.3 0 0 0-1.3-1.3H3.6a1.3 1.3 0 0 0-1.3 1.3v5.7a1.3 1.3 0 0 0 1.3 1.3h1.8"/>', 14),
  front: svg('<path d="M8 13V3M4.4 6.6 8 3l3.6 3.6"/>', 14),
  back: svg('<path d="M8 3v10M4.4 9.4 8 13l3.6-3.6"/>', 14),
  frame: svg('<path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3"/>', 14),
  reset: svg('<path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5M3 2.8v2.6h2.6"/>', 14),
  image: svg('<rect x="2.2" y="3.2" width="11.6" height="9.6" rx="1.3"/><circle cx="6" cy="6.6" r="1.1"/><path d="m3.4 11.4 3-3 2.2 2.2 2-2 2 2"/>', 14),
  centre: svg('<path d="M8 2v12M2 8h12"/><rect x="5.6" y="5.6" width="4.8" height="4.8" rx="1"/>', 14),
  pointer: svg('<path d="M4 2.6 12 8l-3.4.9L7 12.4Z"/>'),
  hand: svg('<path d="M5.6 7.4V4.2a1.1 1.1 0 0 1 2.2 0v2.6"/><path d="M7.8 6.6V3.6a1.1 1.1 0 0 1 2.2 0v3"/><path d="M10 6.8V4.8a1.1 1.1 0 0 1 2.2 0v4.4a4.4 4.4 0 0 1-4.4 4.4H7A4.4 4.4 0 0 1 2.6 9.2V7.6a1 1 0 0 1 2 0v1.1"/>'),
  zoomIn: svg('<circle cx="7.2" cy="7.2" r="4.2"/><path d="m10.4 10.4 3 3M7.2 5.4v3.6M5.4 7.2h3.6"/>'),
  zoomOut: svg('<circle cx="7.2" cy="7.2" r="4.2"/><path d="m10.4 10.4 3 3M5.4 7.2h3.6"/>'),
  fit: svg('<path d="M2.2 6V2.2H6M10 2.2h3.8V6M13.8 10v3.8H10M6 13.8H2.2V10"/>'),
  actual: svg('<rect x="2.4" y="4.4" width="11.2" height="7.2" rx="1.2"/><path d="M5.4 9.4c1.4 0 1.4-2.8 2.6-2.8s1.2 2.8 2.6 2.8"/>'),
  grid: svg('<rect x="2.4" y="2.4" width="11.2" height="11.2" rx="1"/><path d="M6.1 2.4v11.2M9.9 2.4v11.2M2.4 6.1h11.2M2.4 9.9h11.2"/>'),
  snap: svg('<path d="M8 2.4v4M8 9.6v4M2.4 8h4M9.6 8h4"/><circle cx="8" cy="8" r="1.6"/>'),
  link: svg('<path d="M6.4 9.6 9.6 6.4"/><path d="M7.4 4.6 8.6 3.4a2.6 2.6 0 0 1 3.7 3.7l-1.2 1.2M8.6 11.4 7.4 12.6a2.6 2.6 0 0 1-3.7-3.7l1.2-1.2"/>'),
} as const;

export type IconName = keyof typeof icons;
