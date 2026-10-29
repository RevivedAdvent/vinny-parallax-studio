import type { CameraSceneConfig, Track } from '../camera/types.ts';

export const LAB_FPS = 24;
export const LAB_FRAMES = 72;
export const LAB_WIDTH = 1920;
export const LAB_HEIGHT = 1080;

const layers = [
  { id: 'background', name: 'Distant valley', asset: '/assets/scene-01-normalized/background.png', depth: 0.1 },
  { id: 'jungle', name: 'Jungle canopy', asset: '/assets/scene-01-normalized/jungle.png', depth: 0.4 },
  { id: 'vinny', name: 'Count Vinny', asset: '/assets/scene-01-normalized/vinny.png', depth: 0.6 },
  { id: 'foreground', name: 'Foreground ferns', asset: '/assets/scene-01-normalized/foreground.png', depth: 1 },
] as const;

const camera = {
  baseZoom: 1.15,
  anchor: { x: 960, y: 540 },
  limits: {
    x: { min: -80, max: 80 },
    y: { min: -45, max: 45 },
    zoom: { min: 0.9, max: 1.18 },
    roll: { min: -3, max: 3 },
  },
} as const;

function scene(id: string, tracks: Track[]): CameraSceneConfig {
  return {
    version: 1, id, width: LAB_WIDTH, height: LAB_HEIGHT, fps: LAB_FPS, totalFrames: LAB_FRAMES,
    layers: layers.map(l => ({ ...l })), camera: structuredClone(camera), tracks,
  };
}

const move = (
  id: string, property: Track['property'], startValue: number, endValue: number,
  easing: Track['easing'], extra: Partial<Track> = {},
): Track => ({
  id, target: 'camera', property, startFrame: 8, endFrame: 63,
  startValue, endValue, easing, intensity: 1,
  limits: property === 'x' ? { min: -80, max: 80 }
    : property === 'y' ? { min: -45, max: 45 }
    : property === 'zoom' ? { min: 0.9, max: 1.18 }
    : { min: -3, max: 3 },
  ...extra,
});

/**
 * Camera Lab basic tier: one isolated move per preset.
 * Static holds frames 0-7 and 64-71 prove endpoints; none of these is the hero edit.
 */
export const LAB_BASIC_PRESETS: CameraSceneConfig[] = [
  scene('lab-static-hold', [
    { ...move('static-hold', 'x', 0, 0, 'hold'), holdAfter: true },
  ]),
  scene('lab-push-in', [
    { ...move('push-in', 'zoom', 1, 1.06, 'ease_in_out', { projection: 'dolly', limits: { min: 1, max: 1.08 } }) },
  ]),
  scene('lab-pull-out', [
    { ...move('pull-out', 'zoom', 1.06, 1, 'ease_in_out', { projection: 'dolly', limits: { min: 1, max: 1.08 } }) },
  ]),
  scene('lab-pan-right', [move('pan-right', 'x', 0, 16, 'ease_in_out', { limits: { min: -24, max: 24 } })]),
  scene('lab-pan-left', [move('pan-left', 'x', 0, -16, 'ease_in_out', { limits: { min: -24, max: 24 } })]),
  scene('lab-tilt-up', [move('tilt-up', 'y', 0, -12, 'ease_in_out', { limits: { min: -20, max: 20 } })]),
  scene('lab-tilt-down', [move('tilt-down', 'y', 0, 12, 'ease_in_out', { limits: { min: -20, max: 20 } })]),
  scene('lab-optical-zoom', [
    { ...move('optical-zoom', 'zoom', 1, 1.06, 'ease_in_out', { projection: 'uniform', limits: { min: 1, max: 1.08 } }) },
  ]),
  scene('lab-roll-right', [move('roll-right', 'roll', 0, 2, 'ease_in_out', { limits: { min: -2.5, max: 2.5 } })]),
];
