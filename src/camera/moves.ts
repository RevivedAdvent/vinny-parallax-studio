import type { CameraSceneConfig } from './types.ts';
import { clamp, finite } from './easing.ts';

export type CameraMoveType = 'push' | 'pull' | 'pan' | 'tilt' | 'zoom';
export interface CameraMove {
  id: string;
  type: CameraMoveType;
  start: number;
  duration: number;
  /** Output-space target coordinates; the scene center is the neutral camera position. */
  x: number;
  y: number;
  /** Final scale multiplier for push, pull and zoom. */
  scale: number;
}

export const moveNames: Record<CameraMoveType, string> = {
  push: 'Push-in / dolly-in', pull: 'Pull-out / dolly-out', pan: 'Pan left / right',
  tilt: 'Tilt up / down', zoom: 'Zoom in / out',
};

export function validateMoves(scene: CameraSceneConfig) {
  if (scene.cameraMoves === undefined) return;
  if (!Array.isArray(scene.cameraMoves)) throw new Error('Camera movements must be a list');
  const ids = new Set<string>();
  for (const move of scene.cameraMoves) {
    if (!move || typeof move.id !== 'string' || !move.id || ids.has(move.id)) throw new Error('Camera movement IDs must be unique');
    ids.add(move.id);
    if (!Object.hasOwn(moveNames, move.type)) throw new Error('Invalid camera movement');
    for (const field of ['start', 'duration', 'x', 'y', 'scale'] as const) finite(move[field], `movement ${field}`);
    if (move.start < 0 || move.duration <= 0 || move.start + move.duration > scene.totalFrames / scene.fps + 1e-9) throw new Error('Camera movement must fit within the scene duration');
    if (move.x < 0 || move.x > scene.width || move.y < 0 || move.y > scene.height) throw new Error('Camera coordinates must be inside the scene');
    if (move.scale < .25 || move.scale > 4 || (move.type === 'push' && move.scale < 1) || (move.type === 'pull' && move.scale > 1)) throw new Error('Invalid camera movement scale');
  }
}

/** New moves transform the composed image, independently of layer depth. */
export function evaluateMoves(scene: CameraSceneConfig, seconds: number, intensity: number) {
  let x = 0, y = 0, scale = 1;
  for (const move of [...(scene.cameraMoves ?? [])].sort((a,b) => a.start - b.start)) {
    const progress = clamp((seconds - move.start) / move.duration, 0, 1) * intensity;
    const factor = 1 + (move.scale - 1) * progress;
    if (move.type === 'pan' || move.type === 'push') x += (move.x - scene.width / 2 - x) * progress;
    if (move.type === 'tilt' || move.type === 'push') y += (move.y - scene.height / 2 - y) * progress;
    if (move.type === 'push' || move.type === 'pull' || move.type === 'zoom') scale *= factor;
  }
  return { x, y, scale: clamp(scale, .25, 4) };
}
