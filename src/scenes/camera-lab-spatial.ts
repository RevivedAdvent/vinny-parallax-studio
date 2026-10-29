import type { CameraSceneConfig, Track } from '../camera/types.ts';
import { LAB_FPS, LAB_FRAMES, LAB_WIDTH, LAB_HEIGHT } from './camera-lab-basic.ts';

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

const ZOOM_BOUND = { min: 1, max: 1.12 } as const;

/**
 * Camera Lab spatial tier: visible combined-axis moves, ~2-4x basic-tier amplitudes.
 * Each preset holds still frames 0-7 and 64-71. None is the hero edit.
 */
export const LAB_SPATIAL_PRESETS: CameraSceneConfig[] = [
  // Sustained lateral move: foreground travels ~48px, valley ~5px.
  scene('lab-truck-right', [
    { ...move('truck-right', 'x', 0, 48, 'ease_in_out'), holdAfter: true },
  ]),
  // Sustained vertical move: foreground ~36px against a steadier valley.
  scene('lab-pedestal-up', [
    { ...move('pedestal-up', 'y', 0, -36, 'ease_in_out'), holdAfter: true },
  ]),
  // Diagonal drift: lateral + vertical + slight dolly for parallax on two axes.
  scene('lab-diagonal-drift', [
    { ...move('drift-x', 'x', 0, 36, 'ease_in_out'), holdAfter: true },
    { ...move('drift-y', 'y', 0, -24, 'ease_in_out'), holdAfter: true },
    { ...move('drift-push', 'zoom', 1, 1.05, 'ease_in_out', { projection: 'dolly', limits: { ...ZOOM_BOUND } }), holdAfter: true },
  ]),
  // Crane: rise while easing out of the push — vertical + dolly opposed.
  scene('lab-crane-rise', [
    { ...move('crane-y', 'y', 0, -32, 'ease_out'), holdAfter: true },
    { ...move('crane-pull', 'zoom', 1.08, 1, 'ease_out', { projection: 'dolly', limits: { ...ZOOM_BOUND } }), holdAfter: true },
  ]),
  // Tracking: lateral move with a counter-push so the subject region stays framed.
  scene('lab-tracking-push', [
    { ...move('tracking-x', 'x', -24, 24, 'linear'), holdAfter: true },
    { ...move('tracking-push', 'zoom', 1, 1.1, 'ease_in_out', { projection: 'dolly', limits: { ...ZOOM_BOUND } }), holdAfter: true },
  ]),
  // Foreground reveal: near ferns sweep aside via layer-local reframing; camera holds.
  scene('lab-foreground-reveal', [
    { id: 'reveal-ferns', target: 'layer:foreground', property: 'x', startFrame: 8, endFrame: 63,
      startValue: 0, endValue: 120, easing: 'ease_in_out', intensity: 1,
      limits: { min: -160, max: 160 }, holdAfter: true },
  ]),
];
