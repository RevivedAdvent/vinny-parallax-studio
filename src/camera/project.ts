import type { CameraSceneConfig, CameraState, LayerTransform } from './types.ts';
import { calibration, planePoint, projectPoint, type Point2, type VirtualCamera } from './virtual-projection.ts';
import { depthScaleFor, parallaxCamera, parallaxFactor, resolvedDepth, type WarpCorners } from './layer-effects.ts';

const flatCorners: WarpCorners = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }];

/** Legacy projection stage: x/y are camera-space pixels, moving artwork in the opposite direction.
 * All layers share the anchor for scale and roll. This stage itself is affine.
 * Combined scale = baseZoom * (1 + uniformDelta + depth*dollyDelta) * localZoom.
 */
export function projectLayers(config: CameraSceneConfig, state: CameraState): LayerTransform[] {
  const { anchor, baseZoom } = config.camera;
  const radians = state.roll * Math.PI / 180;
  const c = Math.cos(radians), s = Math.sin(radians);
  return config.layers.map(layer => {
    const local = state.layers[layer.id];
    // Parallax scales camera translation only; depth itself is never changed, so
    // ordering, neutral framing, lens and rotation behaviour stay calibrated.
    const parallax = parallaxFactor(config, layer.id);
    const depth = resolvedDepth(config, layer.id);
    const factor = 1 + state.uniformDelta + state.dollyDelta * depth;
    const dx = (config.width / 2 - anchor.x) * factor + (layer.x ?? 0) * baseZoom * factor - state.x * depth * parallax + local.x;
    const dy = (config.height / 2 - anchor.y) * factor + (layer.y ?? 0) * baseZoom * factor - state.y * depth * parallax + local.y;
    const camera = state.compositeCamera;
    const x = anchor.x + dx * c - dy * s, y = anchor.y + dx * s + dy * c;
    return { id: layer.id, depth,
      x: config.width / 2 + (x - config.width / 2 - camera.x) * camera.scale,
      y: config.height / 2 + (y - config.height / 2 - camera.y) * camera.scale,
      scale: camera.scale * baseZoom * factor * (layer.scale ?? 1) * local.zoom * depthScaleFor(config, layer.id), roll: state.roll + (layer.rotation ?? 0) + local.roll, opacity: Math.max(0, Math.min(1, (layer.opacity ?? 1) * local.opacity)) };
  });
}

/** Scene-space corners of the already evaluated sprite, before perspective.
 * `warp` supplies normalized local corners; omitting it reproduces the flat sprite. */
export function layerCorners(pose: LayerTransform, width: number, height: number, warp?: WarpCorners): [Point2, Point2, Point2, Point2] {
  const c = Math.cos(pose.roll * Math.PI / 180), s = Math.sin(pose.roll * Math.PI / 180);
  const corners = warp ?? flatCorners;
  const point = (x: number, y: number) => ({ x: pose.x + pose.scale * (x * c - y * s), y: pose.y + pose.scale * (x * s + y * c) });
  return corners.map(corner => point(corner.x * width / 2, corner.y * height / 2)) as [Point2, Point2, Point2, Point2];
}

/** Center and local scale for inspection/tracking; the actual image uses all four corners. */
export function projectedLayerInfo(config: CameraSceneConfig, pose: LayerTransform, camera: VirtualCamera): LayerTransform | null {
  if (![pose.x, pose.y, pose.scale, pose.roll].every(Number.isFinite)) return null;
  const c = calibration(config.width, config.height);
  const view = parallaxCamera(camera, parallaxFactor(config, pose.id));
  const center = projectPoint(view, planePoint(c, pose.depth, pose), c.focalLength * .1);
  const radians = pose.roll * Math.PI / 180;
  const right = projectPoint(view, planePoint(c, pose.depth, { x: pose.x + pose.scale * Math.cos(radians), y: pose.y + pose.scale * Math.sin(radians) }), c.focalLength * .1);
  if (!center || !right) return null;
  const dx = right.x - center.x, dy = right.y - center.y;
  return { ...pose, x: center.x, y: center.y, scale: Math.hypot(dx, dy), roll: Math.atan2(dy, dx) * 180 / Math.PI };
}
