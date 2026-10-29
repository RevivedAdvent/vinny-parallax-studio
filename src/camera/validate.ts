import type { CameraSceneConfig, Limits, Property } from './types.ts';
import { clamp, finite } from './easing.ts';

const properties = ['x', 'y', 'zoom', 'roll'] as const;
const easings = ['linear', 'ease_in', 'ease_out', 'ease_in_out', 'overshoot_settle', 'hold', 'seeded_noise'];
const hardLimits: Record<Property, Limits> = {
  x: { min: -1920, max: 1920 }, y: { min: -1080, max: 1080 },
  zoom: { min: 0.25, max: 4 }, roll: { min: -3, max: 3 },
};
function limits(value: Limits, label: string, hard: Limits) {
  if (!value) throw new Error(`${label} missing`);
  const min = clamp(finite(value.min, `${label}.min`), hard.min, hard.max);
  const max = clamp(finite(value.max, `${label}.max`), hard.min, hard.max);
  if (min > max) throw new Error(`${label} inverted`);
  return { min, max };
}
function integer(value: number, min: number, max: number, label: string) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer in ${min}..${max}`);
}
/** Validate once at the boundary. Return an owned copy; never mutate caller data. */
export function validateScene(input: CameraSceneConfig): CameraSceneConfig {
  const config = structuredClone(input);
  if (config.version !== 1 || typeof config.id !== 'string' || !config.id.trim()) throw new Error('Invalid camera scene identity/version');
  integer(config.width, 1, 8192, 'width'); integer(config.height, 1, 8192, 'height');
  integer(config.fps, 1, 120, 'fps'); integer(config.totalFrames, 1, 100000, 'totalFrames');
  if (!config.camera || !Array.isArray(config.layers) || !Array.isArray(config.tracks)) throw new Error('Camera, layers and tracks are required');
  config.camera.baseZoom = clamp(finite(config.camera.baseZoom, 'baseZoom'), 1, 2);
  config.camera.anchor.x = clamp(finite(config.camera.anchor.x, 'anchor.x'), 0, config.width);
  config.camera.anchor.y = clamp(finite(config.camera.anchor.y, 'anchor.y'), 0, config.height);
  const maxRoll = config.camera.maxRoll === undefined ? 3 : finite(config.camera.maxRoll, 'camera.maxRoll');
  if (maxRoll < 0 || maxRoll > 180) throw new Error('camera.maxRoll must be 0..180');
  for (const p of properties) {
    const hard = p === 'x' ? { min: -config.width, max: config.width } : p === 'y' ? { min: -config.height, max: config.height } : p === 'roll' ? { min: -maxRoll, max: maxRoll } : hardLimits[p];
    config.camera.limits[p] = limits(config.camera.limits[p], `camera.${p}`, hard);
    const neutral = p === 'zoom' ? 1 : 0;
    if (config.camera.limits[p].min > neutral || config.camera.limits[p].max < neutral) throw new Error(`camera.${p} limits must include neutral ${neutral}`);
  }
  const ids = new Set<string>();
  for (const [index, layer] of config.layers.entries()) {
    if (!layer.id || ids.has(layer.id)) throw new Error('Layer ids must be nonempty and unique');
    ids.add(layer.id);
    if (!layer.name || typeof layer.asset !== 'string' || !layer.asset) throw new Error(`Invalid layer ${layer.id}`);
    layer.depth = clamp(finite(layer.depth, `${layer.id}.depth`), 0, 1);
    layer.order ??= index; layer.x ??= 0; layer.y ??= 0; layer.scale ??= 1;
    layer.rotation ??= 0; layer.opacity ??= 1; layer.visible ??= true;
    for (const field of ['x','y','scale','rotation','opacity'] as const) finite(layer[field]!, `${layer.id}.${field}`);
    if (layer.scale! <= 0 || layer.opacity! < 0 || layer.opacity! > 1) throw new Error(`Invalid transform on ${layer.id}`);
  }
  config.layers.sort((a,b) => a.order! - b.order!);
  const tracks = new Set<string>();
  for (const track of config.tracks) {
    if (!track.id || tracks.has(track.id)) throw new Error('Track ids must be nonempty and unique');
    tracks.add(track.id);
    if (track.target !== 'camera' && !(typeof track.target === 'string' && track.target.startsWith('layer:') && ids.has(track.target.slice(6)))) throw new Error(`Invalid target on ${track.id}`);
    if (!properties.includes(track.property)) throw new Error(`Invalid property on ${track.id}`);
    integer(track.startFrame, 0, config.totalFrames - 1, `${track.id}.startFrame`);
    integer(track.endFrame, track.startFrame, config.totalFrames - 1, `${track.id}.endFrame`);
    if (!easings.includes(track.easing)) throw new Error(`Invalid easing on ${track.id}`);
    track.intensity = clamp(finite(track.intensity, `${track.id}.intensity`), 0, 1);
    track.limits = limits(track.limits, `${track.id}.limits`, config.camera.limits[track.property]);
    track.startValue = clamp(finite(track.startValue, `${track.id}.startValue`), track.limits.min, track.limits.max);
    track.endValue = clamp(finite(track.endValue, `${track.id}.endValue`), track.limits.min, track.limits.max);
    if (track.holdAfter !== undefined && typeof track.holdAfter !== 'boolean') throw new Error(`Invalid holdAfter on ${track.id}`);
    if (track.property === 'zoom') {
      track.projection ??= 'uniform';
      if (track.projection !== 'uniform' && track.projection !== 'dolly') throw new Error(`Invalid projection on ${track.id}`);
      if (track.target !== 'camera' && track.projection === 'dolly') throw new Error('Layer zoom is local, not a dolly');
    } else if (track.projection !== undefined) throw new Error('Projection applies only to zoom tracks');
    if (track.easing === 'seeded_noise') {
      if (!track.noise) throw new Error(`seeded_noise needs noise config on ${track.id}`);
      integer(track.noise.seed, -2147483648, 2147483647, 'noise.seed');
      const maxAmplitude = track.property === 'zoom' ? 0.02 : track.property === 'roll' ? 0.5 : 3;
      track.noise.amplitude = clamp(finite(track.noise.amplitude, 'noise.amplitude'), 0, maxAmplitude);
      track.noise.frequency = clamp(finite(track.noise.frequency, 'noise.frequency'), 0.05, 6);
    }
  }
  // Stable order makes additive floating-point composition independent of authoring order.
  config.tracks.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return config;
}
