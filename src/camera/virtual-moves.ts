import type { CameraSceneConfig, LayerTransform } from './types.ts';
import { clamp } from './easing.ts';
import { calibration, neutralCamera, planePoint, screenRay, type VirtualCamera } from './virtual-projection.ts';
import { applyAdvancedMove } from './advanced-moves.ts';

// Integrals of sin/cos(phi + rate * t); the zero-rate limits avoid cancellation.
const sinIntegral = (phi: number, rate: number, t: number) => Math.abs(rate) < 1e-8 ? t * Math.sin(phi) : (Math.cos(phi) - Math.cos(phi + rate * t)) / rate;
const cosIntegral = (phi: number, rate: number, t: number) => Math.abs(rate) < 1e-8 ? t * Math.cos(phi) : (Math.sin(phi + rate * t) - Math.sin(phi)) / rate;

/** Stateless, random-access evaluation; advanced transient effects use their own envelopes.
 * `base` lets camera-targeted tracks feed the same canonical camera before
 * movements compose on top. It is never a second independent camera.
 */
export function evaluateVirtualMoves(scene: CameraSceneConfig, seconds: number, intensity: number,
  targets: LayerTransform[], base?: VirtualCamera): VirtualCamera {
  const c = calibration(scene.width, scene.height);
  const camera: VirtualCamera = base ? { ...base, principal: { ...base.principal } } : neutralCamera(c);
  if (base?.focus) camera.focus = { ...base.focus };
  const cx = scene.width / 2, cy = scene.height / 2;
  const moves = [...(scene.cameraMoves ?? [])].sort((a, b) => a.start - b.start);
  for (const move of moves) {
    const t = clamp((seconds - move.start) / move.duration, 0, 1) * intensity;
    const advanced = applyAdvancedMove(camera, scene, move, seconds, intensity, targets);
    if (!advanced && (!t || move.type === 'reveal')) continue;
    if (!advanced) switch (move.type) {
      case 'push': case 'pull': {
        const target = planePoint(c, .5, { x: move.x, y: move.y });
        const dx = target.x - camera.x, dy = target.y - camera.y, dz = target.z - camera.z;
        const yaw = camera.yaw, pitch = camera.pitch;
        const dyaw = clamp(Math.atan2(dx, dz), -.35, .35) - yaw;
        const dpitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -.35, .35) - pitch;
        // Integrate the unit viewing direction while turning smoothly toward the
        // target. This gives constant physical speed and no initial pose jump.
        const distance = c.focalLength * (move.travel ?? 0) * (move.type === 'push' ? 1 : -1);
        camera.x += distance * (sinIntegral(yaw + pitch, dyaw + dpitch, t) + sinIntegral(yaw - pitch, dyaw - dpitch, t)) / 2;
        camera.y += distance * sinIntegral(pitch, dpitch, t);
        camera.z += distance * (cosIntegral(yaw + pitch, dyaw + dpitch, t) + cosIntegral(yaw - pitch, dyaw - dpitch, t)) / 2;
        camera.yaw += dyaw * t; camera.pitch += dpitch * t;
        break;
      }
      case 'zoom': {
        const requested = 1 + (move.scale - 1) * t;
        const factor = clamp(camera.focalLength * requested, c.focalLength * .25, c.focalLength * 4) / camera.focalLength;
        camera.focalLength *= factor;
        camera.principal.x = move.x + (camera.principal.x - move.x) * factor;
        camera.principal.y = move.y + (camera.principal.y - move.y) * factor;
        break;
      }
      case 'pan': camera.yaw += (Math.atan2(move.x - cx, c.focalLength) - camera.yaw) * t; break;
      case 'tilt': camera.pitch += (Math.atan2(move.y - cy, c.focalLength) - camera.pitch) * t; break;
      case 'truck': camera.x += (move.x - cx - camera.x) * t; break;
      case 'pedestal': camera.y += (move.y - cy - camera.y) * t; break;
      case 'diagonal':
        camera.x += (move.x - cx - camera.x) * t; camera.y += (move.y - cy - camera.y) * t; break;
      case 'crane': {
        // A circular boom arc with a fixed pivot, parameterized by angle. The
        // look-at adjustment is relative to the starting view, avoiding a jump.
        const target = planePoint(c, .5, { x: move.lookX!, y: move.lookY! });
        const radius = c.focalLength * 2;
        const startX = camera.x, startY = camera.y, startZ = camera.z;
        const angle = Math.asin(clamp((move.y - cy - startY) / radius, -.5, .5)) * t;
        camera.y += radius * Math.sin(angle);
        camera.z += radius * (1 - Math.cos(angle));
        const yawAt = (x: number, z: number) => Math.atan2(target.x - x, target.z - z);
        const pitchAt = (y: number, z: number) => Math.atan2(target.y - y, target.z - z);
        camera.yaw += yawAt(camera.x, camera.z) - yawAt(startX, startZ);
        camera.pitch += pitchAt(camera.y, camera.z) - pitchAt(startY, startZ);
        break;
      }
      case 'tracking': {
        const target = targets.find(layer => layer.id === move.layerId);
        if (!target) break;
        const world = planePoint(c, target.depth, target);
        const ray = screenRay(camera, { x: move.x, y: move.y });
        if (ray.z <= .1) break;
        const distance = (world.z - camera.z) / ray.z;
        if (distance <= c.focalLength * .1) break;
        const x = world.x - distance * ray.x, y = world.y - distance * ray.y;
        camera.x += (x - camera.x) * t; camera.y += (y - camera.y) * t;
        break;
      }
    }
    // Keep typical compositions safely in front of the camera even when moves overlap.
    camera.x = clamp(camera.x, -2 * c.focalLength, 2 * c.focalLength);
    camera.y = clamp(camera.y, -2 * c.focalLength, 2 * c.focalLength);
    camera.z = clamp(camera.z, -c.focalLength, .35 * c.focalLength);
    camera.yaw = clamp(camera.yaw, -.35, .35); camera.pitch = clamp(camera.pitch, -.35, .35);
    camera.roll = clamp(camera.roll, -Math.PI/6, Math.PI/6);
    camera.focalLength = clamp(camera.focalLength, c.focalLength * .25, c.focalLength * 4);
  }
  return camera;
}
