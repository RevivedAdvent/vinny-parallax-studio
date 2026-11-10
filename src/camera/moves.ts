import type { CameraSceneConfig, LayerTransform, Pose } from './types.ts';
import { clamp, finite } from './easing.ts';

export type CameraMoveType = 'push' | 'pull' | 'pan' | 'tilt' | 'zoom' | 'truck' | 'pedestal' | 'diagonal' | 'crane' | 'tracking' | 'reveal' | 'dutch' | 'handheld' | 'impact' | 'whip' | 'dollyZoom' | 'rackFocus' | 'orbit';
export const basicMoves: CameraMoveType[] = ['push', 'pull', 'pan', 'tilt', 'zoom'];
export const spatialMoves: CameraMoveType[] = ['truck', 'pedestal', 'diagonal', 'crane', 'tracking', 'reveal'];
export const advancedMoves: CameraMoveType[] = ['dutch', 'handheld', 'impact', 'whip', 'dollyZoom', 'rackFocus', 'orbit'];
export interface CameraMove {
  id: string;
  /** 2 is the canonical virtual camera. Missing legacy values are migrated on load. */
  model?: 2;
  /** Present only on a move converted from the old composite camera format. */
  legacyModel?: 1;
  type: CameraMoveType;
  start: number;
  duration: number;
  /** Output-space target coordinates; the scene center is the neutral camera position. */
  x: number;
  y: number;
  /** Final scale multiplier for push, pull and zoom. */
  scale: number;
  /** Dolly travel as a fraction of the neutral focal distance. */
  travel?: number;
  /** Crane look-at point, in scene pixels. */
  lookX?: number;
  lookY?: number;
  /** Tracking: the layer kept at the requested screen position (x, y). */
  layerId?: string;
  /** Reveal: the foreground layers that move; everything else stays still. */
  layerIds?: string[];
  /** Reveal: total offset in output pixels applied to each selected layer. */
  offsetX?: number;
  offsetY?: number;
  /** Advanced camera controls; angles are degrees, strength is 0..1. */
  angle?: number;
  strength?: number;
  speed?: number;
  seed?: number;
  blur?: boolean;
  focusFrom?: number;
  focusTo?: number;
  radius?: number;
  elevation?: number;
}

export const moveNames: Record<CameraMoveType, string> = {
  push: 'Push-in / dolly-in', pull: 'Pull-out / dolly-out', pan: 'Pan left / right',
  tilt: 'Tilt up / down', zoom: 'Zoom in / out', truck: 'Truck / lateral track',
  pedestal: 'Pedestal', diagonal: 'Diagonal drift', crane: 'Crane / boom',
  tracking: 'Tracking / follow', reveal: 'Reveal move',
  dutch: 'Dutch tilt / roll', handheld: 'Handheld drift', impact: 'Impact shake', whip: 'Whip pan',
  dollyZoom: 'Dolly zoom', rackFocus: 'Rack-focus framing', orbit: 'Orbit / arc',
};

export function validateMoves(scene: CameraSceneConfig) {
  if (scene.cameraMoves === undefined) return;
  if (!Array.isArray(scene.cameraMoves)) throw new Error('Camera movements must be a list');
  const ids = new Set<string>();
  for (const move of scene.cameraMoves) {
    if (!move || typeof move.id !== 'string' || !move.id || ids.has(move.id)) throw new Error('Camera movement IDs must be unique');
    ids.add(move.id);
    if (!Object.hasOwn(moveNames, move.type)) throw new Error('Invalid camera movement');
    if (move.model !== undefined && move.model !== 2) throw new Error('Unsupported camera movement model');
    for (const field of ['start', 'duration', 'x', 'y', 'scale'] as const) finite(move[field], `movement ${field}`);
    if (move.start < 0 || move.duration <= 0 || move.start + move.duration > scene.totalFrames / scene.fps + 1e-9) throw new Error('Camera movement must fit within the scene duration');
    if (move.x < 0 || move.x > scene.width || move.y < 0 || move.y > scene.height) throw new Error('Camera coordinates must be inside the scene');
    if (move.scale < .25 || move.scale > 4 || (move.type === 'push' && move.scale < 1) || (move.type === 'pull' && move.scale > 1)) throw new Error('Invalid camera movement scale');
    if (advancedMoves.includes(move.type) && move.model !== 2) throw new Error('Advanced movements require the virtual camera');
    // Compatibility boundary: the pre-virtual camera moves lacked `model`.
    // Convert their authored intent once, here, instead of keeping a second
    // affine camera alive in the runtime. Original fields are retained.
    if (move.model === undefined) migrateLegacyMove(scene, move);
    if ((move.type === 'push' || move.type === 'pull') && move.model === 2) {
      if (finite(move.travel as number, 'dolly travel') < 0 || move.travel! > .35) throw new Error('Dolly travel must be 0..35%');
    }
    if (move.model === 2 && move.type === 'crane') {
      if (finite(move.lookX as number, 'crane target X') < 0 || move.lookX! > scene.width || finite(move.lookY as number, 'crane target Y') < 0 || move.lookY! > scene.height) throw new Error('Crane target must be inside the scene');
    }
    const layerIds = new Set(scene.layers.map(layer => layer.id));
    if (advancedMoves.includes(move.type)) {
      const bounded = (value: unknown, label: string, min: number, max: number) => { const n=finite(value,label); if(n<min||n>max) throw new Error(`Invalid ${label}`); };
      if (move.type === 'dutch') bounded(move.angle,'roll angle',-30,30);
      if (move.type === 'whip') { bounded(move.angle,'whip angle',-20,20); if(typeof move.blur!=='boolean')throw new Error('Invalid whip blur'); }
      if (move.type === 'handheld' || move.type === 'impact' || move.type === 'rackFocus') bounded(move.strength,'effect strength',0,1);
      if (move.type === 'handheld') { bounded(move.speed,'drift speed',.1,5); if(!Number.isInteger(move.seed)||move.seed! < 0||move.seed! > 2147483647)throw new Error('Invalid drift seed'); }
      if (move.type === 'dollyZoom') bounded(move.travel,'dolly zoom travel',-.25,.25);
      if (move.type === 'rackFocus') { bounded(move.focusFrom,'starting focus depth',0,1); bounded(move.focusTo,'ending focus depth',0,1); }
      if (move.type === 'orbit') { bounded(move.angle,'orbit angle',-12,12); bounded(move.radius,'orbit radius',.8,1.2); bounded(move.elevation,'orbit elevation',-.05,.05); }
      if (move.layerId !== undefined && !layerIds.has(move.layerId)) throw new Error('Advanced movement target layer is missing');
    }
    if (move.type === 'tracking' && (typeof move.layerId !== 'string' || !layerIds.has(move.layerId))) throw new Error('Tracking needs an existing target layer');
    if (move.type === 'reveal') {
      if (!Array.isArray(move.layerIds) || !move.layerIds.length || new Set(move.layerIds).size !== move.layerIds.length || move.layerIds.some(id => typeof id !== 'string' || !layerIds.has(id))) throw new Error('Reveal needs one or more existing layers');
      finite(move.offsetX as number, 'reveal offset X');
      finite(move.offsetY as number, 'reveal offset Y');
    }
  }
}

/**
 * Convert one old composite-camera move into the canonical virtual-camera form.
 *
 * The old push/pull (`scale`) multiplied the whole composition. A virtual dolly
 * changes perspective instead. At the reference depth a forward push travel of
 * t produces scale 1/(1-t), and a pull travel of t produces 1/(1+t), so the old
 * scale becomes positive travel in both cases. Existing targets, tracking and
 * reveal layer lists are preserved.
 */
export function migrateLegacyMove(scene: CameraSceneConfig, move: CameraMove): CameraMove {
  move.legacyModel = 1;
  move.model = 2;
  if ((move.type === 'push' || move.type === 'pull') && move.travel === undefined) {
    const travel = move.type === 'push' ? 1 - 1 / move.scale : 1 / move.scale - 1;
    move.travel = clamp(travel, 0, .35);
  }
  if (move.type === 'crane') {
    move.lookX ??= scene.width / 2;
    move.lookY ??= scene.height / 2;
  }
  return move;
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
