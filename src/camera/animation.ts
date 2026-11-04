import type { CameraSceneConfig, Easing, Track } from './types.ts';
import { clamp, ease, finite } from './easing.ts';

export type AnimationProperty = 'x' | 'y' | 'zoom' | 'dolly' | 'rotation' | 'opacity';
export interface AnimationKeyframe { id: string; timeSeconds: number; value: number; easing: Easing }
export interface AnimationTrack {
  id: string;
  target: Track['target'];
  property: AnimationProperty;
  keyframes: AnimationKeyframe[];
  intensity: number;
  enabled?: boolean;
}
export const animationEasings: Easing[] = ['linear','ease_in','ease_out','ease_in_out','hold','overshoot_settle'];
export const sceneDuration = (scene: CameraSceneConfig) => scene.totalFrames / scene.fps;
export const secondsToFrame = (seconds: number, fps: number) => finite(seconds, 'seconds') * finite(fps, 'fps');
export const snapSecond = (seconds: number, duration: number) => clamp(Math.round(finite(seconds, 'seconds')), 0, Math.floor(duration));
export const neutralValue = (property: AnimationProperty) => ['zoom','dolly','opacity'].includes(property) ? 1 : 0;
export function propertyBounds(scene: CameraSceneConfig, target: Track['target'], property: AnimationProperty) {
  if (property === 'zoom' && target !== 'camera') return { min: 0.01, max: 10 };
  if (property === 'opacity') return { min: 0, max: 1 };
  if (property === 'rotation' && target !== 'camera') return { min: -180, max: 180 };
  return scene.camera.limits[property === 'rotation' ? 'roll' : property === 'dolly' ? 'zoom' : property];
}
export function channel(track: Pick<AnimationTrack, 'target' | 'property'>) { return `${track.target}/${track.property}`; }
export function legacyChannel(track: Track) {
  return channel({ target: track.target, property: track.property === 'roll' ? 'rotation' : track.property === 'zoom' && track.projection === 'dolly' ? 'dolly' : track.property });
}
/** Values are local offsets/factors relative to the stored Arrange transform. Before the first
 * point the neutral value applies; after the final point its value is held. Easing belongs
 * to the outgoing segment. Evaluation never changes the saved track. */
export function keyframeValue(track: AnimationTrack, seconds: number) {
  const points = track.keyframes, first = points[0];
  if (!first || seconds < first.timeSeconds) return neutralValue(track.property);
  const last = points[points.length - 1];
  if (seconds >= last.timeSeconds) return last.value;
  const index = points.findIndex(k => k.timeSeconds > seconds);
  const a = points[index - 1], b = points[index];
  if (seconds === a.timeSeconds) return a.value;
  return a.value + (b.value - a.value) * ease(a.easing, (seconds - a.timeSeconds) / (b.timeSeconds - a.timeSeconds));
}
export function putKeyframe(track: AnimationTrack, point: AnimationKeyframe): AnimationTrack {
  return { ...track, keyframes: [...track.keyframes.filter(k => k.id !== point.id && k.timeSeconds !== point.timeSeconds), point].sort((a,b) => a.timeSeconds - b.timeSeconds) };
}
export function deleteKeyframe(track: AnimationTrack, id: string): AnimationTrack {
  return { ...track, keyframes: track.keyframes.filter(k => k.id !== id) };
}
export function effectDuration(track: AnimationTrack): number {
  return track.keyframes.length < 2 ? 0 : track.keyframes.at(-1)!.timeSeconds - track.keyframes[0].timeSeconds;
}
export function editEffectTiming(track: AnimationTrack, start: number, duration: number, scene: CameraSceneConfig): AnimationTrack {
  if (!Number.isFinite(start) || !Number.isFinite(duration) || start < 0 || duration <= 0 || start + duration > sceneDuration(scene)) throw new Error('Effect must fit within the scene duration');
  const first = track.keyframes[0], last = track.keyframes.at(-1)!;
  const oldDuration = last.timeSeconds - first.timeSeconds;
  if (oldDuration <= 0) throw new Error('An effect needs at least two keyframes');
  return { ...track, keyframes: track.keyframes.map(point => ({ ...point, timeSeconds: start + (point.timeSeconds - first.timeSeconds) * duration / oldDuration })) };
}
export function effectTrack(options: { id:string; target:Track['target']; property:AnimationProperty; start:number; duration:number; from:number; to:number; easing:Easing; intensity:number }, scene: CameraSceneConfig): AnimationTrack {
  const o = options;
  if (!Number.isFinite(o.start) || !Number.isFinite(o.duration) || o.start < 0 || o.duration <= 0 || o.start + o.duration > sceneDuration(scene)) throw new Error('Effect must fit within the scene duration');
  return { id:o.id, target:o.target, property:o.property, intensity:o.intensity, keyframes:[
    {id:`${o.id}-start`,timeSeconds:o.start,value:o.from,easing:o.easing},
    {id:`${o.id}-end`,timeSeconds:o.start+o.duration,value:o.to,easing:o.easing},
  ] };
}
/** Optional conversion for a single legacy segment. Legacy projects themselves retain their
 * original tracks, including additive overlaps, noise, and holdAfter:false semantics. */
export function legacyKeyframes(track: Track, fps: number): AnimationTrack {
  if (track.easing === 'seeded_noise' || track.holdAfter === false) throw new Error('Keep this legacy track: procedural/release behaviour cannot be represented by two keyframes');
  const property = track.property === 'roll' ? 'rotation' : track.property === 'zoom' && track.projection === 'dolly' ? 'dolly' : track.property;
  return {id:track.id,target:track.target,property,intensity:track.intensity,keyframes:[
    ...(track.startFrame === track.endFrame ? [] : [{id:`${track.id}-start`,timeSeconds:track.startFrame/fps,value:track.startValue,easing:track.easing}]),
    {id:`${track.id}-end`,timeSeconds:track.endFrame/fps,value:track.endValue,easing:track.easing},
  ]};
}
export function validateAnimation(scene: CameraSceneConfig) {
  const ids = new Set<string>(), keys = new Set<string>(), channels = new Set<string>();
  for (const track of scene.animationTracks ?? []) {
    if (typeof track.id !== 'string' || !track.id || ids.has(track.id)) throw new Error('Animation track IDs must be unique');
    ids.add(track.id);
    if (track.target !== 'camera' && !scene.layers.some(l => `layer:${l.id}` === track.target)) throw new Error('Animation target is missing');
    if (!['x','y','zoom','dolly','rotation','opacity'].includes(track.property) || (track.target === 'camera' && ['opacity','rotation'].includes(track.property)) || (track.target !== 'camera' && track.property === 'dolly')) throw new Error('Invalid animation property');
    const name = channel(track);
    if (channels.has(name)) throw new Error('Only one animation track per target/property is allowed');
    channels.add(name);
    track.intensity = clamp(finite(track.intensity,'animation intensity'),0,1);
    if (track.enabled !== undefined && typeof track.enabled !== 'boolean') throw new Error('Invalid animation enabled state');
    track.enabled ??= true;
    if (!Array.isArray(track.keyframes) || !track.keyframes.length) throw new Error('Animation needs keyframes');
    const times = new Set<number>(), bounds = propertyBounds(scene,track.target,track.property);
    for (const point of track.keyframes) {
      if (typeof point.id !== 'string' || !point.id || keys.has(point.id)) throw new Error('Keyframe IDs must be unique');
      keys.add(point.id);
      const time = finite(point.timeSeconds,'keyframe time');
      if (time < 0 || time > sceneDuration(scene) || times.has(time)) throw new Error('Keyframe time is duplicate or outside the scene');
      times.add(time);
      if (!animationEasings.includes(point.easing)) throw new Error('Invalid keyframe easing');
      point.value = clamp(finite(point.value,'keyframe value'),bounds.min,bounds.max);
    }
    track.keyframes.sort((a,b) => a.timeSeconds-b.timeSeconds);
  }
}
export const cameraPresets = [
  {id:'static',name:'Static / locked-off',description:'No camera movement. Lets the illustration breathe and gives the viewer time to read the scene.',property:'x',to:0},
  {id:'push',name:'Push-in / dolly-in',description:'Move closer to the subject to build intimacy, tension or emotional emphasis.',property:'dolly',to:1.2},
  {id:'pull',name:'Pull-out / dolly-out',description:'Reveal more of the environment or create emotional distance.',property:'dolly',to:.8},
  {id:'pan',name:'Pan left / right',description:'Reveal the world horizontally; useful for landscapes and looking toward a new subject.',property:'x',to:120},
  {id:'tilt',name:'Tilt up / down',description:'Reveal height, descend toward a subject or emphasize scale.',property:'y',to:80},
  {id:'zoom',name:'Zoom in / out',description:'Change framing by scaling the view; unlike a true dolly, this does not change perspective.',property:'zoom',to:1.2},
] as const;
