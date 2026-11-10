import type { AtmosphereEffect, AtmosphereState } from './atmosphere.ts';
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
/** A folder is a stacking group. Layers inside it stay contiguous in draw order. */
export interface LayerFolder {
  id: string;
  name: string;
  /** Shares the layer order space; a folder sits in the stack wherever this value lands. */
  order?: number;
  collapsed?: boolean;
}
export interface Layer {
  id: string;
  name: string;
  asset: string;
  depth: number;
  order?: number;
  /** Absent or empty means the layer sits at the top level of the stack. */
  folderId?: string;
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  /** Arrange-only: locked layers stay selectable but cannot be moved, resized or rotated. */
  locked?: boolean;
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
  /** Optional stacking folders. Organisation only; draw order still follows layer.order. */
  folders?: LayerFolder[];
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
  /** Camera moves. New and migrated moves always use the virtual camera. */
  cameraMoves?: CameraMove[];
  /** Depth response for the parallax workspace. Absent means fully neutral. */
  parallax?: ParallaxSettings;
  /** Optional depth-based size adjustment, applied before virtual-camera projection. */
  depthScale?: DepthScaleSettings;
  /** Optional intermediate depth planes. Layers keep their stored depth when unassigned. */
  depthPlanes?: DepthPlane[];
  /** Deterministic layer-level animation. Absent or empty means no layer effects. */
  layerEffects?: LayerEffect[];
  /** Scene-wide environmental effects: fog, haze, light and weather. */
  atmosphere?: AtmosphereEffect[];
}
export interface Pose { x: number; y: number; zoom: number; roll: number; opacity: number }
export interface CameraState extends Pose {
  /** Evaluated atmosphere overlays and per-layer adjustments at this time. */
  atmosphere?: AtmosphereState;
  frame: number;
  uniformDelta: number;
  dollyDelta: number;
  /** Legacy track totals retained as authoring metadata; never a second transform. */
  cameraTracks: { x: number; y: number; uniform: number; roll: number; dolly: number };
  /**
   * The one canonical camera used by preview, export and every depth-aware
   * effect. A scene without moves still evaluates to a neutral camera.
   */
  virtualCamera: VirtualCamera;
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
