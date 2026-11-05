import type { AnimationTrack } from './animation.ts';
import type { CameraMove } from './moves.ts';
import type { LayerEffect, LayerMask, LayerShadow, LayerWrap, ParallaxSettings, ParticleInstance, DepthScaleSettings, DepthPlane, WarpCorners } from './layer-effects.ts';
import type { VirtualCamera } from './virtual-projection.ts';
export type Property = 'x' | 'y' | 'zoom' | 'roll';
export type Easing = 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out' | 'overshoot_settle' | 'hold' | 'seeded_noise';
export interface Limits { min: number; max: number }
export interface Track {
  id: string;
  target: 'camera' | `layer:${string}`;
  property: Property;
  startFrame: number;
  endFrame: number;
  startValue: number;
  endValue: number;
  easing: Easing;
  intensity: number;
  limits: Limits;
  /** Only zoom tracks use this. Uniform scales equally; dolly weights scale by depth. */
  projection?: 'uniform' | 'dolly';
  /** Additive contributions persist after endFrame unless holdAfter is false. */
  holdAfter?: boolean;
  noise?: { seed: number; amplitude: number; frequency: number };
}
export interface Layer {
  id: string;
  name: string;
  asset: string;
  depth: number;
  order?: number;
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  width?: number;
  height?: number;
}
export interface CameraSceneConfig {
  version: 1;
  id: string;
  title?: string;
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  layers: Layer[];
  camera: {
    baseZoom: number;
    /** Maximum absolute roll permitted by validation; defaults to 3 degrees for version-1 camera proofs. */
    maxRoll?: number;
    /** Output-space point about which push/zoom and roll are framed. */
    anchor: { x: number; y: number };
    limits: Record<Property, Limits>;
  };
  tracks: Track[];
  /** Seconds-based authoring. A channel here replaces the corresponding legacy channel. */
  animationTracks?: AnimationTrack[];
  /** Independent composite camera moves. Legacy tracks remain supported. */
  cameraMoves?: CameraMove[];
  /** Depth response for the parallax workspace. Absent means fully neutral. */
  parallax?: ParallaxSettings;
  /** Optional depth-based size adjustment, applied before virtual-camera projection. */
  depthScale?: DepthScaleSettings;
  /** Optional intermediate depth planes. Layers keep their stored depth when unassigned. */
  depthPlanes?: DepthPlane[];
  /** Deterministic layer-level animation. Absent or empty means no layer effects. */
  layerEffects?: LayerEffect[];
}
export interface Pose { x: number; y: number; zoom: number; roll: number; opacity: number }
export interface CameraState extends Pose {
  frame: number;
  uniformDelta: number;
  dollyDelta: number;
  compositeCamera: { x: number; y: number; scale: number };
  /** Present only when a scene contains version-2 camera moves. */
  virtualCamera?: VirtualCamera;
  /** Mask state for reveal effects, keyed by layer id. */
  layerMasks?: Record<string, LayerMask>;
  /** Attached shadow state, keyed by layer id. */
  layerShadows?: Record<string, LayerShadow>;
  /** Animated warp corners, keyed by layer id. */
  layerWarps?: Record<string, WarpCorners>;
  /** Deterministic particle instances, keyed by layer id. */
  layerParticles?: Record<string, ParticleInstance[]>;
  /** Continuous tile travel for tileable ambient layers. */
  layerWraps?: Record<string, LayerWrap>;
  layers: Record<string, Pose>;
}
export interface LayerTransform {
  id: string;
  depth: number;
  x: number;
  y: number;
  scale: number;
  roll: number;
  opacity: number;
}
