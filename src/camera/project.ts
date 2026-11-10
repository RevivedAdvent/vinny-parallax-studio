import type { CameraSceneConfig, CameraState, LayerTransform } from './types.ts';
import {
  calibration, compensatedPoint, planePoint, projectCompensatedPlane, projectPoint,
  type Point2, type Point3, type VirtualCamera,
} from './virtual-projection.ts';
import { depthScaleFor, parallaxFactor, resolvedDepth, type WarpCorners } from './layer-effects.ts';

const flatCorners: WarpCorners = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }];

/**
 * Build each layer's local/world pose before camera projection.
 *
 * This stage deliberately contains no camera translation, composite zoom, dolly
 * or camera roll. Camera state lives in exactly one place (`state.virtualCamera`)
 * and is applied by the shared projection helpers below.
 *
 * Depth Scale is part of the authored size here, not a camera lens change.
 */
export function projectLayers(config: CameraSceneConfig, state: CameraState): LayerTransform[] {
  const { baseZoom } = config.camera;
  return config.layers.map(layer => {
    const local = state.layers[layer.id];
    const depth = resolvedDepth(config, layer.id);
    return {
      id: layer.id,
      depth,
      x: config.width / 2 + (layer.x ?? 0) * baseZoom + local.x,
      y: config.height / 2 + (layer.y ?? 0) * baseZoom + local.y,
      scale: baseZoom * (layer.scale ?? 1) * local.zoom * depthScaleFor(config, layer.id),
      roll: (layer.rotation ?? 0) + local.roll,
      opacity: Math.max(0, Math.min(1, (layer.opacity ?? 1) * local.opacity)),
    };
  });
}

/** World point for one scene-space point on a layer's effective-depth plane,
 * with that layer's Parallax response applied. */
export function layerWorldPoint(config: CameraSceneConfig, camera: VirtualCamera, pose: LayerTransform, point: Point2): Point3 {
  const c = calibration(config.width, config.height);
  return compensatedPoint(planePoint(c, pose.depth, point), camera, parallaxFactor(config, pose.id));
}

/** Project one point belonging to a layer through the one shared virtual camera. */
export function projectLayerPoint(config: CameraSceneConfig, camera: VirtualCamera, pose: LayerTransform, point: Point2): Point2 | null {
  const c = calibration(config.width, config.height);
  return projectPoint(camera, layerWorldPoint(config, camera, pose, point), c.focalLength * .1);
}

/** Scene-space corners of the already evaluated sprite, before perspective.
 * `warp` supplies normalized local corners; omitting it reproduces the flat sprite. */
export function layerCorners(pose: LayerTransform, width: number, height: number, warp?: WarpCorners): [Point2, Point2, Point2, Point2] {
  const c = Math.cos(pose.roll * Math.PI / 180), s = Math.sin(pose.roll * Math.PI / 180);
  const corners = warp ?? flatCorners;
  const point = (x: number, y: number) => ({ x: pose.x + pose.scale * (x * c - y * s), y: pose.y + pose.scale * (x * s + y * c) });
  return corners.map(corner => point(corner.x * width / 2, corner.y * height / 2)) as [Point2, Point2, Point2, Point2];
}

/** Project every corner of a layer through the shared camera, applying the same
 * Parallax compensation to all four points so the plane is never distorted. */
export function projectLayerCorners(config: CameraSceneConfig, camera: VirtualCamera, pose: LayerTransform,
  corners: readonly [Point2, Point2, Point2, Point2]): [Point2, Point2, Point2, Point2] | null {
  const c = calibration(config.width, config.height);
  return projectCompensatedPlane(c, camera, pose.depth, corners, parallaxFactor(config, pose.id));
}

/** The projected center and local scale used by inspection, tracking and overlays. */
export function projectedLayerInfo(config: CameraSceneConfig, pose: LayerTransform, camera: VirtualCamera): LayerTransform | null {
  if (![pose.x, pose.y, pose.scale, pose.roll].every(Number.isFinite)) return null;
  const center = projectLayerPoint(config, camera, pose, { x: pose.x, y: pose.y });
  const radians = pose.roll * Math.PI / 180;
  const right = projectLayerPoint(config, camera, pose, {
    x: pose.x + pose.scale * Math.cos(radians),
    y: pose.y + pose.scale * Math.sin(radians),
  });
  if (!center || !right) return null;
  const dx = right.x - center.x, dy = right.y - center.y;
  return { ...pose, x: center.x, y: center.y, scale: Math.hypot(dx, dy), roll: Math.atan2(dy, dx) * 180 / Math.PI };
}
