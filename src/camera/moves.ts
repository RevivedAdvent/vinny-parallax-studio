import type { CameraSceneConfig, LayerTransform, Pose } from './types.ts';
import { clamp, finite } from './easing.ts';

export type CameraMoveType = 'push' | 'pull' | 'pan' | 'tilt' | 'zoom' | 'truck' | 'pedestal' | 'diagonal' | 'crane' | 'tracking' | 'reveal';
export const basicMoves: CameraMoveType[] = ['push', 'pull', 'pan', 'tilt', 'zoom'];
export const spatialMoves: CameraMoveType[] = ['truck', 'pedestal', 'diagonal', 'crane', 'tracking', 'reveal'];
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
  /** Tracking: the layer kept at the requested screen position (x, y). */
  layerId?: string;
  /** Reveal: the foreground layers that move; everything else stays still. */
  layerIds?: string[];
  /** Reveal: total offset in output pixels applied to each selected layer. */
  offsetX?: number;
  offsetY?: number;
}

export const moveNames: Record<CameraMoveType, string> = {
  push: 'Push-in / dolly-in', pull: 'Pull-out / dolly-out', pan: 'Pan left / right',
  tilt: 'Tilt up / down', zoom: 'Zoom in / out', truck: 'Truck / lateral track',
  pedestal: 'Pedestal', diagonal: 'Diagonal drift', crane: 'Crane / boom',
  tracking: 'Tracking / follow', reveal: 'Reveal move',
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
    const layerIds = new Set(scene.layers.map(layer => layer.id));
    if (move.type === 'tracking' && (typeof move.layerId !== 'string' || !layerIds.has(move.layerId))) throw new Error('Tracking needs an existing target layer');
    if (move.type === 'reveal') {
      if (!Array.isArray(move.layerIds) || !move.layerIds.length || new Set(move.layerIds).size !== move.layerIds.length || move.layerIds.some(id => typeof id !== 'string' || !layerIds.has(id))) throw new Error('Reveal needs one or more existing layers');
      finite(move.offsetX as number, 'reveal offset X');
      finite(move.offsetY as number, 'reveal offset Y');
    }
  }
}

/** Reveal offsets move only the selected layers; they are added after authored layer transforms. */
export function applyReveals(scene: CameraSceneConfig, layers: Record<string, Pose>, seconds: number, intensity: number) {
  for (const move of scene.cameraMoves ?? []) {
    if (move.type !== 'reveal') continue;
    const progress = clamp((seconds - move.start) / move.duration, 0, 1) * intensity;
    for (const id of move.layerIds!) {
      layers[id].x += move.offsetX! * progress;
      layers[id].y += move.offsetY! * progress;
    }
  }
}

/**
 * Composite camera. Pan/truck shift x, tilt/pedestal/crane shift y, diagonal shifts both,
 * push/pull/zoom change scale. Tracking solves x/y so the target lands on its requested
 * screen point, using `targets` measured before the composite camera is applied.
 */
export function evaluateMoves(scene: CameraSceneConfig, seconds: number, intensity: number, targets: LayerTransform[] = []) {
  let x = 0, y = 0, scale = 1;
  for (const move of [...(scene.cameraMoves ?? [])].sort((a, b) => a.start - b.start)) {
    const progress = clamp((seconds - move.start) / move.duration, 0, 1) * intensity;
    const factor = 1 + (move.scale - 1) * progress;
    if (move.type === 'pan' || move.type === 'push' || move.type === 'truck' || move.type === 'diagonal') x += (move.x - scene.width / 2 - x) * progress;
    if (move.type === 'tilt' || move.type === 'push' || move.type === 'pedestal' || move.type === 'diagonal' || move.type === 'crane') y += (move.y - scene.height / 2 - y) * progress;
    if (move.type === 'tracking') {
      const target = targets.find(layer => layer.id === move.layerId);
      if (target) {
        const solvedX = (target.x - scene.width / 2) - (move.x - scene.width / 2) / scale;
        const solvedY = (target.y - scene.height / 2) - (move.y - scene.height / 2) / scale;
        x += (solvedX - x) * progress;
        y += (solvedY - y) * progress;
      }
    }
    if (move.type === 'push' || move.type === 'pull' || move.type === 'zoom') scale *= factor;
  }
  return { x, y, scale: clamp(scale, .25, 4) };
}
