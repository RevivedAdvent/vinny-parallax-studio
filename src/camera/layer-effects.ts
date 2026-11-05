import { clamp, drift, seededValue } from './easing.ts';
import type { CameraSceneConfig } from './types.ts';
import type { Point2 } from './virtual-projection.ts';

/**
 * Layer-level effects are evaluated from an absolute timestamp. Nothing is
 * accumulated between frames, so seeking in either direction is deterministic.
 * Camera behaviour is untouched: effects write local layer deltas only.
 */
export type LayerEffectKind = 'drift' | 'transform' | 'framing' | 'fade' | 'reveal' | 'wind' | 'float' | 'ambient' | 'shadow' | 'warp';
export type DriftAxis = 'x' | 'y' | 'xy';
export type DriftMotion = 'sway' | 'noise';
export type FrameDirection = 'left' | 'right' | 'top' | 'bottom';
export type MaskKind = 'wipe' | 'radial';
export type WindDirection = 'left' | 'right';
export type AmbientMode = 'layer' | 'particles';
export type AmbientMotion = 'drift' | 'oscillate' | 'pulse';
export type AmbientDirection = 'left' | 'right' | 'up' | 'down';
export interface Corner { x: number; y: number }

export interface LayerEffectBase {
  id: string;
  kind: LayerEffectKind;
  /** Seconds from the start of the scene. */
  start: number;
  duration: number;
  /** Every effect targets explicit layers; no name or asset matching. */
  layerIds: string[];
}
export interface DriftEffect extends LayerEffectBase {
  kind: 'drift';
  axis: DriftAxis;
  motion: DriftMotion;
  /** Peak movement in scene pixels. */
  amplitude: number;
  /** Oscillations per second, or noise rate. */
  speed: number;
  /** Degrees, used by the sine motion. */
  phase: number;
  seed: number;
}
export interface TransformEffect extends LayerEffectBase {
  kind: 'transform';
  startScale: number;
  endScale: number;
  startRotation: number;
  endRotation: number;
}
export interface FramingEffect extends LayerEffectBase {
  kind: 'framing';
  direction: FrameDirection;
  /** Offset as a percentage of the frame extent; 100 puts the layer just outside. */
  startOffset: number;
  endOffset: number;
  /** Complete enter-and-exit cycles inside the duration. */
  repeat: number;
}
export interface FadeEffect extends LayerEffectBase {
  kind: 'fade';
  startOpacity: number;
  endOpacity: number;
}
export interface RevealEffect extends LayerEffectBase {
  kind: 'reveal';
  mask: MaskKind;
  direction: FrameDirection;
  /** Radial origin as a fraction of the frame. */
  originX: number;
  originY: number;
  /** Fraction of the artwork revealed at the start and end. */
  startCoverage: number;
  endCoverage: number;
  /** 0 is a hard edge; 1 is a soft feathered edge. */
  softness: number;
}
/** Pivot-based rotation with secondary movement, for foliage and hair. */
export interface WindEffect extends LayerEffectBase {
  kind: 'wind';
  direction: WindDirection;
  /** Pivot as a fraction of the layer's own bounds; default bottom centre. */
  pivotX: number;
  pivotY: number;
  /** Peak rotation in degrees. */
  rotation: number;
  /** Peak secondary travel in scene pixels. */
  movement: number;
  /** Oscillations per second. */
  speed: number;
  /** 0 is a clean sine; 1 adds a second and third harmonic gust. */
  gust: number;
  phase: number;
  /** Extra phase per selected layer, so foliage does not sway in unison. */
  spread: number;
}
/** Predominantly positional bobbing; rotation is a small optional garnish. */
export interface FloatEffect extends LayerEffectBase {
  kind: 'float';
  axis: DriftAxis;
  amplitude: number;
  speed: number;
  phase: number;
  rotation: number;
}
/** Lightweight environmental looping: one layer, or instances of a particle texture. */
export interface AmbientEffect extends LayerEffectBase {
  kind: 'ambient';
  mode: AmbientMode;
  motion: AmbientMotion;
  direction: AmbientDirection;
  /** Layer mode: travel in pixels (drift/oscillate) or pulse depth in percent. */
  amplitude: number;
  /** Layer mode: drift speed in pixels/second. */
  speed: number;
  /** Layer mode: oscillation or pulse period in seconds. */
  loop: number;
  /** Only meaningful for horizontal or vertical drift of explicitly tileable art. */
  tileable: boolean;
  phase: number;
  /* Particle mode. */
  count: number;
  speedMin: number;
  speedMax: number;
  sizeMin: number;
  sizeMax: number;
  opacityMin: number;
  opacityMax: number;
  lifetime: number;
  regionX: number;
  regionY: number;
  regionWidth: number;
  regionHeight: number;
  seed: number;
}
/** An attached silhouette rendered beneath its source layer. */
export interface ShadowEffect extends LayerEffectBase {
  kind: 'shadow';
  /** Shadow direction in degrees; 0 points right, 90 points down. */
  angle: number;
  distance: number;
  opacity: number;
  blur: number;
  color: string;
  /** Periodic light drift. */
  speed: number;
  amplitude: number;
  phase: number;
}
/** Animated quadrilateral deformation of one flat layer. */
export interface WarpEffect extends LayerEffectBase {
  kind: 'warp';
  /** Four corners in normalized layer space, clockwise from top-left. */
  corners: [Corner, Corner, Corner, Corner];
}
export type LayerEffect = DriftEffect | TransformEffect | FramingEffect | FadeEffect | RevealEffect
  | WindEffect | FloatEffect | AmbientEffect | ShadowEffect | WarpEffect;

export interface ParallaxSettings {
  /** Global multiplier for the depth response. 1 is neutral. */
  strength: number;
  /** Per-layer multipliers. Missing or 1 is neutral. */
  influence: Record<string, number>;
}

/** Depth-based size adjustment. Distinct from the virtual camera's perspective. */
export interface DepthScaleSettings {
  /** Multiplier at depth 1 (foreground). */
  near: number;
  /** Multiplier at depth 0 (background). */
  far: number;
  /** Depth whose multiplier is exactly 1. */
  reference: number;
  /** Scales the near/far deviation from 1. */
  strength: number;
  /** Per-layer multipliers for the adjustment; missing or 1 is neutral. */
  influence: Record<string, number>;
}

/** Optional intermediate depth planes. Layers keep their stored depth when unassigned. */
export interface DepthPlane {
  id: string;
  name: string;
  depth: number;
  layerIds: string[];
}

export interface LayerMask {
  kind: MaskKind;
  coverage: number;
  softness: number;
  direction: FrameDirection;
  originX: number;
  originY: number;
}

export interface LayerShadow {
  /** Offset in scene pixels, applied to the source pose before projection. */
  x: number;
  y: number;
  opacity: number;
  blur: number;
  color: string;
}

/** Normalized local corners, clockwise from top-left. */
export type WarpCorners = [Corner, Corner, Corner, Corner];

export interface ParticleInstance {
  /** Offset from the layer centre, in scene pixels. */
  x: number;
  y: number;
  size: number;
  opacity: number;
  rotation: number;
}

/** Continuous tile travel for a tileable ambient layer; the renderer wraps it. */
export interface LayerWrap { x: number; y: number }

export interface LayerEffectDelta {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  mask?: LayerMask;
  shadow?: LayerShadow;
  warp?: { corners: WarpCorners };
  particles?: ParticleInstance[];
  wrap?: LayerWrap;
}

export const neutralDelta = (): LayerEffectDelta => ({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 });

const directions: FrameDirection[] = ['left', 'right', 'top', 'bottom'];
const neutralCorners: WarpCorners = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }];
export const neutralWarpCorners = (): WarpCorners => neutralCorners.map(corner => ({ ...corner })) as WarpCorners;
const ambientDirections: AmbientDirection[] = ['left', 'right', 'up', 'down'];
const number = (value: unknown, label: string) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return value;
};
const range = (value: unknown, min: number, max: number, label: string) => clamp(number(value, label), min, max);
const seconds = (scene: CameraSceneConfig) => scene.totalFrames / scene.fps;
const cleanIds = (ids: unknown, layerIds: Set<string>) =>
  Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => typeof id === 'string' && layerIds.has(id)))] : [];

function validateCorners(value: unknown): WarpCorners {
  if (!Array.isArray(value) || value.length !== 4) throw new Error('Warp needs four corners');
  const corners = value.map((corner, index) => {
    if (!corner || typeof corner !== 'object') throw new Error(`Warp corner ${index} is invalid`);
    const point = corner as Corner;
    const x = number(point.x, `warp.corner${index}.x`), y = number(point.y, `warp.corner${index}.y`);
    if (Math.abs(x) > 2 || Math.abs(y) > 2) throw new Error('Warp corner is outside the safe range');
    return { x, y };
  }) as WarpCorners;
  let area = 0, sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4], c = corners[(i + 2) % 4];
    area += a.x * b.y - b.x * a.y;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-4) throw new Error('Warp corners must not be collinear');
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) throw new Error('Warp corners must form a simple convex quad');
  }
  area = Math.abs(area) / 2;
  if (sign < 0) throw new Error('Warp corners must keep the neutral winding');
  if (area < .05 || area > 16) throw new Error('Warp deformation is too extreme');
  return corners;
}

/** Validate once at the project boundary. Unknown layer references are dropped so
 * deleted layers cannot break loading; effects left with no layers are removed. */
export function validateLayerEffects(scene: CameraSceneConfig): void {
  const layerIds = new Set(scene.layers.map(layer => layer.id));
  const duration = seconds(scene);
  if (scene.parallax !== undefined) {
    try {
      if (!scene.parallax || typeof scene.parallax !== 'object') throw new Error('Invalid parallax settings');
      scene.parallax.strength = range(scene.parallax.strength ?? 1, 0, 3, 'parallax.strength');
      const influence: Record<string, number> = {};
      for (const [id, value] of Object.entries(scene.parallax.influence ?? {})) {
        if (layerIds.has(id)) influence[id] = range(value, 0, 3, `parallax.influence.${id}`);
      }
      scene.parallax.influence = influence;
    } catch { scene.parallax = undefined; }
  }
  if (scene.depthScale !== undefined) {
    try {
      if (!scene.depthScale || typeof scene.depthScale !== 'object') throw new Error('Invalid depth scale settings');
      scene.depthScale.near = range(scene.depthScale.near ?? 1, .25, 3, 'depthScale.near');
      scene.depthScale.far = range(scene.depthScale.far ?? 1, .25, 3, 'depthScale.far');
      scene.depthScale.reference = range(scene.depthScale.reference ?? .5, .05, .95, 'depthScale.reference');
      scene.depthScale.strength = range(scene.depthScale.strength ?? 1, 0, 2, 'depthScale.strength');
      const influence: Record<string, number> = {};
      for (const [id, value] of Object.entries(scene.depthScale.influence ?? {})) {
        if (layerIds.has(id)) influence[id] = range(value, 0, 2, `depthScale.influence.${id}`);
      }
      scene.depthScale.influence = influence;
    } catch { scene.depthScale = undefined; }
  }
  if (scene.depthPlanes !== undefined) {
    if (!Array.isArray(scene.depthPlanes)) throw new Error('depthPlanes must be an array');
    const planes: DepthPlane[] = [], planeIds = new Set<string>(), assigned = new Set<string>();
    for (const [index, plane] of scene.depthPlanes.entries()) {
      try {
        if (!plane || typeof plane !== 'object' || typeof plane.id !== 'string' || !plane.id || planeIds.has(plane.id)) throw new Error('Invalid depth plane');
        planeIds.add(plane.id);
        const name = typeof plane.name === 'string' && plane.name.trim() ? plane.name.trim().slice(0, 60) : `Plane ${index + 1}`;
        const depth = range(plane.depth, 0, 1, `plane.${plane.id}.depth`);
        const planeLayers = cleanIds(plane.layerIds, layerIds).filter(id => !assigned.has(id));
        planeLayers.forEach(id => assigned.add(id));
        planes.push({ id: plane.id, name, depth, layerIds: planeLayers });
      } catch {
        // A malformed plane is dropped; layers revert to their stored depth.
      }
    }
    scene.depthPlanes = planes;
  }
  if (scene.layerEffects === undefined) return;
  if (!Array.isArray(scene.layerEffects)) throw new Error('layerEffects must be an array');
  const kept: LayerEffect[] = [];
  for (const effect of scene.layerEffects) {
    try {
    if (!effect || typeof effect !== 'object' || typeof effect.id !== 'string' || !effect.id) throw new Error('Invalid layer effect');
    if (kept.some(keptEffect => keptEffect.id === effect.id)) throw new Error('Layer effect IDs must be unique');
    const layerIdsForEffect = cleanIds(effect.layerIds, layerIds);
    if (!layerIdsForEffect.length) continue;
    const start = range(effect.start, 0, duration, `${effect.id}.start`);
    const length = range(effect.duration, 1e-3, Math.max(1e-3, duration - start), `${effect.id}.duration`);
    const base = { ...effect, layerIds: layerIdsForEffect, start, duration: length };
    switch (effect.kind) {
      case 'drift': {
        if (effect.axis !== 'x' && effect.axis !== 'y' && effect.axis !== 'xy') throw new Error('Invalid drift axis');
        if (effect.motion !== 'sway' && effect.motion !== 'noise') throw new Error('Invalid drift motion');
        kept.push({ ...base, kind: 'drift', axis: effect.axis, motion: effect.motion,
          amplitude: range(effect.amplitude, 0, 400, 'drift.amplitude'),
          speed: range(effect.speed, .02, 4, 'drift.speed'),
          phase: range(effect.phase, -360, 360, 'drift.phase'),
          seed: Number.isInteger(effect.seed) && effect.seed >= 0 && effect.seed <= 2147483647 ? effect.seed : 7 });
        break;
      }
      case 'transform':
        kept.push({ ...base, kind: 'transform', startScale: range(effect.startScale, .1, 4, 'transform.startScale'),
          endScale: range(effect.endScale, .1, 4, 'transform.endScale'),
          startRotation: range(effect.startRotation, -180, 180, 'transform.startRotation'),
          endRotation: range(effect.endRotation, -180, 180, 'transform.endRotation') });
        break;
      case 'framing': {
        if (!directions.includes(effect.direction)) throw new Error('Invalid framing direction');
        kept.push({ ...base, kind: 'framing', direction: effect.direction,
          startOffset: range(effect.startOffset, -200, 200, 'framing.startOffset'),
          endOffset: range(effect.endOffset, -200, 200, 'framing.endOffset'),
          repeat: Math.round(range(effect.repeat ?? 1, 1, 8, 'framing.repeat')) });
        break;
      }
      case 'fade':
        kept.push({ ...base, kind: 'fade', startOpacity: range(effect.startOpacity, 0, 1, 'fade.startOpacity'),
          endOpacity: range(effect.endOpacity, 0, 1, 'fade.endOpacity') });
        break;
      case 'reveal': {
        if (effect.mask !== 'wipe' && effect.mask !== 'radial') throw new Error('Invalid mask kind');
        const revealDirection = effect.direction ?? 'left';
        if (!directions.includes(revealDirection)) throw new Error('Invalid reveal direction');
        kept.push({ ...base, kind: 'reveal', mask: effect.mask, direction: revealDirection,
          originX: range(effect.originX ?? .5, 0, 1, 'reveal.originX'), originY: range(effect.originY ?? .5, 0, 1, 'reveal.originY'),
          startCoverage: range(effect.startCoverage, 0, 1, 'reveal.startCoverage'),
          endCoverage: range(effect.endCoverage, 0, 1, 'reveal.endCoverage'),
          softness: range(effect.softness ?? 0, 0, 1, 'reveal.softness') });
        break;
      }
      case 'wind': {
        const windDirection = effect.direction ?? 'right';
        if (windDirection !== 'left' && windDirection !== 'right') throw new Error('Invalid wind direction');
        kept.push({ ...base, kind: 'wind', direction: windDirection,
          pivotX: range(effect.pivotX ?? .5, 0, 1, 'wind.pivotX'), pivotY: range(effect.pivotY ?? 1, 0, 1, 'wind.pivotY'),
          rotation: range(effect.rotation, 0, 30, 'wind.rotation'),
          movement: range(effect.movement ?? 0, 0, 120, 'wind.movement'),
          speed: range(effect.speed ?? .3, .02, 3, 'wind.speed'),
          gust: range(effect.gust ?? .3, 0, 1, 'wind.gust'),
          phase: range(effect.phase ?? 0, -360, 360, 'wind.phase'),
          spread: range(effect.spread ?? 35, 0, 180, 'wind.spread') });
        break;
      }
      case 'float': {
        const floatAxis = effect.axis ?? 'y';
        if (floatAxis !== 'x' && floatAxis !== 'y' && floatAxis !== 'xy') throw new Error('Invalid float axis');
        kept.push({ ...base, kind: 'float', axis: floatAxis,
          amplitude: range(effect.amplitude ?? 14, 0, 200, 'float.amplitude'),
          speed: range(effect.speed ?? .35, .02, 3, 'float.speed'),
          phase: range(effect.phase ?? 0, -360, 360, 'float.phase'),
          rotation: range(effect.rotation ?? 0, -6, 6, 'float.rotation') });
        break;
      }
      case 'ambient': {
        if (effect.mode !== 'layer' && effect.mode !== 'particles') throw new Error('Invalid ambient mode');
        const ambientMotion = effect.motion ?? 'drift';
        const ambientDirection = effect.direction ?? 'right';
        if (!['drift', 'oscillate', 'pulse'].includes(ambientMotion)) throw new Error('Invalid ambient motion');
        if (!ambientDirections.includes(ambientDirection)) throw new Error('Invalid ambient direction');
        if (effect.mode === 'layer') base.layerIds = [layerIdsForEffect[0]];
        kept.push({ ...base, kind: 'ambient', mode: effect.mode, motion: ambientMotion, direction: ambientDirection,
          amplitude: range(effect.amplitude ?? 40, 0, 400, 'ambient.amplitude'),
          speed: range(effect.speed ?? 12, 0, 200, 'ambient.speed'),
          loop: range(effect.loop ?? 8, .25, 120, 'ambient.loop'),
          tileable: effect.tileable === true,
          phase: range(effect.phase ?? 0, -360, 360, 'ambient.phase'),
          count: Math.round(range(effect.count ?? 24, 1, 80, 'ambient.count')),
          speedMin: range(effect.speedMin ?? 8, 0, 200, 'ambient.speedMin'),
          speedMax: range(effect.speedMax ?? 28, 0, 200, 'ambient.speedMax'),
          sizeMin: range(effect.sizeMin ?? 6, 1, 240, 'ambient.sizeMin'),
          sizeMax: range(effect.sizeMax ?? 18, 1, 240, 'ambient.sizeMax'),
          opacityMin: range(effect.opacityMin ?? .15, 0, 1, 'ambient.opacityMin'),
          opacityMax: range(effect.opacityMax ?? .65, 0, 1, 'ambient.opacityMax'),
          lifetime: range(effect.lifetime ?? 6, .5, 120, 'ambient.lifetime'),
          regionX: range(effect.regionX ?? 0, 0, 1, 'ambient.regionX'),
          regionY: range(effect.regionY ?? 0, 0, 1, 'ambient.regionY'),
          regionWidth: range(effect.regionWidth ?? 1, .02, 1, 'ambient.regionWidth'),
          regionHeight: range(effect.regionHeight ?? 1, .02, 1, 'ambient.regionHeight'),
          seed: Number.isInteger(effect.seed) && effect.seed >= 0 && effect.seed <= 2147483647 ? effect.seed : 11 });
        break;
      }
      case 'shadow': {
        const color = typeof effect.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(effect.color) ? effect.color.toLowerCase() : '#000000';
        kept.push({ ...base, kind: 'shadow',
          angle: range(effect.angle ?? 90, -180, 180, 'shadow.angle'),
          distance: range(effect.distance ?? 18, 0, 200, 'shadow.distance'),
          opacity: range(effect.opacity ?? .35, 0, 1, 'shadow.opacity'),
          blur: range(effect.blur ?? 8, 0, 60, 'shadow.blur'), color,
          speed: range(effect.speed ?? .15, .01, 2, 'shadow.speed'),
          amplitude: range(effect.amplitude ?? 4, 0, 80, 'shadow.amplitude'),
          phase: range(effect.phase ?? 0, -360, 360, 'shadow.phase') });
        break;
      }
      case 'warp': {
        kept.push({ ...base, kind: 'warp', corners: validateCorners(effect.corners) });
        break;
      }
      default: throw new Error('Invalid layer effect kind');
    }
    } catch {
      // A malformed effect is dropped so the rest of the project still loads.
    }
  }
  scene.layerEffects = kept;
}

/** Depth response multiplier for one layer. 1 is neutral and exact. */
export function parallaxFactor(scene: CameraSceneConfig, layerId: string): number {
  const strength = scene.parallax?.strength ?? 1;
  const influence = scene.parallax?.influence?.[layerId] ?? 1;
  return clamp(strength * influence, 0, 3);
}

/** Stored depth, unless the layer is assigned to an intermediate depth plane. */
export function resolvedDepth(scene: CameraSceneConfig, layerId: string): number {
  const layer = scene.layers.find(candidate => candidate.id === layerId);
  if (!layer) return 0;
  const plane = scene.depthPlanes?.find(candidate => candidate.layerIds.includes(layerId));
  return clamp(plane?.depth ?? layer.depth, 0, 1);
}

/** Size multiplier from the optional depth-scale feature. Neutral is exactly 1. */
export function depthScaleFor(scene: CameraSceneConfig, layerId: string): number {
  const settings = scene.depthScale;
  if (!settings) return 1;
  const near = settings.near ?? 1, far = settings.far ?? 1, reference = settings.reference ?? .5;
  const depth = resolvedDepth(scene, layerId);
  // Far at depth 0, near at depth 1, exactly 1 at the reference depth.
  const t = depth >= reference
    ? (reference >= 1 ? 0 : (depth - reference) / (1 - reference))
    : (reference <= 0 ? 0 : (reference - depth) / reference);
  const endpoint = depth >= reference ? near : far;
  const influence = settings.influence?.[layerId] ?? 1;
  return clamp(1 + (endpoint - 1) * t * (settings.strength ?? 1) * influence, .2, 4);
}

/** Scale camera translation for one layer. Neutral factors return the camera unchanged,
 * so depth, ordering, rotation and lens behaviour stay exactly as calibrated. */
export function parallaxCamera<T extends { x: number; y: number; z: number }>(camera: T, factor: number): T {
  if (factor === 1) return camera;
  return { ...camera, x: camera.x * factor, y: camera.y * factor, z: camera.z * factor };
}

const progress = (effect: LayerEffect, time: number) => clamp((time - effect.start) / effect.duration, 0, 1);
/** Bell envelope: exactly zero at both ends, so effects never jump on or off. */
const envelope = (u: number) => { const s = Math.sin(Math.PI * u); return s * s; };
const smooth = (u: number) => u * u * (3 - 2 * u);
/** Short fades at the ends of a loop: full motion in the body, no jump on entry or exit. */
const fadedEdges = (local: number, duration: number) => {
  const ramp = Math.min(.35, duration * .1);
  if (ramp <= 0) return 0;
  return smooth(clamp(local / ramp, 0, 1)) * smooth(clamp((duration - local) / ramp, 0, 1));
};
const mix = (from: number, to: number, u: number) => from + (to - from) * u;
const directionVector = (direction: AmbientDirection): Point2 =>
  direction === 'left' ? { x: -1, y: 0 } : direction === 'right' ? { x: 1, y: 0 } :
  direction === 'up' ? { x: 0, y: -1 } : { x: 0, y: 1 };
/** Arranged layer extent in scene pixels; used only for pivot rotation. */
function layerExtent(scene: CameraSceneConfig, layerId: string) {
  const layer = scene.layers.find(candidate => candidate.id === layerId);
  const scale = (layer?.scale ?? 1) * scene.camera.baseZoom;
  return { width: (layer?.width ?? scene.width) * scale, height: (layer?.height ?? scene.height) * scale };
}

/** Sideways entry/exit distance for a framing direction, in scene pixels. */
function framingOffset(direction: FrameDirection, percent: number, width: number, height: number) {
  const horizontal = direction === 'left' || direction === 'right';
  const distance = (horizontal ? width : height) * percent / 100;
  switch (direction) {
    case 'left': return { x: -distance, y: 0 };
    case 'right': return { x: distance, y: 0 };
    case 'top': return { x: 0, y: -distance };
    case 'bottom': return { x: 0, y: distance };
  }
}

/**
 * Shared deterministic evaluator for all layer effects.
 * Composition rules, in effect start order (ties by id):
 * - position offsets and rotations add;
 * - scale and opacity multiply;
 * - the last started reveal supplies the layer mask (one mask per layer);
 * - the last started shadow, warp, particle system and tile wrap wins per layer.
 */
export function evaluateLayerEffects(scene: CameraSceneConfig, time: number, intensity = 1): Record<string, LayerEffectDelta> {
  const result: Record<string, LayerEffectDelta> = {};
  for (const layer of scene.layers) result[layer.id] = neutralDelta();
  const amount = clamp(intensity, 0, 1);
  if (amount === 0) return result;
  const effects = [...(scene.layerEffects ?? [])].sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const effect of effects) {
    if (time < effect.start) continue;
    // Endpoints hold: an entering layer stays in frame and a reveal stays open.
    const u = progress(effect, time);
    for (const [index, id] of effect.layerIds.entries()) {
      const delta = result[id];
      if (!delta) continue;
      switch (effect.kind) {
        case 'drift': {
          const edge = envelope(u);
          if (edge === 0) break;
          const local = time - effect.start;
          const amountPx = effect.amplitude * edge * amount;
          const phase = effect.phase * Math.PI / 180;
          let x = 0, y = 0;
          if (effect.motion === 'sway') {
            x = amountPx * Math.sin(2 * Math.PI * effect.speed * local + phase);
            y = amountPx * Math.sin(2 * Math.PI * effect.speed * local + phase + Math.PI / 2);
          } else {
            x = amountPx * drift(local * effect.speed, effect.seed);
            y = amountPx * drift(local * effect.speed + 31.7, effect.seed + 101);
          }
          if (effect.axis !== 'y') delta.x += x;
          if (effect.axis !== 'x') delta.y += y;
          break;
        }
        case 'transform':
          delta.scale *= 1 + (mix(effect.startScale, effect.endScale, u) - 1) * amount;
          delta.rotation += mix(effect.startRotation, effect.endRotation, u) * amount;
          break;
        case 'framing': {
          // One complete enter per cycle; alternate cycles exit again so repeated
          // framing reads as enter, leave, enter, leave.
          const cycles = u * effect.repeat;
          const index = Math.min(effect.repeat - 1, Math.floor(cycles));
          const local = u >= 1 ? 1 : cycles - Math.floor(cycles);
          const position = index % 2 === 0 ? local : 1 - local;
          const percent = mix(effect.startOffset, effect.endOffset, position);
          const offset = framingOffset(effect.direction, percent, scene.width, scene.height);
          delta.x += offset.x * amount; delta.y += offset.y * amount;
          break;
        }
        case 'fade': {
          const value = mix(effect.startOpacity, effect.endOpacity, u);
          delta.opacity *= mix(1, value, amount);
          break;
        }
        case 'reveal': {
          const coverage = mix(effect.startCoverage, effect.endCoverage, u);
          delta.mask = { kind: effect.mask, coverage: mix(1, coverage, amount), softness: effect.softness,
            direction: effect.direction, originX: effect.originX, originY: effect.originY };
          break;
        }
        case 'wind': {
          const local = time - effect.start;
          const edge = fadedEdges(local, effect.duration);
          if (edge === 0) break;
          const phase = (effect.phase + index * effect.spread) * Math.PI / 180;
          const base = 2 * Math.PI * effect.speed * local + phase;
          const gust = 1 + effect.gust * (.45 * Math.sin(2 * base + 1.3) + .3 * Math.sin(3.7 * base + .6));
          const angle = effect.rotation * gust * Math.sin(base) * edge * amount;
          if (angle !== 0) {
            const { width, height } = layerExtent(scene, id);
            // Rotation about a pivot: compose the centre displacement that keeps the pivot fixed.
            const px = -(effect.pivotX - .5) * width, py = -(effect.pivotY - .5) * height;
            const radians = angle * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians);
            delta.x += (cos - 1) * px - sin * py;
            delta.y += sin * px + (cos - 1) * py;
            delta.rotation += angle;
          }
          const direction = effect.direction === 'left' ? -1 : 1;
          delta.x += direction * effect.movement * edge * (.6 + .4 * Math.sin(base + Math.PI / 2)) * amount;
          delta.y += effect.movement * edge * .22 * Math.sin(2 * base + .7) * amount;
          break;
        }
        case 'float': {
          const local = time - effect.start;
          const edge = fadedEdges(local, effect.duration);
          if (edge === 0) break;
          const phase = 2 * Math.PI * effect.speed * local + effect.phase * Math.PI / 180;
          const amplitude = effect.amplitude * edge * amount;
          if (effect.axis !== 'y') delta.x += amplitude * Math.sin(phase);
          if (effect.axis !== 'x') delta.y += amplitude * (effect.axis === 'xy' ? .65 * Math.cos(phase) : Math.sin(phase));
          delta.rotation += effect.rotation * edge * amount * Math.sin(2 * phase + Math.PI / 2);
          break;
        }
        case 'ambient': {
          const local = time - effect.start;
          if (effect.mode === 'layer') {
            const vector = directionVector(effect.direction);
            if (effect.motion === 'pulse') {
              const pulse = .5 - .5 * Math.cos(2 * Math.PI * local / effect.loop + effect.phase * Math.PI / 180);
              delta.opacity *= 1 - (effect.amplitude / 100) * pulse * fadedEdges(local, effect.duration) * amount;
            } else if (effect.motion === 'oscillate') {
              const travel = effect.amplitude * Math.sin(2 * Math.PI * local / effect.loop + effect.phase * Math.PI / 180) * fadedEdges(local, effect.duration) * amount;
              delta.x += vector.x * travel; delta.y += vector.y * travel;
            } else {
              const distance = effect.speed * local * amount;
              const x = vector.x * distance, y = vector.y * distance;
              if (effect.tileable && (vector.x === 0 || vector.y === 0)) {
                delta.wrap = { x, y }; delta.warp = undefined; delta.particles = undefined;
              } else { delta.x += x; delta.y += y; }
            }
          } else {
            const particles: ParticleInstance[] = [];
            const vector = directionVector(effect.direction);
            const cycle = Math.max(.25, effect.lifetime);
            const region = { x: effect.regionX * scene.width, y: effect.regionY * scene.height,
              w: effect.regionWidth * scene.width, h: effect.regionHeight * scene.height };
            const extent = vector.x !== 0 ? region.w : region.h;
            for (let index = 0; index < effect.count; index++) {
              const unit = (n: number) => (seededValue(effect.seed + n * 131, index) + 1) / 2;
              const phase = (((local / cycle) + unit(1)) % 1 + 1) % 1;
              const speed = mix(Math.min(effect.speedMin, effect.speedMax), Math.max(effect.speedMin, effect.speedMax), unit(2));
              const distance = Math.min(extent, speed * cycle) * phase;
              const crossSway = Math.sin(2 * Math.PI * phase + unit(3) * 6.283) * 5;
              const startX = region.x + (vector.x > 0 ? 0 : vector.x < 0 ? region.w : unit(6) * region.w);
              const startY = region.y + (vector.y > 0 ? 0 : vector.y < 0 ? region.h : unit(6) * region.h);
              const x = startX + vector.x * distance + (vector.x === 0 ? crossSway : 0);
              const y = startY + vector.y * distance + (vector.y === 0 ? crossSway : 0);
              const fade = Math.sin(Math.PI * phase) * amount;
              particles.push({ x: x - scene.width / 2, y: y - scene.height / 2,
                size: mix(Math.min(effect.sizeMin, effect.sizeMax), Math.max(effect.sizeMin, effect.sizeMax), unit(3)),
                opacity: mix(Math.min(effect.opacityMin, effect.opacityMax), Math.max(effect.opacityMin, effect.opacityMax), unit(4)) * fade,
                rotation: (unit(5) * 2 - 1) * 20 });
            }
            delta.particles = particles; delta.wrap = undefined; delta.warp = undefined;
          }
          break;
        }
        case 'shadow': {
          const local = time - effect.start;
          const travel = effect.distance + effect.amplitude * Math.sin(2 * Math.PI * effect.speed * local + effect.phase * Math.PI / 180) * amount;
          const radians = effect.angle * Math.PI / 180;
          delta.shadow = { x: Math.cos(radians) * travel, y: Math.sin(radians) * travel,
            opacity: effect.opacity * amount, blur: effect.blur, color: effect.color };
          break;
        }
        case 'warp': {
          const corners = effect.corners.map((corner, cornerIndex) => ({
            x: mix(neutralCorners[cornerIndex].x, corner.x, u * amount),
            y: mix(neutralCorners[cornerIndex].y, corner.y, u * amount) })) as WarpCorners;
          delta.warp = { corners }; delta.wrap = undefined; delta.particles = undefined;
          break;
        }
      }
    }
  }
  return result;
}
