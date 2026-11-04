import type { CameraSceneConfig, CameraState, Pose, Track } from './types.ts';
import { clamp, drift, ease, finite } from './easing.ts';
import { channel, legacyChannel, keyframeValue, neutralValue, propertyBounds } from './animation.ts';
import { validateScene } from './validate.ts';
import { evaluateMoves } from './moves.ts';

const neutralPose = (): Pose => ({ x: 0, y: 0, zoom: 1, roll: 0, opacity: 1 });
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
  return evaluateSceneAtTime(config, frame / config.fps, intensity);
}
/** Random-access seconds evaluator shared by preview and 60 FPS export, including fractional source frames. */
export function evaluateSceneAtTime(config: CameraSceneConfig, seconds: number, intensity = 1): CameraState {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > config.totalFrames / config.fps) throw new Error('Time outside scene');
  const frame = seconds * config.fps;
  const amount = clamp(finite(intensity, 'intensity'), 0, 1);
  const result: CameraState = { ...neutralPose(), frame, uniformDelta: 0, dollyDelta: 0, compositeCamera: evaluateMoves(config, seconds, amount),
    layers: Object.fromEntries(config.layers.map(l => [l.id, neutralPose()])) };
  const authored = new Set((config.animationTracks ?? []).filter(track => track.enabled !== false).map(channel));
  for (const track of config.tracks) {
    if (authored.has(legacyChannel(track))) continue;
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
  for (const track of config.animationTracks ?? []) {
    if (track.enabled === false) continue;
    const neutral = neutralValue(track.property), bounds = propertyBounds(config, track.target, track.property);
    const value = clamp(keyframeValue(track, seconds), bounds.min, bounds.max);
    const delta = (value - neutral) * amount * track.intensity;
    if (track.target === 'camera') {
      if (track.property === 'dolly') result.dollyDelta = delta;
      else if (track.property === 'zoom') result.uniformDelta = delta;
      else if (track.property === 'x' || track.property === 'y') result[track.property] = delta;
    } else {
      const pose = result.layers[track.target.slice(6)];
      const p = track.property === 'rotation' ? 'roll' : track.property;
      if (p !== 'dolly') { const weight = amount * track.intensity; pose[p] = value * weight + neutral * (1 - weight); }
    }
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
  for (const [id, pose] of Object.entries(result.layers)) {
    for (const p of ['x', 'y', 'zoom'] as const) {
      const limits = authored.has(`layer:${id}/${p}`) ? propertyBounds(config, `layer:${id}`, p) : bounds[p];
      pose[p] = clamp(pose[p], limits.min, limits.max);
    }
    const rotation = authored.has(`layer:${id}/rotation`) ? { min: -180, max: 180 } : bounds.roll;
    pose.roll = clamp(pose.roll, rotation.min, rotation.max);
    pose.opacity = clamp(pose.opacity, 0, 1);
  }
  return result;
}

export function compileCamera(input: CameraSceneConfig) {
  const config = validateScene(input);
  return {
    config: () => structuredClone(config),
    evaluateTime: (seconds: number, intensity = 1) => evaluateSceneAtTime(config, seconds, intensity),
    evaluate: (frame: number, intensity = 1) => evaluateCamera(config, frame, intensity),
  };
}
