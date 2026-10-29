export const SCENE = {
  id: '01-arrival',
  title: 'A world before his time',
  chapter: 'The arrival',
  width: 1363,
  height: 768,
  duration: 24,
  fps: 24,
  layers: [
    { id: 'background', name: 'Distant valley', file: 'background.png', x: 0, y: 0, depth: 0.08 },
    { id: 'jungle', name: 'Jungle canopy', file: 'jungle.png', x: 0, y: 0, depth: 0.45 },
    { id: 'vinny', name: 'Count Vinny', file: 'vinny.png', x: 68, y: 185, depth: 0.68 },
    { id: 'foreground', name: 'Foreground ferns', file: 'foreground.png', x: 0, y: 0, depth: 1 },
  ],
  captions: [
    { start: 1.1, end: 4.8, text: 'Then silence.' },
    { start: 5.3, end: 10.1, text: 'Vinny landed face-first in a fern.' },
    { start: 10.7, end: 15.7, text: 'Everything was green. Unapologetically lush green.' },
    { start: 16.3, end: 23.0, text: '“Dios mio. Did I time-travel to Jurassic Park’s deleted scenes?”' },
  ],
} as const;

export const CHAPTERS = [
  { time: 0, label: 'Silence', detail: 'A breath after the fall' },
  { time: 5.3, label: 'The arrival', detail: 'Eight centuries. One bad landing.' },
  { time: 10.7, label: 'A different world', detail: 'The jungle comes into focus' },
  { time: 16.3, label: 'Count Vinny', detail: 'Undead. Underprepared.' },
] as const;
