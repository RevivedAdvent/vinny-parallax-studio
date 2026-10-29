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
  /** Only zoom tracks use this. Uniform = optical zoom; dolly = depth-weighted push. */
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
}
export interface Pose { x: number; y: number; zoom: number; roll: number }
export interface CameraState extends Pose {
  frame: number;
  uniformDelta: number;
  dollyDelta: number;
  layers: Record<string, Pose>;
}
export interface LayerTransform {
  id: string;
  depth: number;
  x: number;
  y: number;
  scale: number;
  roll: number;
}
