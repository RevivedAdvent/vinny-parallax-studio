/**
 * Projection primitives for a calibrated 2.5D camera.
 *
 * World axes: X right, Y down, Z forward. Angles are radians; positive yaw
 * looks right, positive pitch looks down and positive roll rotates the camera
 * clockwise. A plane's neutral image-space coordinates are scaled by its
 * distance, so depth never changes the neutral composition.
 */
export interface Point2 { x: number; y: number }
export interface Point3 extends Point2 { z: number }
export interface VirtualCamera extends Point3 {
  yaw: number;
  pitch: number;
  roll: number;
  focalLength: number;
  principal: Point2;
  /** Optional optical effects, consumed by the shared renderer. */
  focus?: { depth: number; strength: number };
  motionBlur?: number;
}
export interface ProjectionCalibration {
  width: number;
  height: number;
  focalLength: number;
}

/** A long default lens keeps the complete scene comfortably in front of the camera. */
export function calibration(width: number, height: number): ProjectionCalibration {
  if (![width, height].every(v => Number.isFinite(v) && v > 0)) throw new Error('Invalid composition size');
  return { width, height, focalLength: 2 * Math.max(width, height) };
}

export function neutralCamera(c: ProjectionCalibration): VirtualCamera {
  return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0,
    focalLength: c.focalLength, principal: { x: c.width / 2, y: c.height / 2 } };
}

/** True when the camera is geometrically identical to the calibrated neutral view. */
export function isNeutralCamera(camera: VirtualCamera, c: ProjectionCalibration): boolean {
  return camera.x === 0 && camera.y === 0 && camera.z === 0 && camera.yaw === 0 && camera.pitch === 0
    && camera.roll === 0 && camera.focalLength === c.focalLength
    && camera.principal.x === c.width / 2 && camera.principal.y === c.height / 2;
}

/**
 * World-space parallax compensation for one layer.
 *
 * P is the layer point at its true effective depth. C is the shared virtual
 * camera position. response r = 1 is the physical baseline, 0 cancels camera
 * translation and values above 1 exaggerate it. Lens, rotation and the camera
 * instance itself are untouched.
 */
export function compensatedPoint(point: Point3, camera: Point3, response: number): Point3 {
  const compensation = 1 - response;
  return {
    x: point.x + compensation * camera.x,
    y: point.y + compensation * camera.y,
    z: point.z + compensation * camera.z,
  };
}

/** Background 0 is farther away; foreground 1 is nearer. */
export function planeDistance(c: ProjectionCalibration, depth: number): number {
  if (!Number.isFinite(depth) || depth < 0 || depth > 1) throw new Error('Invalid layer depth');
  return c.focalLength * (1.25 - .5 * depth);
}

/** Convert neutral scene pixels to a world point on the chosen image plane. */
export function planePoint(c: ProjectionCalibration, depth: number, point: Point2): Point3 {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Invalid plane point');
  const z = planeDistance(c, depth), factor = z / c.focalLength;
  return { x: (point.x - c.width / 2) * factor, y: (point.y - c.height / 2) * factor, z };
}

/** World-space direction of the ray through a screen point (not normalized). */
export function screenRay(camera: VirtualCamera, point: Point2): Point3 {
  const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
  const cr = Math.cos(camera.roll), sr = Math.sin(camera.roll);
  const u = (point.x - camera.principal.x) / camera.focalLength;
  const v = (point.y - camera.principal.y) / camera.focalLength;
  const r = u * cr - v * sr, d = u * sr + v * cr;
  return { x: sy * cp + r * cy - d * sy * sp, y: sp + d * cp,
    z: cy * cp - r * sy - d * cy * sp };
}

/** Project a world point, returning null rather than allowing a near-plane singularity. */
export function projectPoint(camera: VirtualCamera, point: Point3, near: number): Point2 | null {
  const values = [camera.x, camera.y, camera.z, camera.yaw, camera.pitch, camera.roll,
    camera.focalLength, camera.principal.x, camera.principal.y, point.x, point.y, point.z, near];
  if (!values.every(Number.isFinite) || camera.focalLength <= 0 || near <= 0) return null;
  const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
  const cr = Math.cos(camera.roll), sr = Math.sin(camera.roll);
  const dx = point.x - camera.x, dy = point.y - camera.y, dz = point.z - camera.z;
  const right = dx * cy - dz * sy;
  const down = -dx * sy * sp + dy * cp - dz * cy * sp;
  const forward = dx * sy * cp + dy * sp + dz * cy * cp;
  if (forward < near) return null;
  const x = camera.principal.x + camera.focalLength * (right * cr + down * sr) / forward;
  const y = camera.principal.y + camera.focalLength * (down * cr - right * sr) / forward;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/** Four image corners in clockwise order, suitable for Pixi's PerspectiveMesh.
 * If any corner crosses the near plane, callers must clip or reject the plane;
 * never feed a partial or singular quadrilateral to the renderer. */
export function projectPlane(c: ProjectionCalibration, camera: VirtualCamera, depth: number,
  corners: readonly [Point2, Point2, Point2, Point2], near = c.focalLength * .1): [Point2, Point2, Point2, Point2] | null {
  if (corners.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
  return finishProjectedPlane(c, corners.map(point => projectPoint(camera, planePoint(c, depth, point), near)));
}

/** Project a layer plane after applying its own Parallax response to every corner.
 * The shared camera is passed unchanged; only the world points are compensated. */
export function projectCompensatedPlane(c: ProjectionCalibration, camera: VirtualCamera, depth: number,
  corners: readonly [Point2, Point2, Point2, Point2], response: number, near = c.focalLength * .1): [Point2, Point2, Point2, Point2] | null {
  if (corners.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
  const projected = corners.map(point => projectPoint(camera,
    compensatedPoint(planePoint(c, depth, point), camera, response), near));
  return finishProjectedPlane(c, projected);
}

function finishProjectedPlane(c: ProjectionCalibration, projected: (Point2 | null)[]): [Point2, Point2, Point2, Point2] | null {
  const limit = Math.max(c.width, c.height) * 100;
  if (projected.some(point => point === null || Math.abs(point.x) > limit || Math.abs(point.y) > limit)) return null;
  const result = projected as [Point2, Point2, Point2, Point2];
  const cross = (a: Point2, b: Point2, d: Point2) => (b.x-a.x)*(d.y-a.y)-(b.y-a.y)*(d.x-a.x);
  // Pixi's homography is singular for a collapsed or folded quadrilateral.
  if (cross(result[0],result[1],result[2]) <= 1e-6 || cross(result[0],result[2],result[3]) <= 1e-6) return null;
  return result;
}
