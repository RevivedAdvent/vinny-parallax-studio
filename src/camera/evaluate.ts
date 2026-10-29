import type { CameraSceneConfig, CameraState, Pose, Track } from './types.ts';
import { clamp, drift, ease, finite } from './easing.ts';
import { validateScene } from './validate.ts';

const neutralPose = (): Pose => ({ x: 0, y: 0, zoom: 1, roll: 0 });
export function trackValue(track: Track, frame: number, fps: number) {
  const neutral = track.property === 'zoom' ? 1 : 0;
  if (frame < track.startFrame || (frame > track.endFrame && track.holdAfter === false)) return neutral;
  const duration = track.endFrame - track.startFrame;
  const u = duration === 0 ? 1 : clamp((frame - track.startFrame) / duration, 0, 1);
  let value = u === 0 ? track.startValue : u === 1 ? track.endValue :
    track.startValue + (track.endValue - track.startValue) * ease(track.easing, u);
  if (track.easing === 'seeded_noise' && track.noise && u > 0 && u < 1) {
    const edge = 4 * u * (1 - u);
    value += track.noise.amplitude * edge * edge * drift(u * duration / fps * track.noise.frequency, track.noise.seed);
  }
  return clamp(value, track.limits.min, track.limits.max);
}
/** No clock, GPU, DOM, mutable PRNG, or integration. All tracks are additive deltas from neutral. */
export function evaluateCamera(config: CameraSceneConfig, frame: number, intensity = 1): CameraState {
  if (!Number.isInteger(frame) || frame < 0 || frame >= config.totalFrames) throw new Error(`frameIndex must be 0..${config.totalFrames - 1}`);
  const amount = clamp(finite(intensity, 'intensity'), 0, 1);
  const result: CameraState = { ...neutralPose(), frame, uniformDelta: 0, dollyDelta: 0,
    layers: Object.fromEntries(config.layers.map(l => [l.id, neutralPose()])) };
  for (const track of config.tracks) {
    const weight = amount * track.intensity;
    if (weight === 0) continue;
    const neutral = track.property === 'zoom' ? 1 : 0;
    const delta = (trackValue(track, frame, config.fps) - neutral) * weight;
    if (track.target === 'camera') {
      if (track.property === 'zoom') {
        if (track.projection === 'dolly') result.dollyDelta += delta;
        else result.uniformDelta += delta;
      } else result[track.property] += delta;
    } else result.layers[track.target.slice(6)][track.property] += delta;
  }
  const bounds = config.camera.limits;
  for (const p of ['x', 'y', 'roll'] as const) result[p] = clamp(result[p], bounds[p].min, bounds[p].max);
  result.uniformDelta = clamp(result.uniformDelta, bounds.zoom.min - 1, bounds.zoom.max - 1);
  result.dollyDelta = clamp(result.dollyDelta, bounds.zoom.min - 1, bounds.zoom.max - 1);
  const sum = result.uniformDelta + result.dollyDelta;
  const bounded = clamp(1 + sum, bounds.zoom.min, bounds.zoom.max);
  if (sum !== 0 && bounded !== 1 + sum) {
    const correction = (bounded - 1) / sum;
    result.uniformDelta *= correction; result.dollyDelta *= correction;
  }
  result.zoom = bounded;
  for (const pose of Object.values(result.layers)) {
    for (const p of ['x', 'y', 'zoom', 'roll'] as const) pose[p] = clamp(pose[p], bounds[p].min, bounds[p].max);
  }
  return result;
}

export function compileCamera(input: CameraSceneConfig) {
  const config = validateScene(input);
  return {
    config: () => structuredClone(config),
    evaluate: (frame: number, intensity = 1) => evaluateCamera(config, frame, intensity),
  };
}
